/**
 * Civic Engine — main-thread public API.
 *
 * This module is the public interface to the Civic Engine worker.
 *
 * Responsibilities:
 *
 * - Spawn the worker lazily.
 * - Send commands to the worker.
 * - Match worker responses to Promises.
 * - Expose bundle loading and rule evaluation.
 * - Expose optional data-query and ingestion capabilities.
 * - Recover from worker failure by allowing a new worker to spawn.
 *
 * Heavy computation remains inside worker.js.
 *
 * Consumers should import from the package entry point rather than
 * importing worker.js directly.
 */


// The worker is created lazily on the first API call.
let worker = null;


// Maps request IDs to their Promise handlers.
//
// Example:
//
//   17 → { resolve, reject }
//
// When worker.js returns:
//
//   { id: 17, result: ... }
//
// the corresponding Promise is resolved.
const pending = new Map();


// Monotonically increasing request ID.
let nextId = 0;


/**
 * Get the singleton worker for this page.
 *
 * The worker is created only when the first engine operation
 * actually needs it.
 */
function getWorker() {
  // Reuse the existing worker.
  if (worker) {
    return worker;
  }


  // Create the worker as an ES module.
  worker = new Worker(
    new URL('./worker.js', import.meta.url),
    {
      type: 'module'
    }
  );


  /**
   * Handle successful worker responses.
   */
  worker.onmessage = ({ data }) => {
    const handler = pending.get(data.id);

    // Ignore messages that do not correspond to a pending request.
    if (!handler) {
      return;
    }

    // Remove the request before resolving/rejecting it.
    pending.delete(data.id);

    if (data.error) {
      handler.reject(
        new Error(data.error)
      );
      return;
    }

    handler.resolve(data.result);
  };


  /**
   * Handle worker-level failures.
   *
   * A worker failure can otherwise leave Promises hanging forever,
   * so reject every request currently waiting on this worker.
   */
  worker.onerror = (error) => {
    for (const { reject } of pending.values()) {
      reject(error);
    }

    pending.clear();

    // Drop the broken worker so the next operation can create
    // a fresh one.
    worker = null;
  };


  return worker;
}


/**
 * Send a command to the worker and return a Promise for its result.
 *
 * @param {string} action
 * @param {Object} payload
 * @returns {Promise<any>}
 */
function send(action, payload = {}) {
  const id = nextId++;

  return new Promise((resolve, reject) => {
    // Store the Promise handlers until the worker responds.
    pending.set(id, {
      resolve,
      reject
    });

    try {
      getWorker().postMessage({
        id,
        action,
        payload
      });
    } catch (error) {
      // If postMessage itself fails, don't leave a dangling
      // Promise in the pending map.
      pending.delete(id);
      reject(error);
    }
  });
}


/**
 * Load a declarative Civic Engine bundle.
 *
 * The bundle remains associated with its bundleUrl inside the
 * worker. This is important because multiple bundles may contain
 * identical node IDs such as "start" or "checklist_main".
 *
 * @param {string} bundleUrl
 * @returns {Promise<Object>}
 */
export function loadBundle(bundleUrl) {
  if (!bundleUrl) {
    throw new Error(
      'loadBundle() requires a bundleUrl'
    );
  }

  return send(
    'loadBundle',
    {
      bundleUrl
    }
  );
}


/**
 * Evaluate a node within a specific bundle.
 *
 * IMPORTANT:
 *
 * bundleUrl is deliberately part of the public API.
 *
 * A node ID such as "start" is only unique within its bundle.
 * The engine therefore resolves:
 *
 *     (bundleUrl, nodeId)
 *
 * rather than nodeId globally.
 *
 * @param {string} bundleUrl
 * @param {string} nodeId
 * @param {Object} [flags={}]
 * @returns {Promise<Object>}
 */
export function evaluateNode(
  bundleUrl,
  nodeId,
  flags = {}
) {
  if (!bundleUrl) {
    throw new Error(
      'evaluateNode() requires a bundleUrl'
    );
  }

  if (!nodeId) {
    throw new Error(
      'evaluateNode() requires a nodeId'
    );
  }

  return send(
    'evaluateNode',
    {
      bundleUrl,
      nodeId,
      flags
    }
  );
}


/**
 * Run a tabular query against data loaded into the worker.
 *
 * This API is optional infrastructure for applications that need
 * local data querying. It is not required for simple decision-tree
 * bundles.
 *
 * @param {Object} query
 * @returns {Promise<any>}
 */
export function queryTable(query) {
  if (!query) {
    throw new Error(
      'queryTable() requires a query'
    );
  }

  return send(
    'queryTable',
    {
      query
    }
  );
}


/**
 * Stream-ingest a large data source.
 *
 * Progress is delivered through a MessageChannel because the worker
 * needs a dedicated communication path for progress events while
 * the normal request/response channel handles completion.
 *
 * @param {string|URL} source
 * @param {string} datasetId
 * @param {Function} [onProgress]
 * @returns {Promise<Object>}
 */
export function ingestStream(
  source,
  datasetId,
  onProgress
) {
  if (!source) {
    throw new Error(
      'ingestStream() requires a source'
    );
  }

  if (!datasetId) {
    throw new Error(
      'ingestStream() requires a datasetId'
    );
  }


  // Create a dedicated channel for progress events.
  const channel = new MessageChannel();


  // Listen for progress messages from the worker.
  channel.port1.onmessage = ({ data }) => {
    if (
      data?.type === 'progress' &&
      typeof onProgress === 'function'
    ) {
      onProgress(
        data.bytesRead,
        data.totalBytes
      );
    }
  };


  /**
   * IMPORTANT:
   *
   * MessagePort is not automatically transferred by structured
   * cloning. It must be included in the transfer list.
   *
   * The current send() helper therefore needs an optional
   * transfer-list parameter for this operation.
   */
  return sendWithTransfer(
    'ingestStream',
    {
      source: source.toString(),
      datasetId,
      port: channel.port2
    },
    [channel.port2]
  );
}


/**
 * Send a command with transferable objects.
 *
 * This is used for MessagePort and can also support other
 * transferable browser objects in the future.
 *
 * @param {string} action
 * @param {Object} payload
 * @param {Transferable[]} transferables
 */
function sendWithTransfer(
  action,
  payload,
  transferables
) {
  const id = nextId++;

  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject
    });

    try {
      getWorker().postMessage(
        {
          id,
          action,
          payload
        },
        transferables
      );
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}


/**
 * Terminate the worker immediately.
 *
 * This is useful when an application explicitly ends a session
 * or when MemoryGuard performs a privacy purge.
 */
export function terminateWorker() {
  if (!worker) {
    return;
  }

  worker.terminate();

  worker = null;


  // Reject requests that can no longer receive a response.
  const error = new Error(
    'Civic Engine worker terminated'
  );

  for (const { reject } of pending.values()) {
    reject(error);
  }

  pending.clear();
}
```
