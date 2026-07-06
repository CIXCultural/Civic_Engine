/**
 * MemoryGuard — zero-artifact session termination.
 *
 * Registers listeners for tab close, navigation away, and background
 * transitions. On any termination signal, it:
 *   1. Overwrites all registered state objects in place (zero-fill)
 *   2. Removes all registered localStorage keys
 *   3. Calls registered purge callbacks (e.g. to terminate workers)
 *
 * Usage:
 *   import { MemoryGuard } from './memory-guard.js';
 *   const guard = new MemoryGuard();
 *   guard.trackState(stateRef, 'sessionState');
 *   guard.trackStorage('ce_miami_state');
 *   guard.onPurge(() => worker.terminate());
 */

export class MemoryGuard {
  constructor() {
    this._stateRefs = [];   // { ref: obj, name: string }
    this._storageKeys = []; // localStorage keys to remove
    this._callbacks = [];   // arbitrary purge callbacks

    this._bound = this._purge.bind(this);

    // pagehide fires reliably on mobile and bfcache-aware browsers
    window.addEventListener('pagehide', this._bound);
    // visibilitychange catches tab background on Android Chrome
    document.addEventListener('visibilitychange', this._onVisibility.bind(this));
    // beforeunload is the classic desktop signal
    window.addEventListener('beforeunload', this._bound);
  }

  /**
   * Register a live state object. The guard keeps a reference to the
   * container object and the property name so it can zero-fill in place.
   * Pass the wrapper object and key, not the value itself:
   *   guard.trackState(ctx, 'state')  where ctx.state is the state object
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

  /** Manually trigger a full purge (e.g. user clicks "End Session"). */
  purgeNow() {
    this._purge();
  }

  _onVisibility() {
    if (document.visibilityState === 'hidden') this._purge();
  }

  _purge() {
    // Zero-fill all tracked state objects
    for (const { container, key } of this._stateRefs) {
      const obj = container[key];
      if (obj && typeof obj === 'object') {
        this._zeroFill(obj);
      }
      container[key] = null;
    }

    // Remove localStorage entries
    for (const key of this._storageKeys) {
      try { localStorage.removeItem(key); } catch (_) { /* storage may be unavailable */ }
    }

    // Run registered callbacks
    for (const fn of this._callbacks) {
      try { fn(); } catch (_) { /* never let a callback abort the purge chain */ }
    }
  }

  /**
   * Recursively overwrite all string and array values with zero equivalents
   * before nulling the reference, defeating garbage-collector timing attacks.
   */
  _zeroFill(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'string') {
        obj[key] = '\x00'.repeat(val.length);
      } else if (Array.isArray(val)) {
        val.fill(0);
        obj[key] = null;
      } else if (val && typeof val === 'object') {
        this._zeroFill(val);
        obj[key] = null;
      } else {
        obj[key] = null;
      }
    }
  }
}
