/**
 * DuckDbQuery — wraps @duckdb/duckdb-wasm for in-worker analytical queries.
 *
 * DuckDB manages its own WASM linear memory and worker thread internally.
 * We run it inside our existing Web Worker, so all query execution stays
 * off the main thread.
 *
 * IMPORTANT: this module imports duckdb-wasm from a local, vendored copy
 * (see /vendor/duckdb-wasm/) rather than a CDN. This is deliberate: Civic
 * Engine's design goal is zero runtime dependency on third-party
 * infrastructure — fetching from a CDN at runtime would mean the app is
 * not actually offline-first on a fresh load, and would leak the fact that
 * a device is using Civic Engine to a third party (jsDelivr) on every
 * first use. To update the vendored version, download the release
 * artifacts from https://github.com/duckdb/duckdb-wasm and replace the
 * contents of /vendor/duckdb-wasm/.
 *
 * Falls back to the pure-JS path if DuckDB fails to load (old WebKit,
 * locked-down CSP, no WASM support, or the vendored files are missing).
 */

import * as duckdb from '../../vendor/duckdb-wasm/duckdb-browser.mjs';

// Bundle files are served from the same origin as the app — see
// /vendor/duckdb-wasm/README.md for how these paths are populated at build time.
const BUNDLES = {
  mvp: {
    mainModule: '/vendor/duckdb-wasm/duckdb-mvp.wasm',
    mainWorker: '/vendor/duckdb-wasm/duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: '/vendor/duckdb-wasm/duckdb-eh.wasm',
    mainWorker: '/vendor/duckdb-wasm/duckdb-browser-eh.worker.js',
  },
};

// Identifiers (dataset names, column names) must match this pattern before
// being interpolated into SQL. This is a strict allowlist, not an escape —
// bundle authors and dataset producers should never need characters outside
// this set for a table or column name.
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSafeIdentifier(name, label) {
  if (typeof name !== 'string' || !SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${label}: "${name}". Identifiers must match ${SAFE_IDENTIFIER}.`);
  }
  return name;
}

export class DuckDbQuery {
  constructor() {
    this._db = null;
    this._conn = null;
    this.ready = this._init();
  }

  async _init() {
    try {
      const bundle = await duckdb.selectBundle(BUNDLES);
      const worker = await duckdb.createWorker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      this._db = new duckdb.AsyncDuckDB(logger, worker);
      await this._db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this._conn = await this._db.connect();
    } catch (err) {
      console.warn('[civic-engine] DuckDB unavailable, using JS fallback:', err.message);
      this._db = null;
    }
  }

  /**
   * Register a CSV or NDJSON source as a named DuckDB table.
   * Called by worker.js ingestStream() instead of the old typed-array path.
   * @param {string} datasetId   logical table name
   * @param {string} source      fetchable URL
   * @param {Function} onProgress (bytesRead, totalBytes) => void
   */
  async ingest(datasetId, source, onProgress) {
    assertSafeIdentifier(datasetId, 'datasetId');

    if (!this._db) return this._ingestFallback(datasetId, source, onProgress);

    const resp = await fetch(source);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${source}`);
    const contentLength = Number(resp.headers.get('content-length') || 0);

    const chunks = [];
    let bytesRead = 0;
    const reader = resp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytesRead += value.byteLength;
      if (onProgress) onProgress(bytesRead, contentLength);
    }

    const buffer = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }

    const filename = `${datasetId}.csv`;
    await this._db.registerFileBuffer(filename, buffer);

    const ext = source.toString().endsWith('.ndjson') ? 'read_json_auto' : 'read_csv_auto';
    await this._conn.query(`CREATE OR REPLACE VIEW "${datasetId}" AS SELECT * FROM ${ext}('${filename}')`);

    const meta = await this._conn.query(`SELECT COUNT(*) as n FROM "${datasetId}"`);
    const rowCount = Number(meta.toArray()[0].n);
    const cols = await this._conn.query(`DESCRIBE "${datasetId}"`);
    const columns = cols.toArray().map(r => r.column_name);

    return { rowCount, columns };
  }

  /**
   * Execute a structured query against a registered dataset.
   * @param {Object} query  { dataset, columns, filters, sort, limit }
   */
  async run(query) {
    if (!this._db) return this._runFallback(query);
    const sql = this._buildSql(query);
    const result = await this._conn.query(sql);
    return result.toArray().map(row => Object.fromEntries(Object.entries(row)));
  }

  _buildSql({ dataset, columns, filters = [], sort, limit = 500 }) {
    assertSafeIdentifier(dataset, 'dataset');

    const safeColumns = (columns || []).map(c => assertSafeIdentifier(c, 'column'));
    const cols = safeColumns.length ? safeColumns.map(c => `"${c}"`).join(', ') : '*';

    const where = filters.map(({ column, op, value, bbox, center }) => {
      const col = column ? `"${assertSafeIdentifier(column, 'filter column')}"` : null;
      const val = typeof value === 'number' ? value : `'${String(value ?? '').replace(/'/g, "''")}'`;

      if (op === 'eq')       return `${col} = ${val}`;
      if (op === 'neq')      return `${col} != ${val}`;
      if (op === 'gt')       return `${col} > ${val}`;
      if (op === 'lt')       return `${col} < ${val}`;
      if (op === 'contains') return `${col} ILIKE '%${String(value).replace(/'/g, "''")}%'`;

      // Geo: bounding box — used for census block / voter registry spatial queries
      // bbox: { latCol, lngCol, minLat, maxLat, minLng, maxLng }
      if (op === 'bbox') {
        const latCol = assertSafeIdentifier(bbox.latCol, 'bbox.latCol');
        const lngCol = assertSafeIdentifier(bbox.lngCol, 'bbox.lngCol');
        return `"${latCol}" BETWEEN ${Number(bbox.minLat)} AND ${Number(bbox.maxLat)} ` +
               `AND "${lngCol}" BETWEEN ${Number(bbox.minLng)} AND ${Number(bbox.maxLng)}`;
      }

      // Geo: radius — Haversine approximation (accurate to ~0.5% at city scale)
      // center: { latCol, lngCol, lat, lng, km }
      if (op === 'within_km') {
        const latCol = assertSafeIdentifier(center.latCol, 'center.latCol');
        const lngCol = assertSafeIdentifier(center.lngCol, 'center.lngCol');
        const R = 6371; // Earth radius km
        const lat = Number(center.lat), lng = Number(center.lng), km = Number(center.km);
        const dLat = `RADIANS("${latCol}" - ${lat})`;
        const dLng = `RADIANS("${lngCol}" - ${lng})`;
        const a = `POW(SIN(${dLat}/2),2) + COS(RADIANS(${lat})) * COS(RADIANS("${latCol}")) * POW(SIN(${dLng}/2),2)`;
        return `${R} * 2 * ASIN(SQRT(${a})) <= ${km}`;
      }

      return 'TRUE';
    });

    let sql = `SELECT ${cols} FROM "${dataset}"`;
    if (where.length)  sql += ` WHERE ${where.join(' AND ')}`;
    if (sort)          sql += ` ORDER BY "${assertSafeIdentifier(sort.column, 'sort.column')}" ${sort.dir === 'desc' ? 'DESC' : 'ASC'}`;
    sql += ` LIMIT ${Number(limit) || 500}`;
    return sql;
  }

  // --- Pure-JS fallback (unchanged from original WasmQuery) ---

  _fallbackDatasets = new Map();

  async _ingestFallback(datasetId, source, onProgress) {
    const { StreamParser } = await import('./parser.js');
    const result = await new StreamParser().ingest(source, onProgress);
    this._fallbackDatasets.set(datasetId, result.index);
    return { rowCount: result.rowCount, columns: result.columns };
  }

  _runFallback({ dataset, columns, filters = [], sort, limit = 500 }) {
    const index = this._fallbackDatasets.get(dataset);
    if (!index) throw new Error(`Dataset not loaded: ${dataset}`);
    const rowCount = this._fallCountRows(index);
    let rows = Array.from({ length: rowCount }, (_, i) => this._fallGetRow(i, index));
    for (const { column, op, value } of filters) {
      rows = rows.filter(row => {
        const v = row[column];
        if (op === 'eq')       return v == value;
        if (op === 'neq')      return v != value;
        if (op === 'gt')       return Number(v) > Number(value);
        if (op === 'lt')       return Number(v) < Number(value);
        if (op === 'contains') return String(v).toLowerCase().includes(String(value).toLowerCase());
        return true;
      });
    }
    if (sort) {
      const { column, dir = 'asc' } = sort;
      rows.sort((a, b) => {
        const va = a[column], vb = b[column];
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return dir === 'desc' ? -cmp : cmp;
      });
    }
    const result = rows.slice(0, limit);
    return columns && columns.length
      ? result.map(row => Object.fromEntries(columns.map(c => [c, row[c]])))
      : result;
  }

  _fallCountRows(index) {
    const first = index.values().next().value;
    if (!first) return 0;
    return first instanceof Float64Array ? first.length : first.ids.length;
  }

  _fallGetRow(i, index) {
    const row = {};
    for (const [col, data] of index) {
      row[col] = data instanceof Float64Array ? data[i] : data.intern[data.ids[i]];
    }
    return row;
  }
}
