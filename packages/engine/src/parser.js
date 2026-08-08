/**
 * StreamParser — processes CSV and NDJSON via the Streams API.
 *
 * Designed for the worker thread. Never instantiated on the main thread.
 * Outputs a columnar index (typed Float64Array per numeric column,
 * string intern table per text column) suitable for WASM query ingestion.
 */

const CHUNK_SIZE_DEFAULT = 64 * 1024; // 64 KB

/**
 * Pick a read chunk size based on available memory.
 * navigator.deviceMemory is in GB (0.25 / 0.5 / 1 / 2 / 4 / 8).
 * Falls back to 64 KB on legacy browsers that don't expose it.
 * Keeps peak memory pressure low on devices with ≤1 GB RAM.
 */
function adaptiveChunkSize() {
  const gb = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 1;
  if (gb <= 0.5) return 32 * 1024;   // 32 KB — very low-end phones
  if (gb <= 1)   return 64 * 1024;   // 64 KB — budget smartphones
  if (gb <= 2)   return 128 * 1024;  // 128 KB — mid-range
  return 256 * 1024;                  // 256 KB — desktop / high-end
}

export class StreamParser {
  /**
   * Fetch and parse a remote or local URL, reporting progress.
   * Returns { rowCount, columns, index } where index is a Map<colName, TypedArray|string[]>.
   */
  async ingest(source, onProgress) {
    const resp = await fetch(source);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${source}`);

    const contentLength = Number(resp.headers.get('content-length') || 0);
    const contentType = resp.headers.get('content-type') || '';
    const isNdjson = contentType.includes('json') || source.toString().endsWith('.ndjson');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let leftover = '';
    let bytesRead = 0;
    const rows = [];

    let headers = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.byteLength;
      if (onProgress) onProgress(bytesRead, contentLength);

      const chunk = leftover + decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      leftover = lines.pop(); // incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (isNdjson) {
          rows.push(JSON.parse(trimmed));
        } else {
          // CSV
          const fields = this._parseCsvLine(trimmed);
          if (!headers) { headers = fields; continue; }
          const row = {};
          headers.forEach((h, i) => { row[h] = fields[i] ?? ''; });
          rows.push(row);
        }
      }
    }

    // Flush leftover
    if (leftover.trim()) {
      if (isNdjson) rows.push(JSON.parse(leftover.trim()));
      else if (headers) {
        const fields = this._parseCsvLine(leftover.trim());
        const row = {};
        headers.forEach((h, i) => { row[h] = fields[i] ?? ''; });
        rows.push(row);
      }
    }

    return this._buildIndex(rows);
  }

  _parseCsvLine(line) {
    const fields = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(current); current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  _buildIndex(rows) {
    if (!rows.length) return { rowCount: 0, columns: [], index: new Map() };
    const columns = Object.keys(rows[0]);
    const index = new Map();

    for (const col of columns) {
      const values = rows.map(r => r[col]);
      const allNumeric = values.every(v => v !== '' && !isNaN(Number(v)));
      if (allNumeric) {
        index.set(col, new Float64Array(values.map(Number)));
      } else {
        // Intern strings: store as { intern: string[], ids: Uint32Array }
        const intern = [];
        const internMap = new Map();
        const ids = new Uint32Array(values.length);
        for (let i = 0; i < values.length; i++) {
          const v = String(values[i]);
          if (!internMap.has(v)) { internMap.set(v, intern.length); intern.push(v); }
          ids[i] = internMap.get(v);
        }
        index.set(col, { intern, ids });
      }
    }

    return { rowCount: rows.length, columns, index };
  }
}
