/**
 * Schema validation for rule bundles.
 * Uses native JSON Schema (no runtime dependency) via a minimal validator.
 * For CI/authoring tooling, use ajv directly with bundle.schema.json.
 */

import bundleSchema from './bundle.schema.json' assert { type: 'json' };

export { bundleSchema };

/**
 * Validate a bundle object against the schema.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 * This is a structural check only — use ajv for full draft-07 compliance.
 */
export function validateBundle(bundle) {
  const errors = [];
  for (const field of bundleSchema.required) {
    if (!(field in bundle)) errors.push(`Missing required field: ${field}`);
  }
  if (bundle.version && !/^\d+\.\d+\.\d+$/.test(bundle.version)) {
    errors.push('version must be semver (e.g. 1.0.0)');
  }
  if (bundle.publishedAt) {
    const age = Date.now() - new Date(bundle.publishedAt).getTime();
    const days = age / (1000 * 60 * 60 * 24);
    if (days > 90) errors.push(`WARNING: bundle is ${Math.floor(days)} days old — verify rules are current`);
  }
  return errors.length ? { valid: false, errors } : { valid: true };
}
