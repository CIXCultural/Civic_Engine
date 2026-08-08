/**
 * DuckDbQuery — wraps @duckdb/duckdb-wasm for in-worker analytical queries.
 *
 * DuckDB manages its own WASM linear memory and worker thread internally.
 * We run it inside our existing Web Worker, so all query execution stays
 * off the main thread. The 5 MB WASM binary is fetched once and cached by
 * the browser's HTTP cache / service worker on subsequent loads.
 *
 * Falls back to the pure-JS path if DuckDB fails to load (old WebKit,
 * locked-down CSP, or no WASM support).
 */

import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm';

const BUNDLES = duckdb.getJsDelivrBundles();

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
    if (!this._db) return this._ingestFallback(datasetId, source, onProgress);

    // Stream the file into DuckDB's virtual filesystem, then register as a view.
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

    // DuckDB auto-detects CSV vs JSON; CREATE VIEW keeps it lazy (no full scan on ingest)
    const ext = source.toString().endsWith('.ndjson') ? 'read_json_auto' : 'read_csv_auto';
    await this._conn.query(`CREATE OR REPLACE VIEW "${datasetId}" AS SELECT * FROM ${ext}('${filename}')`);

    // Return column names and row count for the caller
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
    const cols = columns && columns.length ? columns.map(c => `"${c}"`).join(', ') : '*';

    const where = filters.map(({ column, op, value, bbox, center }) => {
      const col = column ? `"${column}"` : null;
      const val = typeof value === 'number' ? value : `'${String(value ?? '').replace(/'/g, "''")}'`;

      if (op === 'eq')       return `${col} = ${val}`;
      if (op === 'neq')      return `${col} != ${val}`;
      if (op === 'gt')       return `${col} > ${val}`;
      if (op === 'lt')       return `${col} < ${val}`;
      if (op === 'contains') return `${col} ILIKE '%${String(value).replace(/'/g, "''")}%'`;

      // Geo: bounding box — used for census block / voter registry spatial queries
      // bbox: { latCol, lngCol, minLat, maxLat, minLng, maxLng }
      if (op === 'bbox') {
        return `"${bbox.latCol}" BETWEEN ${bbox.minLat} AND ${bbox.maxLat} ` +
               `AND "${bbox.lngCol}" BETWEEN ${bbox.minLng} AND ${bbox.maxLng}`;
      }

      // Geo: radius — Haversine approximation (accurate to ~0.5% at city scale)
      // center: { latCol, lngCol, lat, lng, km }
      if (op === 'within_km') {
        const R = 6371; // Earth radius km
        const dLat = `RADIANS("${center.latCol}" - ${center.lat})`;
        const dLng = `RADIANS("${center.lngCol}" - ${center.lng})`;
        const a = `POW(SIN(${dLat}/2),2) + COS(RADIANS(${center.lat})) * COS(RADIANS("${center.latCol}")) * POW(SIN(${dLng}/2),2)`;
        return `${R} * 2 * ASIN(SQRT(${a})) <= ${center.km}`;
      }

      return 'TRUE';
    });

    let sql = `SELECT ${cols} FROM "${dataset}"`;
    if (where.length)  sql += ` WHERE ${where.join(' AND ')}`;
    if (sort)          sql += ` ORDER BY "${sort.column}" ${sort.dir === 'desc' ? 'DESC' : 'ASC'}`;
    sql += ` LIMIT ${Number(limit)}`;
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
