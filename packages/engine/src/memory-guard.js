/**
 * MemoryGuard — best-effort session state clearing.
 *
 * Registers listeners for tab close/navigation and background
 * transitions.
 *
 * On a purge signal, it:
 *
 * 1. Recursively clears registered state objects in place, then
 *    drops the references held by the application container.
 *
 * 2. Removes registered localStorage keys.
 *
 * 3. Calls registered purge callbacks, such as worker termination.
 *
 * IMPORTANT — limitations:
 *
 * This is a best-effort data-minimization mechanism. It is NOT a
 * cryptographic erasure mechanism and does not provide a forensic
 * guarantee.
 *
 * JavaScript strings are immutable. Assigning a new value does not
 * physically overwrite the previous string in memory. JavaScript
 * engines may also maintain copies through JIT compilation, string
 * interning, garbage collection, memory compaction, browser
 * snapshots, or other implementation details outside application
 * control.
 *
 * Therefore, MemoryGuard cannot guarantee that sensitive data has
 * been physically erased from device memory.
 *
 * What it DOES accomplish:
 *
 * - Removes sensitive objects from reachable application state.
 * - Removes registered localStorage entries.
 * - Invokes registered cleanup callbacks.
 * - Can terminate workers and other application resources.
 * - Reduces the amount of sensitive data retained by the application.
 *
 * What it DOES NOT accomplish:
 *
 * - Guaranteed physical memory erasure.
 * - Protection against a compromised browser or operating system.
 * - Protection against browser/device memory inspection.
 * - Guaranteed execution of JavaScript during every form of
 *   browser/process termination.
 *
 * Usage:
 *
 *   import { MemoryGuard } from './memory-guard.js';
 *
 *   const guard = new MemoryGuard({
 *     hiddenPurgeDelayMs: 5 * 60 * 1000
 *   });
 *
 *   guard.trackState(ctx, 'sessionState');
 *   guard.trackStorage('civic_session_state');
 *   guard.onPurge(() => worker.terminate());
 *
 *   // Manual purge:
 *   guard.purgeNow();
 *
 *   // When the application no longer needs the guard:
 *   guard.destroy();
 */

export class MemoryGuard {
  /**
   * @param {Object} [options]
   * @param {number} [options.hiddenPurgeDelayMs]
   * How long to wait after the document becomes hidden before
   * purging.
   *
   * Defaults to 0, meaning immediate purge.
   *
   * A longer value can be appropriate for multi-step intake
   * applications where a user may temporarily switch apps.
   */
  constructor(options = {}) {
    // Containers holding references to live application state.
    //
    // Each entry has the form:
    // { container: object, key: string }
    this._stateRefs = [];

    // localStorage keys that should be removed during purge.
    this._storageKeys = [];

    // Functions that should execute during purge.
    //
    // Examples:
    // - worker.terminate()
    // - close database connections
    // - clear application-specific caches
    this._callbacks = [];

    // Configure the background purge delay.
    //
    // Nullish coalescing allows an explicit 0 value.
    this._hiddenPurgeDelayMs =
      options.hiddenPurgeDelayMs ?? 0;

    // Timer used for delayed background purges.
    this._hiddenTimer = null;

    // Prevent multiple purge executions.
    //
    // pagehide, beforeunload, and visibilitychange can all produce
    // termination/background signals, so purge must be idempotent.
    this._purged = false;

    // Track whether the guard has been destroyed.
    this._destroyed = false;

    // Store bound event handlers so they can later be removed.
    this._boundPurge = this._purge.bind(this);
    this._boundVisibility =
      this._onVisibility.bind(this);

    /**
     * pagehide is generally preferable to unload because it is
     * compatible with browsers that use the back-forward cache.
     *
     * It is still only a best-effort lifecycle signal.
     */
    window.addEventListener(
      'pagehide',
      this._boundPurge
    );

    /**
     * visibilitychange detects the document becoming hidden.
     *
     * This supports the optional delayed background purge.
     */
    document.addEventListener(
      'visibilitychange',
      this._boundVisibility
    );

    /**
     * beforeunload is retained as a legacy fallback.
     *
     * It is not treated as a guaranteed termination signal,
     * especially on mobile browsers.
     */
    window.addEventListener(
      'beforeunload',
      this._boundPurge
    );
  }

  /**
   * Register a live state object.
   *
   * The guard stores the container and property name rather than
   * the state value itself.
   *
   * Example:
   *
   *   guard.trackState(ctx, 'sessionState');
   *
   * If ctx.sessionState contains:
   *
   *   {
   *     name: 'Alice',
   *     answers: {
   *       address: '...'
   *     }
   *   }
   *
   * the guard can recursively clear the object during purge.
   *
   * @param {Object} container
   * @param {string} key
   * @returns {MemoryGuard}
   */
  trackState(container, key) {
    // Do not accept invalid registrations.
    if (!container || typeof container !== 'object') {
      throw new TypeError(
        'trackState requires an object container'
      );
    }

    if (typeof key !== 'string' || !key) {
      throw new TypeError(
        'trackState requires a property name'
      );
    }

    // Store the reference to the container and property.
    this._stateRefs.push({
      container,
      key
    });

    return this;
  }

  /**
   * Register a localStorage key to remove during purge.
   *
   * @param {string} key
   * @returns {MemoryGuard}
   */
  trackStorage(key) {
    if (typeof key !== 'string' || !key) {
      throw new TypeError(
        'trackStorage requires a storage key'
      );
    }

    this._storageKeys.push(key);

    return this;
  }

  /**
   * Register a cleanup callback.
   *
   * Examples:
   *
   *   guard.onPurge(() => worker.terminate());
   *
   *   guard.onPurge(() => database.close());
   *
   * @param {Function} fn
   * @returns {MemoryGuard}
   */
  onPurge(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(
        'onPurge requires a function'
      );
    }

    this._callbacks.push(fn);

    return this;
  }

  /**
   * Manually trigger an immediate purge.
   *
   * This is useful for an explicit "End Session" action.
   */
  purgeNow() {
    // Stop any pending delayed purge.
    this._clearHiddenTimer();

    // Execute the same purge path used by lifecycle events.
    this._purge();
  }

  /**
   * Handle document visibility changes.
   */
  _onVisibility() {
    // Ignore events after the guard has been destroyed.
    if (this._destroyed || this._purged) {
      return;
    }

    if (document.visibilityState === 'hidden') {
      /**
       * If no delay was configured, purge immediately.
       */
      if (this._hiddenPurgeDelayMs <= 0) {
        this._purge();
        return;
      }

      /**
       * Avoid creating multiple timers if several visibility
       * events occur while the document remains hidden.
       */
      this._clearHiddenTimer();

      // Schedule the delayed purge.
      this._hiddenTimer = setTimeout(() => {
        this._hiddenTimer = null;

        // Only purge if the document is still hidden.
        if (
          document.visibilityState === 'hidden'
        ) {
          this._purge();
        }
      }, this._hiddenPurgeDelayMs);
    } else {
      // The document became visible again.
      //
      // If the delayed purge has not happened yet, cancel it.
      this._clearHiddenTimer();
    }
  }

  /**
   * Cancel a pending hidden-state purge.
   */
  _clearHiddenTimer() {
    if (this._hiddenTimer !== null) {
      clearTimeout(this._hiddenTimer);
      this._hiddenTimer = null;
    }
  }

  /**
   * Execute the complete purge.
   *
   * This method is deliberately idempotent. Multiple lifecycle
   * events can invoke it without causing repeated cleanup work.
   */
  _purge() {
    // Do nothing if the guard has already been destroyed.
    if (this._destroyed) {
      return;
    }

    // Do nothing if the session has already been purged.
    if (this._purged) {
      return;
    }

    // Mark the session as purged immediately.
    //
    // This prevents re-entrant purge calls from repeating cleanup.
    this._purged = true;

    // Cancel any pending delayed purge.
    this._clearHiddenTimer();

    /**
     * Clear all registered state objects.
     *
     * The state is recursively cleared first, then the containing
     * property is set to null so the application no longer has
     * a reference to the state through that property.
     */
    for (const { container, key } of this._stateRefs) {
      try {
        const obj = container[key];

        // Recursively clear object properties.
        if (
          obj &&
          typeof obj === 'object'
        ) {
          this._clear(obj);
        }

        // Remove the application's reference.
        container[key] = null;
      } catch (_) {
        // One failed state reference must not prevent the
        // remaining state from being purged.
      }
    }

    /**
     * Remove registered localStorage entries.
     */
    for (const key of this._storageKeys) {
      try {
        localStorage.removeItem(key);
      } catch (_) {
        // Storage may be unavailable, blocked, or inaccessible.
        //
        // Continue purging the remaining resources.
      }
    }

    /**
     * Execute application-specific cleanup callbacks.
     *
     * Each callback is isolated so that one failure does not
     * prevent the remaining callbacks from executing.
     */
    for (const fn of this._callbacks) {
      try {
        fn();
      } catch (_) {
        // Continue the purge chain even if a callback fails.
      }
    }

    /**
     * Release the guard's references to the registered resources.
     *
     * This is particularly important for a reusable framework:
     * the MemoryGuard itself should not become a long-lived holder
     * of references to sensitive session objects.
     */
    this._stateRefs.length = 0;
    this._storageKeys.length = 0;
    this._callbacks.length = 0;
  }

  /**
   * Recursively clear object properties.
   *
   * IMPORTANT:
   *
   * This does not guarantee physical memory erasure.
   * It makes the values unreachable through the registered
   * application object graph.
   *
   * @param {Object} obj
   */
  _clear(obj) {
    // Ignore null and non-object values.
    if (
      !obj ||
      typeof obj !== 'object'
    ) {
      return;
    }

    // Traverse enumerable own properties.
    for (const key of Object.keys(obj)) {
      const value = obj[key];

      // Recursively clear nested objects and arrays.
      if (
        value &&
        typeof value === 'object'
      ) {
        this._clear(value);
      }

      /**
       * Remove the reference from the containing object.
       *
       * For primitives, this replaces the value directly.
       * For objects, the recursive call above first removes
       * their nested references.
       */
      try {
        obj[key] = null;
      } catch (_) {
        // Some objects may expose read-only properties.
        //
        // Continue clearing other properties.
      }
    }
  }

  /**
   * Dispose of the MemoryGuard itself.
   *
   * This removes event listeners and cancels timers.
   *
   * destroy() does NOT automatically purge session data.
   *
   * Use purgeNow() when the intention is to erase the current
   * session, then destroy() if the guard is no longer needed.
   */
  destroy() {
    // Avoid repeating destruction.
    if (this._destroyed) {
      return;
    }

    // Cancel delayed work.
    this._clearHiddenTimer();

    // Remove lifecycle listeners.
    window.removeEventListener(
      'pagehide',
      this._boundPurge
    );

    window.removeEventListener(
      'beforeunload',
      this._boundPurge
    );

    document.removeEventListener(
      'visibilitychange',
      this._boundVisibility
    );

    // Mark the guard as destroyed.
    this._destroyed = true;

    // Release any remaining references.
    this._stateRefs.length = 0;
    this._storageKeys.length = 0;
    this._callbacks.length = 0;
  }
}

