/**
 * CivicShell — generic navigator UI controller.
 *
 * Drop this into any host page. It manages state (localStorage),
 * renders question/checklist nodes from the engine, and handles
 * back-navigation. Zero framework dependency.
 *
 * Usage:
 *   import { CivicShell } from '@civic-engine/ui-shell';
 *   const shell = new CivicShell({ bundleUrl: '/bundles/nyc-housing-demo/rules/index.json' });
 *   shell.mount(document.getElementById('app'));
 */

import { loadBundle, evaluateNode } from '@civic-engine/engine';

const STORAGE_KEY = 'civic_engine_state';

export class CivicShell {
  constructor({ bundleUrl, storageKey = STORAGE_KEY, disclaimer = '' }) {
    this.bundleUrl = bundleUrl;
    this.storageKey = storageKey;
    this.disclaimer = disclaimer;
    this._root = null;
    this._state = this._loadState();
  }

  async mount(rootElement) {
    this._root = rootElement;
    await loadBundle(this.bundleUrl);
    await this._renderCurrent();
  }

  async _renderCurrent() {
    const { nodeId, flags } = this._state;
    const result = await evaluateNode(nodeId, flags);
    result.type === 'question' ? this._renderQuestion(result.node) : this._renderChecklist(result.checklist);
  }

  _renderQuestion(node) {
    const el = this._root;
    el.innerHTML = '';

    const phase = this._el('p', { className: 'phase-label', textContent: node.phase || '' });
    const text = this._el('h2', { textContent: node.text });
    el.append(phase, text);

    if (node.inputType === 'date') {
      const input = this._el('input', { type: 'date' });
      const btn = this._el('button', { textContent: 'Continue' });
      btn.onclick = () => {
        if (!input.value) return;
        const next = { ...this._state, flags: { ...this._state.flags, [node.flagName]: input.value } };
        next.nodeId = node.next;
        this._saveState(next);
        this._renderCurrent();
      };
      el.append(input, btn);
      return;
    }

    for (const opt of (node.options || [])) {
      const btn = this._el('button', { textContent: opt.label, className: 'option-btn' });
      btn.onclick = () => {
        const flags = { ...this._state.flags };
        if (opt.setsFlag) flags[opt.setsFlag] = opt.value;
        const history = [...this._state.history, this._state.nodeId];
        this._saveState({ nodeId: opt.next, flags, history });
        this._renderCurrent();
      };
      el.appendChild(btn);
    }

    if (this._state.history.length) {
      const back = this._el('button', { textContent: '← Back', className: 'back-btn' });
      back.onclick = () => {
        const history = [...this._state.history];
        const nodeId = history.pop();
        this._saveState({ ...this._state, nodeId, history });
        this._renderCurrent();
      };
      el.appendChild(back);
    }
  }

  _renderChecklist(items) {
    const el = this._root;
    el.innerHTML = '';
    const heading = this._el('h2', { textContent: 'Your Checklist' });
    const list = this._el('ul', { className: 'checklist' });

    for (const item of items) {
      const li = this._el('li', { className: item.urgent ? 'urgent' : '' });
      const text = document.createTextNode(item.text);
      li.appendChild(text);
      if (item.link) {
        const a = this._el('a', { href: item.link, textContent: ' [link]', target: '_blank' });
        li.appendChild(a);
      }
      list.appendChild(li);
    }

    const restart = this._el('button', { textContent: 'Start Over', className: 'restart-btn' });
    restart.onclick = () => { this._saveState(this._defaultState()); this._renderCurrent(); };

    if (this.disclaimer) {
      const d = this._el('p', { className: 'disclaimer', textContent: this.disclaimer });
      el.append(heading, list, d, restart);
    } else {
      el.append(heading, list, restart);
    }
  }

  _el(tag, props = {}) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    return el;
  }

  _defaultState() {
    return { nodeId: 'start', flags: {}, history: [] };
  }

  _loadState() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey)) || this._defaultState();
    } catch { return this._defaultState(); }
  }

  _saveState(state) {
    this._state = state;
    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }
}
