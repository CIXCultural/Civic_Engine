# JavaScript source: @civic-engine/headless
# This controller contains navigation and session logic only.
# It does NOT create HTML, CSS, DOM elements, or UI components.

import {
  loadBundle,
  evaluateNode
} from '@civic-engine/engine';

import {
  MemoryGuard
} from '@civic-engine/engine';


/**
 * Headless Civic Engine controller.
 *
 * This class manages:
 * - loading a civic rule bundle
 * - current node state
 * - decision flags
 * - navigation history
 * - persistence
 * - session cleanup
 * - evaluating the current decision state
 *
 * It does NOT render anything.
 *
 * A host application can consume the state through getView()
 * and render it using React, Vue, Svelte, Web Components,
 * plain JavaScript, or its own design system.
 */
export class CivicEngineController {
  /**
   * @param {Object} options
   * @param {string} options.bundleUrl
   * URL identifying the rule bundle.
   *
   * @param {string} [options.startNode='start']
   * Entry node for the application.
   *
   * @param {string} [options.storageKey]
   * localStorage key used for session state.
   *
   * @param {number} [options.hiddenPurgeDelayMs=0]
   * Delay before clearing session state when the page becomes hidden.
   */
  constructor({
    bundleUrl,
    startNode = 'start',
    storageKey,
    hiddenPurgeDelayMs = 0
  }) {
    // A bundle is required because it defines the application's
    // decision namespace.
    if (!bundleUrl) {
      throw new Error(
        'CivicEngineController requires a bundleUrl'
      );
    }

    this.bundleUrl = bundleUrl;

    // Allow applications to define their own entry node.
    this.startNode = startNode;

    // Give each application its own persistent namespace.
    this.storageKey =
      storageKey ||
      `civic_engine_state:${bundleUrl}`;

    // The controller's state is independent of presentation.
    this._state = this._loadState();

    // MemoryGuard provides best-effort session cleanup.
    this._guard = new MemoryGuard({
      hiddenPurgeDelayMs
    });

    this._guard
      .trackState(this, '_state')
      .trackStorage(this.storageKey);

    // Subscribers allow UI frameworks to react to state changes.
    //
    // React, Vue, Svelte, Web Components, etc. can subscribe
    // without the controller knowing anything about the UI.
    this._listeners = new Set();

    // Indicates whether the bundle has been loaded.
    this._loaded = false;
  }


  /**
   * Initialize the controller.
   *
   * The host application should call this before reading
   * the current decision state.
   */
  async initialize() {
    // Load the rule bundle into the Civic Engine.
    await loadBundle(this.bundleUrl);

    this._loaded = true;

    // Evaluate the current node.
    await this._evaluate();

    // Notify any subscribers that initialization is complete.
    this._notify();

    return this.getView();
  }


  /**
   * Return the current presentation-neutral state.
   *
   * This is the primary interface between Civic Engine and
   * whatever UI the host application chooses to use.
   */
  getView() {
    return {
      // Whether the controller has loaded its bundle.
      loaded: this._loaded,

      // Current node identifier.
      nodeId: this._state.nodeId,

      // Current decision flags.
      flags: {
        ...this._state.flags
      },

      // Navigation history.
      history: [
        ...this._state.history
      ],

      // Whether Back navigation is currently possible.
      canGoBack: this._state.history.length > 0,

      // Current evaluated result.
      //
      // This can be:
      // - null while loading
      // - a question result
      // - a terminal result
      result: this._result || null
    };
  }


  /**
   * Subscribe to controller state changes.
   *
   * @param {Function} listener
   * @returns {Function} unsubscribe function
   */
  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError(
        'subscribe() requires a function'
      );
    }

    this._listeners.add(listener);

    // Return a cleanup function so frameworks can easily
    // remove subscriptions when components unmount.
    return () => {
      this._listeners.delete(listener);
    };
  }


  /**
   * Submit a date answer.
   *
   * This corresponds to the date input currently supported
   * by CivicShell.
   *
   * @param {string} value
   */
  async answerDate(value) {
    // Do not advance without an answer.
    if (!value) {
      throw new Error(
        'A date answer is required'
      );
    }

    // The current result must represent a question.
    this._requireQuestion();

    const node = this._result.node;

    // Ensure this is actually a date question.
    if (node.inputType !== 'date') {
      throw new Error(
        'The current node does not accept a date answer'
      );
    }

    // Copy the current flags instead of mutating state directly.
    const flags = {
      ...this._state.flags,
      [node.flagName]: value
    };

    // Move to the node specified by the bundle.
    this._saveState({
      ...this._state,
      nodeId: node.next,
      flags
    });

    // Evaluate the new node.
    await this._evaluate();

    // Notify the host application.
    this._notify();

    return this.getView();
  }


  /**
   * Select an option from the current choice question.
   *
   * @param {string} optionId
   */
  async choose(optionId) {
    this._requireQuestion();

    const node = this._result.node;

    // Ensure the current node is a choice-based question.
    if (!Array.isArray(node.options)) {
      throw new Error(
        'The current node does not accept choice options'
      );
    }

    // Find the selected option.
    const option = node.options.find(
      (item) => item.id === optionId
    );

    if (!option) {
      throw new Error(
        `Unknown option: ${optionId}`
      );
    }

    // Copy the current flags.
    const flags = {
      ...this._state.flags
    };

    // Apply the flag specified by the selected option.
    if (option.setsFlag) {
      flags[option.setsFlag] = option.value;
    }

    // Preserve the current node in navigation history.
    const history = [
      ...this._state.history,
      this._state.nodeId
    ];

    // Advance to the selected node.
    this._saveState({
      nodeId: option.next,
      flags,
      history
    });

    // Evaluate the resulting node.
    await this._evaluate();

    // Notify the host application.
    this._notify();

    return this.getView();
  }


  /**
   * Navigate backward through the decision tree.
   */
  async back() {
    // Nothing to do if there is no navigation history.
    if (!this._state.history.length) {
      return this.getView();
    }

    // Copy the history before modifying it.
    const history = [
      ...this._state.history
    ];

    // Retrieve the previous node.
    const nodeId = history.pop();

    // Return to that node.
    this._saveState({
      ...this._state,
      nodeId,
      history
    });

    // Re-evaluate the previous node using the current flags.
    await this._evaluate();

    // Notify subscribers.
    this._notify();

    return this.getView();
  }


  /**
   * Restart the decision process.
   */
  async restart() {
    // Restore the configured entry point.
    this._saveState(
      this._defaultState()
    );

    // Re-evaluate the starting node.
    await this._evaluate();

    // Notify subscribers.
    this._notify();

    return this.getView();
  }


  /**
   * Explicitly end the current session.
   *
   * This performs the same MemoryGuard-based cleanup
   * currently performed by CivicShell.
   */
  endSession() {
    // Clear registered state and storage.
    this._guard.purgeNow();

    // Reset the in-memory state so the controller is
    // no longer holding the previous session.
    this._state = null;

    // Clear the evaluated result as well.
    this._result = null;

    // Notify subscribers that the session has ended.
    this._notify();
  }


  /**
   * Dispose of the controller.
   *
   * This removes MemoryGuard listeners and subscriptions.
   *
   * It does NOT automatically purge the session.
   */
  destroy() {
    // Release MemoryGuard resources.
    this._guard.destroy();

    // Remove all UI/application subscribers.
    this._listeners.clear();

    // Release references to state and evaluated data.
    this._state = null;
    this._result = null;
  }


  /**
   * Evaluate the current node against the active bundle.
   *
   * This method contains no rendering logic.
   */
  async _evaluate() {
    // The controller cannot evaluate anything until the
    // bundle has been loaded.
    if (!this._loaded) {
      return;
    }

    // Do not evaluate after the session has been purged.
    if (!this._state) {
      this._result = null;
      return;
    }

    const {
      nodeId,
      flags
    } = this._state;

    // Explicitly provide bundleUrl so node IDs cannot accidentally
    // resolve against another application's bundle.
    this._result = await evaluateNode(
      this.bundleUrl,
      nodeId,
      flags
    );
  }


  /**
   * Ensure that the current result is a question.
   */
  _requireQuestion() {
    if (!this._result) {
      throw new Error(
        'The controller has not been initialized'
      );
    }

    if (this._result.type !== 'question') {
      throw new Error(
        'The current node is not a question'
      );
    }
  }


  /**
   * Notify all subscribers of a state change.
   */
  _notify() {
    const view = this.getView();

    // Use a copy so that listeners cannot interfere with
    // iteration if one unsubscribes during notification.
    for (const listener of [...this._listeners]) {
      listener(view);
    }
  }


  /**
   * Create the initial application state.
   */
  _defaultState() {
    return {
      nodeId: this.startNode,
      flags: {},
      history: []
    };
  }


  /**
   * Load persisted state from localStorage.
   *
   * Invalid or unavailable storage falls back to a fresh session.
   */
  _loadState() {
    try {
      const stored =
        localStorage.getItem(
          this.storageKey
        );

      if (!stored) {
        return this._defaultState();
      }

      const state =
        JSON.parse(stored);

      // Perform basic structural validation.
      if (
        !state ||
        typeof state !== 'object' ||
        typeof state.nodeId !== 'string' ||
        typeof state.flags !== 'object' ||
        !Array.isArray(state.history)
      ) {
        return this._defaultState();
      }

      return state;

    } catch (_) {
      // localStorage may be unavailable or contain invalid JSON.
      return this._defaultState();
    }
  }


  /**
   * Persist the current application state.
   */
  _saveState(state) {
    // Update in-memory state first.
    this._state = state;

    try {
      // Persist only serializable decision state.
      localStorage.setItem(
        this.storageKey,
        JSON.stringify(state)
      );

    } catch (_) {
      // The application can continue using in-memory state
      // when localStorage is unavailable or full.
    }
  }
}
