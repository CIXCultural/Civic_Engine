/**
 * MemoryGuard — best-effort session state clearing.
 *
 * Registers listeners for tab close/navigation and background transitions.
 * On a termination signal, it:
 *   1. Overwrites all registered state objects in place, then drops the
 *      reference, so purged data is no longer reachable from application
 *      state
 *   2. Removes all registered localStorage keys
 *   3. Calls registered purge callbacks (e.g. to terminate workers)
 *
 * IMPORTANT — what this does and does not guarantee:
 * This is a best-effort mitigation, not a cryptographic or forensic
 * guarantee. JavaScript strings are immutable: "overwriting" a string
 * creates a new string and reassigns the reference, but it does not
 * physically overwrite the original data in memory. Engine-level copies
 * (JIT compilation, string interning, GC compaction) may leave residual
 * data in memory this code has no access to, and garbage collection timing
 * is not controllable from application code. This reduces the window and
 * surface area of exposure (so data is no longer reachable from app state,
 * localStorage is cleared, workers are torn down) but it does not defeat
 * a determined attacker with memory-inspection access to the device.
 *
 * Usage:
 *   import { MemoryGuard } from './memory-guard.js';
 *   const guard = new MemoryGuard({ hiddenPurgeDelayMs: 5 * 60 * 1000 });
 *   guard.trackState(stateRef, 'sessionState');
 *   guard.trackStorage('ce_miami_state');
 *   guard.onPurge(() => worker.terminate());
 */
export class MemoryGuard {
  /**
   * @param {Object} [options]
   * @param {number} [options.hiddenPurgeDelayMs] - How long to wait after
   *   the tab is backgrounded (visibilitychange -> 'hidden') before purging.
   *   Defaults to 0 (immediate). Set higher for multi-step intake flows
   *   where a user briefly switching apps shouldn't wipe their progress —
   *   e.g. 5 minutes. The timer is cancelled if the tab becomes visible
   *   again before it fires.
   */
  constructor(options = {}) {
    this._stateRefs = [];   // { container: obj, key: string }
    this._storageKeys = []; // localStorage keys to remove
    this._callbacks = [];   // arbitrary purge callbacks
    this._hiddenPurgeDelayMs = options.hiddenPurgeDelayMs ?? 0;
    this._hiddenTimer = null;

    this._bound = this._purge.bind(this);

    // pagehide fires reliably on mobile and bfcache-aware browsers when the
    // tab is actually closing or navigating away — this is the primary,
    // most trustworthy signal.
    window.addEventListener('pagehide', this._bound);

    // visibilitychange catches tab backgrounding (e.g. switching apps).
    // Purge timing here is configurable — see hiddenPurgeDelayMs above —
    // because an immediate purge on every backgrounding can be too
    // aggressive for a multi-step form: a user taking a call or checking
    // a text mid-intake shouldn't lose their progress.
    document.addEventListener('visibilitychange', this._onVisibility.bind(this));

    // beforeunload is a legacy desktop signal. Support for it is
    // inconsistent across browsers (notably restricted on mobile Safari)
    // and it may not fire reliably in all cases — treat it as a
    // best-effort fallback alongside pagehide, not the primary mechanism.
    window.addEventListener('beforeunload', this._bound);
  }

  /**
   * Register a live state object. The guard keeps a reference to the
   * container object and the property name so it can clear it in place.
   * Pass the wrapper object and key, not the value itself:
   *   guard.trackState(ctx, 'state')  where ctx.state is the state object
   *
   * Note: if container[key] is undefined/null at purge time, it's simply
   * skipped — this isn't an error, it just means there was nothing to
   * clear (e.g. the state hadn't been initialized yet).
   */
  trackState(container, key) {
    this._stateRefs.push({ container, key });
    return this;
  }

  /** Register a localStorage key to remove on purge. */
  trackStorage(key) {
    this._storageKeys.push(key);
    return this;
  }

  /** Register a callback invoked during purge (e.g. worker.terminate). */
  onPurge(fn) {
    this._callbacks.push(fn);
    return this;
  }

  /** Manually trigger a full purge immediately (e.g. user clicks "End Session"). */
  purgeNow() {
    this._clearHiddenTimer();
    this._purge();
  }

  _onVisibility() {
    if (document.visibilityState === 'hidden') {
      if (this._hiddenPurgeDelayMs > 0) {
        this._hiddenTimer = setTimeout(() => this._purge(), this._hiddenPurgeDelayMs);
      } else {
        this._purge();
      }
    } else {
      // Tab became visible again before the delay elapsed — cancel the purge.
      this._clearHiddenTimer();
    }
  }

  _clearHiddenTimer() {
    if (this._hiddenTimer) {
      clearTimeout(this._hiddenTimer);
      this._hiddenTimer = null;
    }
  }

  _purge() {
    // Clear all tracked state objects, then drop the reference.
    for (const { container, key } of this._stateRefs) {
      const obj = container[key];
      if (obj && typeof obj === 'object') {
        this._clear(obj);
      }
      container[key] = null;
    }

    // Remove localStorage entries.
    for (const key of this._storageKeys) {
      try { localStorage.removeItem(key); } catch (_) { /* storage may be unavailable */ }
    }

    // Run registered callbacks.
    for (const fn of this._callbacks) {
      try { fn(); } catch (_) { /* never let a callback abort the purge chain */ }
    }
  }

  /**
   * Recursively drop references to nested values before nulling the
   * container. As noted above, this makes purged data unreachable from
   * application state — it does not guarantee the underlying memory is
   * physically overwritten.
   */
  _clear(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        this._clear(val);
      }
      obj[key] = null;
    }
  }
}
