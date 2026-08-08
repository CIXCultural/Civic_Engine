/**
 * Civic Engine — Web Worker
 *
 * All CPU-bound work runs here, off the main thread:
 *
 * - Stream parsing (CSV / NDJSON)
 * - In-memory indexing
 * - Rule tree evaluation
 * - WASM query execution
 */

import { RuleEvaluator } from './evaluator.js';
import { DuckDbQuery } from './wasm-query.js';

const evaluator = new RuleEvaluator();
const db = new DuckDbQuery();

// Keyed by bundleUrl.
// Each entry contains the loaded jurisdiction bundle.
const bundles = new Map();

/**
 * Load and register a jurisdiction-specific rule bundle.
 */
async function loadBundle({ bundleUrl }) {
  // Avoid downloading the same bundle twice.
  if (bundles.has(bundleUrl)) {
    return { cached: true };
  }

  // Fetch the bundle from the configured source.
  const resp = await fetch(bundleUrl);

  if (!resp.ok) {
    throw new Error(
      `Bundle fetch failed: ${resp.status} ${bundleUrl}`
    );
  }

  // Parse the bundle as JSON.
  const bundle = await resp.json();

  // Perform the minimum runtime schema check.
  // Full JSON Schema validation remains in @civic-engine/schema.
  if (!bundle.version || !bundle.nodes) {
    throw new Error(
      'Invalid bundle: missing version or nodes'
    );
  }

  // Store the bundle using its URL as its namespace.
  bundles.set(bundleUrl, bundle);

  // Register the bundle with the evaluator using the same namespace.
  evaluator.register(bundleUrl, bundle);

  return {
    loaded: true,
    version: bundle.version,
    nodeCount: Object.keys(bundle.nodes).length
  };
}

/**
 * Evaluate a node inside a specific jurisdiction bundle.
 *
 * bundleUrl is deliberately required so that two bundles can
 * safely contain the same node ID, such as "start".
 */
async function evaluateNode({ bundleUrl, nodeId, flags }) {
  if (!bundleUrl) {
    throw new Error('bundleUrl is required for node evaluation');
  }

  // Prevent accidental evaluation against an unloaded bundle.
  if (!bundles.has(bundleUrl)) {
    throw new Error(`Bundle is not loaded: ${bundleUrl}`);
  }

  // Resolve only inside the explicitly selected bundle.
  return evaluator.resolve(bundleUrl, nodeId, flags);
}

/**
 * Execute a SQL query through DuckDB-WASM or the JS fallback.
 */
async function queryTable({ query }) {
  // Wait for the query engine to finish initialization.
  await db.ready;

  // Execute the query.
  return db.run(query);
}

/**
 * Stream a dataset into the local query engine.
 */
async function ingestStream({ source, datasetId, port }) {
  // Wait for the query engine to finish initialization.
  await db.ready;

  // Ingest the stream while reporting progress back to the main thread.
  const result = await db.ingest(
    datasetId,
    source,
    (bytesRead, totalBytes) => {
      port.postMessage({
        type: 'progress',
        bytesRead,
        totalBytes
      });
    }
  );

  // Close the progress channel when ingestion is complete.
  port.close();

  return {
    rows: result.rowCount,
    columns: result.columns
  };
}

// Map message actions to their handlers.
const handlers = {
  loadBundle,
  evaluateNode,
  queryTable,
  ingestStream
};

/**
 * Main Web Worker message dispatcher.
 */
self.onmessage = async ({ data: { id, action, payload } }) => {
  try {
    // Reject unknown actions explicitly.
    if (!handlers[action]) {
      throw new Error(`Unknown action: ${action}`);
    }

    // Execute the requested operation.
    //
    // NOTE: this must be `payload`.
    // The `https://claude.ai/chat/payload` text in the pasted
    // version is invalid JavaScript and appears to be a paste artifact.
    const result = await handlers[action](payload);

    // Return the successful result to the main thread.
    self.postMessage({
      id,
      result
    });
  } catch (err) {
    // Normalize the error into a serializable response.
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err)
    });
  }
};
