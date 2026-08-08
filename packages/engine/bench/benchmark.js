/**
 * Civic Engine — performance benchmark
 *
 * Generates synthetic census-scale tabular data and measures:
 *   1. Stream parse + ingest time
 *   2. Single-column filter query
 *   3. Multi-column filter + sort query
 *   4. Geo bounding-box query
 *
 * Run with: node --experimental-vm-modules bench/benchmark.js [rows]
 * Default: 200,000 rows (realistic census block file size ~18 MB CSV)
 */

import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROWS = parseInt(process.argv[2] || '200000', 10);

// ── Synthetic data generation ─────────────────────────────────────────────────

function generateCsv(rows) {
  const header = 'id,borough,district,population,median_income,registered_voters,lat,lng\n';
  const boroughs = ['Manhattan', 'Bronx', 'Brooklyn', 'Queens', 'Staten Island'];
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    const lat  = (40.4774 + Math.random() * 0.5).toFixed(6);
    const lng  = (-74.2591 + Math.random() * 0.5).toFixed(6);
    lines.push(
      `${i},${boroughs[i % 5]},District ${(i % 51) + 1},` +
      `${Math.floor(Math.random() * 5000 + 500)},` +
      `${Math.floor(Math.random() * 80000 + 25000)},` +
      `${Math.floor(Math.random() * 3000 + 100)},` +
      `${lat},${lng}\n`
    );
  }
  return lines.join('');
}

// ── In-process parser (mirrors worker.js logic without the worker overhead) ──

async function ingestCsv(csvPath) {
  const { StreamParser } = await import('../src/parser.js');
  const parser = new StreamParser();
  // Use file:// URL so fetch works in Node with --experimental-fetch
  return parser.ingest(new URL(`file://${csvPath}`));
}

// ── Query runner (pure-JS path, same as DuckDB fallback) ─────────────────────

function runQuery(index, { filters = [], sort, limit = 500 }) {
  const rowCount = (() => {
    const first = index.values().next().value;
    if (!first) return 0;
    return first instanceof Float64Array ? first.length : first.ids.length;
  })();

  const getRow = (i) => {
    const row = {};
    for (const [col, data] of index) {
      row[col] = data instanceof Float64Array ? data[i] : data.intern[data.ids[i]];
    }
    return row;
  };

  let rows = Array.from({ length: rowCount }, (_, i) => getRow(i));

  for (const { column, op, value, bbox } of filters) {
    if (op === 'bbox') {
      rows = rows.filter(r =>
        Number(r[bbox.latCol]) >= bbox.minLat && Number(r[bbox.latCol]) <= bbox.maxLat &&
        Number(r[bbox.lngCol]) >= bbox.minLng && Number(r[bbox.lngCol]) <= bbox.maxLng
      );
    } else {
      rows = rows.filter(r => {
        const v = r[column];
        if (op === 'eq')  return v == value;
        if (op === 'gt')  return Number(v) > Number(value);
        if (op === 'lt')  return Number(v) < Number(value);
        return true;
      });
    }
  }

  if (sort) {
    const { column, dir = 'asc' } = sort;
    rows.sort((a, b) => {
      const cmp = typeof a[column] === 'number' ? a[column] - b[column]
                                                : String(a[column]).localeCompare(String(b[column]));
      return dir === 'desc' ? -cmp : cmp;
    });
  }
  return rows.slice(0, limit);
}

// ── Benchmark runner ──────────────────────────────────────────────────────────

function mark(label, fn) {
  const start = performance.now();
  const result = fn();
  const ms = (performance.now() - start).toFixed(1);
  console.log(`  ${label.padEnd(40)} ${ms.padStart(7)} ms   ${result.length ?? result.rowCount ?? ''} rows`);
  return { ms: parseFloat(ms), result };
}

async function markAsync(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = (performance.now() - start).toFixed(1);
  const rows = result.rowCount ?? result.length ?? '';
  console.log(`  ${label.padEnd(40)} ${ms.padStart(7)} ms   ${rows} rows`);
  return { ms: parseFloat(ms), result };
}

async function run() {
  console.log(`\n╔══ Civic Engine Benchmark ══════════════════════════════╗`);
  console.log(`  Dataset: ${ROWS.toLocaleString()} rows synthetic census/voter data`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  // Write temp CSV
  const csvPath = join(tmpdir(), `civic_bench_${Date.now()}.csv`);
  console.log('  Generating CSV...');
  const csv = generateCsv(ROWS);
  writeFileSync(csvPath, csv);
  const fileMb = (csv.length / 1024 / 1024).toFixed(1);
  console.log(`  File size: ${fileMb} MB\n`);

  // 1. Ingest
  const { result: ingested } = await markAsync('Stream parse + columnar ingest', () => ingestCsv(csvPath));
  const { index } = ingested;
  console.log('');

  // 2–4. Queries
  mark('Single-column filter (borough = Brooklyn)',
    () => runQuery(index, { filters: [{ column: 'borough', op: 'eq', value: 'Brooklyn' }], limit: 10000 }));

  mark('Multi-column filter + sort (income > 60k, pop > 1000)',
    () => runQuery(index, {
      filters: [
        { column: 'median_income', op: 'gt', value: 60000 },
        { column: 'population', op: 'gt', value: 1000 },
      ],
      sort: { column: 'registered_voters', dir: 'desc' },
      limit: 500,
    }));

  mark('Geo bounding-box (midtown Manhattan ~4km²)',
    () => runQuery(index, {
      filters: [{
        op: 'bbox',
        bbox: { latCol: 'lat', lngCol: 'lng', minLat: 40.74, maxLat: 40.76, minLng: -74.00, maxLng: -73.97 },
      }],
      limit: 500,
    }));

  console.log('');
  unlinkSync(csvPath);
  console.log('  Temp file cleaned up.\n');
}

run().catch(err => { console.error(err); process.exit(1); });
