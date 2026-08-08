/**
 * RuleEvaluator — traverses a declarative decision tree.
 *
 * Bundles register their node maps here. evaluateNode() resolves flags
 * against conditions and returns the next node or a terminal result.
 * No bundle logic is ever sent to the main thread.
 */

export class RuleEvaluator {
  constructor() {
    this._bundles = new Map(); // bundleUrl → bundle
  }

  register(bundleUrl, bundle) {
    this._bundles.set(bundleUrl, bundle);
  }

  /**
   * Find the bundle containing nodeId, evaluate conditions against flags,
   * and return the next node or terminal result.
   */
  resolve(nodeId, flags = {}) {
    const bundle = this._findBundle(nodeId);
    if (!bundle) throw new Error(`No bundle found for node: ${nodeId}`);
    const node = bundle.nodes[nodeId];
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    // Temporal rule check: skip node if outside its effective window
    if (!this._isEffective(node)) {
      throw new Error(`Node ${nodeId} is outside its effective date range`);
    }

    if (node.type === 'question') {
      return { type: 'question', node: this._sanitize(node) };
    }

    if (node.type === 'branch') {
      const matched = node.conditions.find(c => this._evalCondition(c.when, flags));
      if (!matched) throw new Error(`No condition matched in branch node: ${nodeId}`);
      return this.resolve(matched.next, flags);
    }

    if (node.type === 'terminal') {
      return { type: 'terminal', checklist: this._buildChecklist(node, flags, bundle) };
    }

    throw new Error(`Unknown node type: ${node.type}`);
  }

  _findBundle(nodeId) {
    for (const bundle of this._bundles.values()) {
      if (bundle.nodes[nodeId]) return bundle;
    }
    return null;
  }

  _isEffective(node) {
    const now = Date.now();
    if (node.effectiveAfter && new Date(node.effectiveAfter).getTime() > now) return false;
    if (node.effectiveBefore && new Date(node.effectiveBefore).getTime() < now) return false;
    return true;
  }

  // Condition: { flag: 'borough', eq: 'manhattan' } or { flag: 'expired', truthy: true }
  _evalCondition(when, flags) {
    if (!when) return true;
    if (Array.isArray(when)) return when.every(c => this._evalCondition(c, flags));
    const val = flags[when.flag];
    if ('eq' in when) return String(val) === String(when.eq);
    if ('neq' in when) return String(val) !== String(when.neq);
    if ('truthy' in when) return when.truthy ? Boolean(val) : !val;
    if ('in' in when) return when.in.includes(val);
    return false;
  }

  _buildChecklist(node, flags, bundle) {
    const civicData = bundle.civicData || {};
    return node.items.map(item => ({
      ...item,
      // Interpolate {{key}} placeholders from flags and civicData
      text: this._interpolate(item.text, { ...civicData, ...flags }),
      link: item.link ? this._interpolate(item.link, { ...civicData, ...flags }) : undefined,
    }));
  }

  _interpolate(template, context) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? `{{${key}}}`);
  }

  // Strip internal fields before sending to main thread
  _sanitize(node) {
    const { effectiveAfter, effectiveBefore, supersedes, ...safe } = node;
    return safe;
  }
}
