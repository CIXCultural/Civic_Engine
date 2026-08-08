#!/usr/bin/env node
/**
 * validate-cli.js — command-line bundle validator.
 *
 * Usage:
 *   node packages/schema/src/validate-cli.js bundles/your-jurisdiction/rules/index.json
 *
 * Runs two layers of checks:
 *   1. validateBundle() from ./index.js — top-level schema fields
 *      (required fields, semver version, staleness warning)
 *   2. Node-graph structural checks — entryNode exists, every node has
 *      a valid type, branch/terminal nodes have the fields their type
 *      requires, and every `next` reference resolves to a real node.
 *
 * Exits 0 on success (including warnings), 1 on any structural error.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateBundle } from './index.js';

const VALID_NODE_TYPES = new Set(['question', 'branch', 'terminal']);

function loadBundle(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    console.error(`Could not read file: ${path}`);
    console.error(err.message);
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON in ${path}:`);
    console.error(`  ${err.message}`);
    console.error('\nCheck for a trailing comma, a missing quote, or a leftover');
    console.error('"_"-prefixed template key that was left in by mistake.');
    process.exit(1);
  }
}

/**
 * Walk the node graph and check structural integrity.
 * Returns { errors: string[], warnings: string[] }.
 */
function validateNodeGraph(bundle) {
  const errors = [];
  const warnings = [];
  const nodes = bundle.nodes || {};
  const nodeIds = new Set(Object.keys(nodes));

  if (!bundle.entryNode) {
    errors.push('Missing "entryNode" — every bundle must specify its starting node.');
  } else if (!nodeIds.has(bundle.entryNode)) {
    errors.push(
      `entryNode "${bundle.entryNode}" does not match any node in "nodes". ` +
      `Available node IDs: ${[...nodeIds].join(', ') || '(none)'}`
    );
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!node.type) {
      errors.push(`Node "${nodeId}" is missing a "type" field.`);
      continue;
    }
    if (!VALID_NODE_TYPES.has(node.type)) {
      errors.push(
        `Node "${nodeId}" has unknown type "${node.type}". ` +
        `Must be exactly one of: question, branch, terminal.`
      );
      continue;
    }

    if (node.type === 'question') {
      if (!node.text) warnings.push(`Question node "${nodeId}" has no "text" — users will see a blank prompt.`);
      const options = node.options || [];
      if (!options.length && node.inputType !== 'date') {
        warnings.push(`Question node "${nodeId}" has no "options" and no "inputType" — it's a dead end.`);
      }
      for (const opt of options) {
        if (!opt.next) {
          errors.push(`Option "${opt.label || opt.value}" in node "${nodeId}" has no "next" — it doesn't go anywhere.`);
        } else if (!nodeIds.has(opt.next)) {
          errors.push(`Node "${nodeId}" has an option pointing to "${opt.next}", which doesn't exist.`);
        }
      }
      if (node.inputType === 'date' && node.next && !nodeIds.has(node.next)) {
        errors.push(`Node "${nodeId}" (date input) points to "${node.next}", which doesn't exist.`);
      }
    }

    if (node.type === 'branch') {
      if (!Array.isArray(node.conditions) || node.conditions.length === 0) {
        errors.push(`Branch node "${nodeId}" is missing a non-empty "conditions" array.`);
      } else {
        const hasDefault = node.conditions.some(c => c.when === null);
        if (!hasDefault) {
          warnings.push(
            `Branch node "${nodeId}" has no default condition ({ "when": null }) — ` +
            `if no condition matches at runtime, this will throw an error instead of falling through.`
          );
        }
        for (const cond of node.conditions) {
          if (!cond.next) {
            errors.push(`A condition in branch node "${nodeId}" has no "next".`);
          } else if (!nodeIds.has(cond.next)) {
            errors.push(`Branch node "${nodeId}" has a condition pointing to "${cond.next}", which doesn't exist.`);
          }
        }
      }
    }

    if (node.type === 'terminal') {
      if (!Array.isArray(node.items) || node.items.length === 0) {
        errors.push(`Terminal node "${nodeId}" is missing a non-empty "items" array.`);
      }
    }

    // effectiveAfter/effectiveBefore/supersedes sanity checks
    if (node.effectiveAfter && isNaN(Date.parse(node.effectiveAfter))) {
      errors.push(`Node "${nodeId}" has an unparseable "effectiveAfter" date: ${node.effectiveAfter}`);
    }
    if (node.effectiveBefore && isNaN(Date.parse(node.effectiveBefore))) {
      errors.push(`Node "${nodeId}" has an unparseable "effectiveBefore" date: ${node.effectiveBefore}`);
    }
    if (node.supersedes && !nodeIds.has(node.supersedes)) {
      warnings.push(`Node "${nodeId}" has "supersedes": "${node.supersedes}", which doesn't match any node ID.`);
    }
  }

  // Warn about leftover template scaffolding
  const leftoverUnderscoreKeys = Object.keys(bundle).filter(k => k.startsWith('_'));
  if (leftoverUnderscoreKeys.length) {
    warnings.push(
      `Found leftover template key(s) at the top level: ${leftoverUnderscoreKeys.join(', ')}. ` +
      `These should be removed before publishing (see AUTHORING.md).`
    );
  }
  for (const [nodeId, node] of Object.entries(nodes)) {
    const underscoreKeys = Object.keys(node).filter(k => k.startsWith('_'));
    if (underscoreKeys.length) {
      warnings.push(`Node "${nodeId}" has leftover template key(s): ${underscoreKeys.join(', ')}.`);
    }
  }

  return { errors, warnings };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node validate-cli.js <path-to-bundle.json>');
    process.exit(1);
  }

  const resolvedPath = resolve(filePath);
  const bundle = loadBundle(resolvedPath);

  console.log(`\nValidating: ${resolvedPath}\n`);

  const schemaResult = validateBundle(bundle);
  const graphResult = validateNodeGraph(bundle);

  const allErrors = [
    ...(schemaResult.valid ? [] : schemaResult.errors.filter(e => !e.startsWith('WARNING'))),
    ...(schemaResult.valid ? [] : schemaResult.errors.filter(e => e.startsWith('WARNING')).length ? [] : []),
    ...graphResult.errors,
  ];
  const allWarnings = [
    ...(schemaResult.errors || []).filter(e => e.startsWith('WARNING')),
    ...graphResult.warnings,
  ];

  if (allErrors.length) {
    console.log(`✗ ${allErrors.length} error(s):\n`);
    for (const err of allErrors) console.log(`  - ${err}`);
  } else {
    console.log('✓ No structural errors.');
  }

  if (allWarnings.length) {
    console.log(`\n⚠ ${allWarnings.length} warning(s):\n`);
    for (const warn of allWarnings) console.log(`  - ${warn}`);
  }

  console.log('');
  process.exit(allErrors.length ? 1 : 0);
}

main();
