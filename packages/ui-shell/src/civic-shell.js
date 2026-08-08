/**
 * CivicShell — generic navigator UI controller.
 *
 * This is a framework-independent reference UI for Civic Engine.
 *
 * Responsibilities:
 *
 * - Load a declarative rule bundle.
 * - Maintain navigation state.
 * - Render question nodes.
 * - Render terminal checklists.
 * - Persist session state locally.
 * - Provide back-navigation.
 * - Provide session reset.
 * - Integrate MemoryGuard for best-effort session cleanup.
 *
 * The shell contains NO jurisdiction-specific logic.
 *
 * Application-specific behavior comes from the bundle/schema.
 *
 * Usage:
 *
 *   import { CivicShell } from '@civic-engine/ui-shell';
 *
 *   const shell = new CivicShell({
 *     bundleUrl: '/bundles/nyc-housing-demo/rules/index.json',
 *     startNode: 'start'
 *   });
 *
 *   shell.mount(document.getElementById('app'));
 */

import {
  loadBundle,
  evaluateNode
} from '@civic-engine/engine';

import {
  MemoryGuard
} from '@civic-engine/engine';


// Default storage namespace.
//
// Individual applications should normally provide their own
// storageKey or allow the shell to derive one from bundleUrl.
const STORAGE_PREFIX = 'civic_engine_state';


export class CivicShell {
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
   * @param {string} [options.disclaimer='']
   * Optional disclaimer displayed on terminal results.
   *
   * @param {number} [options.hiddenPurgeDelayMs=0]
   * Delay before clearing session state when the page becomes
   * hidden.
   */
  constructor({
    bundleUrl,
    startNode = 'start',
    storageKey,
    disclaimer = '',
    hiddenPurgeDelayMs = 0
  }) {
    // The bundle is the application's rule namespace.
    if (!bundleUrl) {
      throw new Error(
        'CivicShell requires a bundleUrl'
      );
    }

    this.bundleUrl = bundleUrl;

    // Allow applications to choose their own entry node.
    this.startNode = startNode;

    // Allow applications to explicitly control their storage
    // namespace. Otherwise derive one from the bundle URL.
    this.storageKey =
      storageKey ||
      `${STORAGE_PREFIX}:${bundleUrl}`;

    this.disclaimer = disclaimer;

    // Root DOM element supplied by the host application.
    this._root = null;

    // Prevent rendering before mount().
    this._mounted = false;

    // Load persisted state if available.
    this._state = this._loadState();

    /**
     * MemoryGuard provides best-effort session cleanup.
     *
     * The shell registers its state object and storage key.
     */
    this._guard = new MemoryGuard({
      hiddenPurgeDelayMs
    });

    this._guard
      .trackState(this, '_state')
      .trackStorage(this.storageKey);
  }


  /**
   * Mount the shell into a host DOM element.
   *
   * @param {HTMLElement} rootElement
   */
  async mount(rootElement) {
    // Validate the supplied DOM element.
    if (
      !rootElement ||
      !(rootElement instanceof HTMLElement)
    ) {
      throw new TypeError(
        'CivicShell.mount() requires an HTMLElement'
      );
    }

    this._root = rootElement;
    this._mounted = true;

    // Load the requested bundle into the engine.
    await loadBundle(this.bundleUrl);

    // Render the current node.
    await this._renderCurrent();
  }


  /**
   * Render the current node from the active bundle.
   */
  async _renderCurrent() {
    // Don't render if the shell has not been mounted.
    if (!this._mounted || !this._root) {
      return;
    }

    // If the state has been purged, stop rendering.
    if (!this._state) {
      return;
    }

    const {
      nodeId,
      flags
    } = this._state;

    /**
     * IMPORTANT:
     *
     * bundleUrl is explicitly passed to the engine.
     *
     * This prevents node IDs from being resolved against
     * another application's bundle.
     */
    const result = await evaluateNode(
      this.bundleUrl,
      nodeId,
      flags
    );

    // Render the appropriate result type.
    if (result.type === 'question') {
      this._renderQuestion(result.node);
      return;
    }

    if (result.type === 'terminal') {
      this._renderChecklist(result.checklist);
      return;
    }

    // Fail explicitly if the engine returns an unsupported type.
    throw new Error(
      `Unsupported engine result type: ${result.type}`
    );
  }


  /**
   * Render a question node.
   *
   * The node determines what type of input is required.
   */
  _renderQuestion(node) {
    const el = this._root;

    // Clear the previous screen.
    el.innerHTML = '';

    // Render optional phase label.
    const phase = this._el('p', {
      className: 'phase-label',
      textContent: node.phase || ''
    });

    // Render the question itself.
    const text = this._el('h2', {
      textContent: node.text
    });

    el.append(phase, text);


    /**
     * Date input.
     *
     * The bundle can declare:
     *
     *   inputType: "date"
     *
     * and:
     *
     *   flagName: "filingDate"
     */
    if (node.inputType === 'date') {
      const input = this._el('input', {
        type: 'date'
      });

      const btn = this._el('button', {
        textContent: 'Continue'
      });

      btn.onclick = () => {
        // Don't proceed without an answer.
        if (!input.value) {
          return;
        }

        // Copy the current flags rather than mutating them.
        const flags = {
          ...this._state.flags,
          [node.flagName]: input.value
        };

        // The question itself identifies the next node.
        const next = {
          ...this._state,
          nodeId: node.next,
          flags
        };

        // Persist before rendering the next node.
        this._saveState(next);

        // Continue the decision tree.
        this._renderCurrent();
      };

      el.append(input, btn);

      // Add back navigation if applicable.
      this._renderBackButton(el);

      return;
    }


    /**
     * Choice-based question.
     */
    for (const opt of node.options || []) {
      const btn = this._el('button', {
        textContent: opt.label,
        className: 'option-btn'
      });

      btn.onclick = () => {
        // Copy the current flags.
        const flags = {
          ...this._state.flags
        };

        // Apply the flag specified by the bundle.
        if (opt.setsFlag) {
          flags[opt.setsFlag] = opt.value;
        }

        // Add the current node to navigation history.
        const history = [
          ...this._state.history,
          this._state.nodeId
        ];

        // Move to the option's target node.
        this._saveState({
          nodeId: opt.next,
          flags,
          history
        });

        // Render the next node.
        this._renderCurrent();
      };

      el.appendChild(btn);
    }

    // Add back navigation.
    this._renderBackButton(el);
  }


  /**
   * Render the Back button when navigation history exists.
   */
  _renderBackButton(el) {
    // Don't render Back on the first screen.
    if (!this._state?.history?.length) {
      return;
    }

    const back = this._el('button', {
      textContent: '← Back',
      className: 'back-btn'
    });

    back.onclick = () => {
      // Copy the history before modifying it.
      const history = [
        ...this._state.history
      ];

      // Retrieve the previous node.
      const nodeId = history.pop();

      // Return to the previous node.
      this._saveState({
        ...this._state,
        nodeId,
        history
      });

      // Render it.
      this._renderCurrent();
    };

    el.appendChild(back);
  }


  /**
   * Render a terminal checklist.
   */
  _renderChecklist(items) {
    const el = this._root;

    // Clear the previous screen.
    el.innerHTML = '';

    const heading = this._el('h2', {
      textContent: 'Your Checklist'
    });

    const list = this._el('ul', {
      className: 'checklist'
    });


    for (const item of items) {
      const li = this._el('li', {
        className: item.urgent
          ? 'urgent'
          : ''
      });

      // Use textContent so checklist text is never interpreted
      // as HTML.
      const text = document.createTextNode(
        item.text
      );

      li.appendChild(text);


      /**
       * Links are created as DOM elements rather than injected
       * through innerHTML.
       */
      if (item.link) {
        const a = this._el('a', {
          href: item.link,
          textContent: ' [link]',
          target: '_blank',
          rel: 'noopener noreferrer'
        });

        li.appendChild(a);
      }

      list.appendChild(li);
    }


    /**
     * Start Over resets the application's decision state.
     */
    const restart = this._el('button', {
      textContent: 'Start Over',
      className: 'restart-btn'
    });

    restart.onclick = () => {
      // Restore the application entry point.
      this._saveState(
        this._defaultState()
      );

      // Render the first node.
      this._renderCurrent();
    };


    if (this.disclaimer) {
      const d = this._el('p', {
        className: 'disclaimer',
        textContent: this.disclaimer
      });

      el.append(
        heading,
        list,
        d,
        restart
      );
    } else {
      el.append(
        heading,
        list,
        restart
      );
    }
  }


  /**
   * Create a DOM element and assign its properties.
   *
   * This keeps the shell dependency-free.
   */
  _el(tag, props = {}) {
    const el = document.createElement(tag);

    Object.assign(
      el,
      props
    );

    return el;
  }


  /**
   * Create the initial application state.
   *
   * startNode is configurable rather than hardcoded.
   */
  _defaultState() {
    return {
      nodeId: this.startNode,
      flags: {},
      history: []
    };
  }


  /**
   * Load previously persisted state.
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

      // Basic structural validation.
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
      // Storage may be unavailable or contain invalid JSON.
      return this._defaultState();
    }
  }


  /**
   * Persist application state.
   */
  _saveState(state) {
    // Update the in-memory state first.
    this._state = state;

    try {
      // Persist only serializable application state.
      localStorage.setItem(
        this.storageKey,
        JSON.stringify(state)
      );
    } catch (_) {
      // localStorage may be unavailable or full.
      //
      // The application can continue using in-memory state.
    }
  }


  /**
   * Explicitly end the current session.
   *
   * This performs the best-effort purge immediately.
   */
  endSession() {
    // Ask MemoryGuard to clear registered state,
    // storage, and callbacks.
    this._guard.purgeNow();

    // Clear the rendered UI as well.
    if (this._root) {
      this._root.innerHTML = '';
    }

    // Mark the shell as no longer mounted.
    this._mounted = false;
  }


  /**
   * Dispose of the shell and its event listeners.
   *
   * This does NOT itself perform a purge.
   *
   * Call endSession() first when sensitive session data
   * should be cleared.
   */
  destroy() {
    // Stop rendering.
    this._mounted = false;

    // Release the DOM reference.
    this._root = null;

    // Dispose of MemoryGuard listeners.
    this._guard.destroy();
  }
}
```
