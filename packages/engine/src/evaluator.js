
/**
 * RuleEvaluator — traverses a declarative decision tree.
 *
 * Bundles register their node maps here.
 *
 * IMPORTANT:
 * Every node resolution is explicitly scoped to a bundleUrl.
 * This prevents node-ID collisions between jurisdictions.
 *
 * For example, both bundles can safely contain:
 *
 *   start
 *   checklist_main
 *
 * because the evaluator resolves:
 *
 *   bundleUrl + nodeId
 *
 * rather than searching globally for nodeId.
 *
 * No bundle logic is ever sent to the main thread.
 */

export class RuleEvaluator {
  constructor() {
    // Map each bundle URL to its complete bundle.
    //
    // The bundle URL acts as the namespace for all node IDs
    // contained within that bundle.
    this._bundles = new Map();
  }

  /**
   * Register a bundle under its unique bundle URL.
   *
   * @param {string} bundleUrl - Unique identifier for the bundle.
   * @param {object} bundle - The jurisdiction rule bundle.
   */
  register(bundleUrl, bundle) {
    // Require a usable bundle identifier.
    if (!bundleUrl || typeof bundleUrl !== 'string') {
      throw new Error('bundleUrl is required to register a bundle');
    }

    // Require a valid bundle object.
    if (!bundle || typeof bundle !== 'object') {
      throw new Error(`Invalid bundle for: ${bundleUrl}`);
    }

    // Require the node map because all evaluation starts from nodes.
    if (!bundle.nodes || typeof bundle.nodes !== 'object') {
      throw new Error(
        `Invalid bundle: missing nodes for ${bundleUrl}`
      );
    }

    // Store the bundle using its URL as its namespace.
    this._bundles.set(bundleUrl, bundle);
  }

  /**
   * Resolve a node inside a SPECIFIC bundle.
   *
   * @param {string} bundleUrl - Bundle containing the node.
   * @param {string} nodeId - ID of the node to evaluate.
   * @param {object} flags - Runtime facts used by conditions.
   *
   * @returns {object} Question or terminal result.
   */
  resolve(bundleUrl, nodeId, flags = {}) {

    if (!bundleUrl || typeof bundleUrl !== 'string') {
      throw new Error('bundleUrl is required for node resolution');
    }

    // The node ID is also mandatory.
    if (!nodeId || typeof nodeId !== 'string') {
      throw new Error('nodeId is required for node resolution');
    }

    // Retrieve ONLY the explicitly requested bundle.
    //
    // We intentionally do not call _findBundle(nodeId).
    const bundle = this._bundles.get(bundleUrl);

    // Fail closed if the requested bundle has not been registered.
    if (!bundle) {
      throw new Error(`No bundle registered: ${bundleUrl}`);
    }

    // Retrieve the node ONLY from this bundle.
    const node = bundle.nodes[nodeId];

    if (!node) {
      throw new Error(
        `Node "${nodeId}" not found in bundle "${bundleUrl}"`
      );
    }

    if (!this._isEffective(node)) {
      throw new Error(
        `Node "${nodeId}" is outside its effective date range`
      );
    }

    if (node.type === 'question') {
      return {
        type: 'question',
        node: this._sanitize(node)
      };
    }

  
    if (node.type === 'branch') {
      // Validate that the branch actually contains conditions.
      if (!Array.isArray(node.conditions)) {
        throw new Error(
          `Branch node "${nodeId}" has no conditions`
        );
      }

      // Find the first condition that evaluates to true.
      const matched = node.conditions.find((condition) =>
        this._evalCondition(condition.when, flags)
      );

      // Fail explicitly if the branch has no matching path.
      if (!matched) {
        throw new Error(
          `No condition matched in branch node: ${nodeId}`
        );
      }

      // Every branch must point to another node.
      if (!matched.next || typeof matched.next !== 'string') {
        throw new Error(
          `Branch node "${nodeId}" has an invalid next node`
        );
      }

      return this.resolve(
        bundleUrl,
        matched.next,
        flags
      );
    }

    /**
     * Terminal node.
     *
     * Terminal nodes produce the final checklist/result.
     */
    if (node.type === 'terminal') {
      return {
        type: 'terminal',
        checklist: this._buildChecklist(
          node,
          flags,
          bundle
        )
      };
    }

    // Reject unknown node types rather than silently continuing.
    throw new Error(
      `Unknown node type "${node.type}" in node "${nodeId}"`
    );
  }

  /**
   * Determine whether a node is currently effective.
   *
   * @param {object} node
   * @returns {boolean}
   */
  _isEffective(node) {
    // Capture the current timestamp once for consistent comparison.
    const now = Date.now();

    /**
     * effectiveAfter:
     *
     * The node is not active until this timestamp.
     */
    if (node.effectiveAfter) {
      const effectiveAfter = new Date(
        node.effectiveAfter
      ).getTime();

      // Reject malformed dates rather than treating them as valid.
      if (Number.isNaN(effectiveAfter)) {
        throw new Error(
          `Invalid effectiveAfter date: ${node.effectiveAfter}`
        );
      }

      if (effectiveAfter > now) {
        return false;
      }
    }

    /**
     * effectiveBefore:
     *
     * The node stops being active after this timestamp.
     */
    if (node.effectiveBefore) {
      const effectiveBefore = new Date(
        node.effectiveBefore
      ).getTime();

      // Reject malformed dates rather than silently ignoring them.
      if (Number.isNaN(effectiveBefore)) {
        throw new Error(
          `Invalid effectiveBefore date: ${node.effectiveBefore}`
        );
      }

      if (effectiveBefore < now) {
        return false;
      }
    }

    // The node is currently within its effective window.
    return true;
  }

  /**
   * Evaluate a declarative condition against runtime flags.
   *
   * Supported conditions:
   *
   *   { flag: 'borough', eq: 'manhattan' }
   *   { flag: 'borough', neq: 'brooklyn' }
   *   { flag: 'expired', truthy: true }
   *   { flag: 'borough', in: ['manhattan', 'bronx'] }
   *
   * Arrays represent AND conditions:
   *
   *   [
   *     { flag: 'borough', eq: 'manhattan' },
   *     { flag: 'appeal', truthy: true }
   *   ]
   *
   * @param {object|Array} when - Declarative condition.
   * @param {object} flags - Runtime values.
   * @returns {boolean}
   */
  _evalCondition(when, flags) {
    // A missing condition is treated as unconditional.
    if (!when) {
      return true;
    }

    /**
     * An array represents an AND group.
     *
     * Every condition must evaluate to true.
     */
    if (Array.isArray(when)) {
      return when.every((condition) =>
        this._evalCondition(condition, flags)
      );
    }

    // Conditions must be objects.
    if (typeof when !== 'object') {
      return false;
    }

    // A condition must identify a flag.
    if (!when.flag || typeof when.flag !== 'string') {
      return false;
    }

    // Retrieve the runtime value.
    const value = flags[when.flag];

    /**
     * Equality comparison.
     *
     * String conversion preserves the behavior of the
     * original evaluator and allows values such as:
     *
     *   1
     *
     * to match:
     *
     *   "1"
     */
    if (Object.prototype.hasOwnProperty.call(when, 'eq')) {
      return String(value) === String(when.eq);
    }

    /**
     * Inequality comparison.
     */
    if (Object.prototype.hasOwnProperty.call(when, 'neq')) {
      return String(value) !== String(when.neq);
    }

    /**
     * Truthiness comparison.
     *
     * truthy: true  → value must be truthy
     * truthy: false → value must be falsy
     */
    if (
      Object.prototype.hasOwnProperty.call(
        when,
        'truthy'
      )
    ) {
      return when.truthy
        ? Boolean(value)
        : !value;
    }

    /**
     * Membership comparison.
     *
     * Example:
     *
     *   {
     *     flag: 'borough',
     *     in: ['manhattan', 'bronx']
     *   }
     */
    if (Object.prototype.hasOwnProperty.call(when, 'in')) {
      // The "in" operand must be an array.
      if (!Array.isArray(when.in)) {
        return false;
      }

      return when.in.includes(value);
    }

    // Unknown operators fail closed.
    return false;
  }

  /**
   * Build the checklist associated with a terminal node.
   *
   * Text and links can contain placeholders such as:
   *
   *   {{borough}}
   *   {{courtName}}
   *
   * Values are resolved first from civicData and flags.
   * Flags take precedence over civicData.
   *
   * @param {object} node - Terminal node.
   * @param {object} flags - Runtime values.
   * @param {object} bundle - Current jurisdiction bundle.
   * @returns {Array}
   */
  _buildChecklist(node, flags, bundle) {
    // Retrieve static civic data from the current bundle.
    const civicData = bundle.civicData || {};

    // Combine bundle data and runtime flags.
    //
    // Flags intentionally come second so that runtime values
    // override static bundle values when the same key exists.
    const context = {
      ...civicData,
      ...flags
    };

    // A terminal node must contain an items array.
    if (!Array.isArray(node.items)) {
      throw new Error(
        'Terminal node is missing a valid items array'
      );
    }

    // Build the final checklist.
    return node.items.map((item) => {
      // Validate the checklist item.
      if (!item || typeof item !== 'object') {
        throw new Error(
          'Invalid checklist item'
        );
      }

      // Interpolate the checklist text.
      const result = {
        ...item,
        text: this._interpolate(
          item.text,
          context
        )
      };

      // Interpolate the link only when one exists.
      if (item.link) {
        result.link = this._interpolate(
          item.link,
          context
        );
      }

      return result;
    });
  }

  /**
   * Replace {{key}} placeholders with values from context.
   *
   * Unresolved placeholders are intentionally preserved rather
   * than replaced with an empty string. This makes missing data
   * visible and easier to diagnose.
   *
   * @param {string} template - Text containing placeholders.
   * @param {object} context - Values available for interpolation.
   * @returns {string}
   */
  _interpolate(template, context) {
    // Return non-string values unchanged.
    if (typeof template !== 'string') {
      return template;
    }

    return template.replace(
      /{{(\w+)}}/g,
      (match, key) => {
        // Preserve the placeholder when no value exists.
        return context[key] ?? match;
      }
    );
  }

  /**
   * Remove internal/private fields before a question node
   * is returned to the main thread.
   *
   * The exact fields removed here can be expanded as the bundle
   * schema evolves.
   *
   * @param {object} node - Original question node.
   * @returns {object}
   */
  _sanitize(node) {
    // Create a shallow copy so the original bundle remains immutable.
    const sanitized = { ...node };

    /**
     * Remove fields that are intended only for engine-side
     * evaluation.
     *
     * These fields are examples; add additional internal fields
     * here if your schema defines them.
     */
    delete sanitized._internal;
    delete sanitized._debug;

    return sanitized;
  }
}
```
