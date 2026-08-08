/**
 * StreamParser — pure-JS fallback ingestion.
 *
 * This parser is used only when DuckDB-WASM is unavailable.
 *
 * It runs inside Civic Engine's Web Worker, never on the main thread.
 *
 * Supported formats:
 *
 *   - CSV
 *   - NDJSON
 *
 * The parser produces:
 *
 *   {
 *     rowCount,
 *     columns,
 *     index
 *   }
 *
 * The index uses:
 *
 *   - Float64Array for numeric columns
 *   - { intern, ids } for string columns
 *
 * IMPORTANT:
 *
 * This is a compatibility fallback, not the primary analytical engine.
 * DuckDB-WASM should be preferred for large datasets.
 */


/**
 * StreamParser.
 */
export class StreamParser {

  /**
   * Fetch and parse a CSV or NDJSON source.
   *
   * @param {string|URL} source
   * @param {Function} [onProgress]
   * @returns {Promise<Object>}
   */
  async ingest(source, onProgress) {

    // Fetch the source from inside the worker.
    const response = await fetch(source);

    if (!response.ok) {
      throw new Error(
        `Fetch failed: ${response.status} ${source}`
      );
    }


    // The server may provide the total size.
    const contentLength = Number(
      response.headers.get('content-length') || 0
    );

    // Determine the input format.
    const contentType =
      response.headers.get('content-type') || '';

    const sourceString = source.toString();

    const isNdjson =
      contentType.includes('json') ||
      sourceString.toLowerCase().endsWith('.ndjson');


    // Streams API is required for this fallback.
    if (!response.body) {
      throw new Error(
        'Streaming responses are not supported by this browser'
      );
    }

    const reader = response.body.getReader();

    // TextDecoder lets us decode UTF-8 across chunk boundaries.
    const decoder = new TextDecoder('utf-8');


    let bytesRead = 0;

    /*
     * We retain parsed rows because the fallback index needs to be
     * constructed after parsing.
     *
     * This is intentionally not presented as a constant-memory parser.
     * For large datasets, DuckDB-WASM should be used instead.
     */
    const rows = [];


    if (isNdjson) {

      // NDJSON is line-oriented, so we can parse one complete line
      // at a time.
      await this._parseNdjson(
        reader,
        decoder,
        rows,
        onProgress,
        contentLength,
        source
      );

    } else {

      // CSV requires a character-level parser because quoted fields
      // may contain commas and newlines.
      await this._parseCsv(
        reader,
        decoder,
        rows,
        onProgress,
        contentLength,
        source
      );
    }


    // Build the columnar fallback index.
    return this._buildIndex(rows);
  }


  /**
   * Parse NDJSON from a streaming reader.
   *
   * Each non-empty line must contain one complete JSON object.
   */
  async _parseNdjson(
    reader,
    decoder,
    rows,
    onProgress,
    contentLength,
    source
  ) {

    let buffer = '';
    let bytesRead = 0;


    while (true) {

      const { done, value } = await reader.read();

      if (done) {
        break;
      }


      bytesRead += value.byteLength;

      if (onProgress) {
        onProgress(
          bytesRead,
          contentLength
        );
      }


      buffer += decoder.decode(
        value,
        { stream: true }
      );


      const lines = buffer.split('\n');

      // Preserve the incomplete final line.
      buffer = lines.pop();


      for (const line of lines) {

        const trimmed = line.trim();

        if (!trimmed) {
          continue;
        }


        try {

          rows.push(
            JSON.parse(trimmed)
          );

        } catch (error) {

          throw new Error(
            `Invalid NDJSON at approximately byte ${bytesRead}: ${error.message}`
          );
        }
      }
    }


    // Flush any remaining UTF-8 decoder state.
    buffer += decoder.decode();


    const finalLine = buffer.trim();

    if (finalLine) {

      try {

        rows.push(
          JSON.parse(finalLine)
        );

      } catch (error) {

        throw new Error(
          `Invalid NDJSON at end of ${source}: ${error.message}`
        );
      }
    }
  }


  /**
   * Parse CSV while respecting:
   *
   *   - quoted fields
   *   - commas inside quoted fields
   *   - escaped quotes ("")
   *   - newlines inside quoted fields
   */
  async _parseCsv(
    reader,
    decoder,
    rows,
    onProgress,
    contentLength,
    source
  ) {

    let buffer = '';
    let bytesRead = 0;

    let headers = null;


    while (true) {

      const { done, value } = await reader.read();

      if (done) {
        break;
      }


      bytesRead += value.byteLength;

      if (onProgress) {
        onProgress(
          bytesRead,
          contentLength
        );
      }


      buffer += decoder.decode(
        value,
        { stream: true }
      );


      /*
       * Extract complete CSV records from the buffer.
       *
       * A record is complete only when we encounter a newline
       * outside of a quoted field.
       */
      let recordStart = 0;
      let inQuote = false;


      for (let i = 0; i < buffer.length; i++) {

        const ch = buffer[i];


        if (ch === '"') {

          // Two quotes inside a quoted field represent one
          // literal quote.
          if (
            inQuote &&
            buffer[i + 1] === '"'
          ) {
            i++;
            continue;
          }

          inQuote = !inQuote;

          continue;
        }


        // A newline outside quotes terminates a CSV record.
        if (
          (ch === '\n' || ch === '\r') &&
          !inQuote
        ) {

          let record = buffer.slice(
            recordStart,
            i
          );


          // Handle Windows CRLF.
          if (
            ch === '\r' &&
            buffer[i + 1] === '\n'
          ) {
            i++;
          }


          recordStart = i + 1;


          if (!record.trim()) {
            continue;
          }


          const fields =
            this._parseCsvRecord(record);


          if (!headers) {

            headers = fields;

          } else {

            rows.push(
              this._fieldsToRow(
                headers,
                fields
              )
            );
          }
        }
      }


      // Preserve the incomplete record for the next chunk.
      buffer = buffer.slice(recordStart);
    }


    // Flush remaining decoder state.
    buffer += decoder.decode();


    // Parse final CSV record.
    if (buffer.trim()) {

      const fields =
        this._parseCsvRecord(buffer);


      if (!headers) {

        headers = fields;

      } else {

        rows.push(
          this._fieldsToRow(
            headers,
            fields
          )
        );
      }
    }


    // An empty CSV is valid.
    if (!headers && rows.length === 0) {
      return;
    }
  }


  /**
   * Convert CSV fields into an object using the header row.
   */
  _fieldsToRow(headers, fields) {

    const row = {};


    for (let i = 0; i < headers.length; i++) {

      const column = headers[i];

      row[column] =
        fields[i] ?? '';
    }


    return row;
  }


  /**
   * Parse one complete CSV record.
   *
   * Handles:
   *
   *   a,b,c
   *   "a,b",c
   *   "a""b",c
   */
  _parseCsvRecord(record) {

    const fields = [];

    let current = '';

    let inQuote = false;


    for (
      let i = 0;
      i < record.length;
      i++
    ) {

      const ch = record[i];


      if (ch === '"') {

        if (
          inQuote &&
          record[i + 1] === '"'
        ) {

          current += '"';

          i++;

        } else {

          inQuote = !inQuote;
        }

        continue;
      }


      if (
        ch === ',' &&
        !inQuote
      ) {

        fields.push(current);

        current = '';

        continue;
      }


      current += ch;
    }


    if (inQuote) {
      throw new Error(
        'Malformed CSV: unterminated quoted field'
      );
    }


    fields.push(current);

    return fields;
  }


  /**
   * Build the columnar fallback index.
   *
   * Numeric columns become Float64Array.
   *
   * String columns use dictionary encoding:
   *
   *   {
   *     intern: ['New York', 'Boston'],
   *     ids: Uint32Array(...)
   *   }
   *
   * This keeps repeated strings from being stored repeatedly.
   */
  _buildIndex(rows) {

    if (!rows.length) {

      return {
        rowCount: 0,
        columns: [],
        index: new Map()
      };
    }


    // Use the first row to determine the column set.
    const columns =
      Object.keys(rows[0]);


    const index = new Map();


    for (const column of columns) {

      const values =
        rows.map(row => row[column] ?? '');


      /*
       * Treat a column as numeric only when every value is
       * non-empty and can be converted to a finite number.
       */
      const allNumeric =
        values.length > 0 &&
        values.every(value => {

          if (value === '') {
            return false;
          }

          const number = Number(value);

          return Number.isFinite(number);
        });


      if (allNumeric) {

        index.set(
          column,
          new Float64Array(
            values.map(Number)
          )
        );

        continue;
      }


      /*
       * Dictionary-encode string values.
       *
       * Instead of:
       *
       *   ['NY', 'NY', 'NY', 'Boston']
       *
       * store:
       *
       *   intern = ['NY', 'Boston']
       *   ids    = [0, 0, 0, 1]
       */
      const intern = [];

      const internMap = new Map();

      const ids =
        new Uint32Array(
          values.length
        );


      for (
        let i = 0;
        i < values.length;
        i++
      ) {

        const value =
          String(values[i]);


        let id =
          internMap.get(value);


        if (id === undefined) {

          id = intern.length;

          internMap.set(
            value,
            id
          );

          intern.push(value);
        }


        ids[i] = id;
      }


      index.set(
        column,
        {
          intern,
          ids
        }
      );
    }


    return {
      rowCount: rows.length,
      columns,
      index
    };
  }
}
