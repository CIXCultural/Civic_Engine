# Contributing to Civic Engine

## For organizations: authoring a bundle

You do not need to write code to add a new jurisdiction.
A bundle is a single JSON file describing your legal or civic process.

### Step 1 — Copy the template

```
cp -r bundles/nyc-housing-demo bundles/your-jurisdiction
```

### Step 2 — Edit `rules/index.json`

Change these fields at the top:

```json
{
  "version": "0.1.0",
  "publishedAt": "2026-06-26",
  "domain": "your-domain",
  "jurisdiction": "ISO region code (e.g. US-CA-LA, KE-NBI, BR-SP)",
  "entryNode": "start",
  "civicData": {
    "helplinePhone": "+1-555-...",
    "courtAddress": "123 Main Street..."
  }
}
```

### Step 3 — Define your nodes

Each node is a step in the legal/civic process. Three types:

**Question** — asks the user something:
```json
"my_question": {
  "type": "question",
  "phase": "Step 1 — Getting Started",
  "text": "What is your situation?",
  "options": [
    { "label": "Option A", "value": "a", "setsFlag": "situation", "next": "next_node_id" },
    { "label": "Option B", "value": "b", "setsFlag": "situation", "next": "other_node_id" }
  ]
}
```

**Branch** — routes based on previous answers (no UI shown):
```json
"my_branch": {
  "type": "branch",
  "conditions": [
    { "when": { "flag": "situation", "eq": "a" }, "next": "node_for_a" },
    { "when": null, "next": "default_node" }
  ]
}
```

**Terminal** — outputs a checklist:
```json
"my_checklist": {
  "type": "terminal",
  "items": [
    { "text": "Call {{helplinePhone}} immediately.", "urgent": true },
    { "text": "Bring your documents to {{courtAddress}}." }
  ]
}
```

`{{placeholders}}` are filled from `civicData` and the user's answers.

### Step 4 — Validate your bundle

```bash
node packages/schema/src/validate-cli.js bundles/your-jurisdiction/rules/index.json
```

### Step 5 — Test it locally

```bash
# Serve the civic-engine directory with any static server, e.g.:
npx serve .

# Then open examples/housing-navigator/index.html
# and change the bundleUrl to point at your bundle.
```

### Step 6 — Submit

Open a pull request. Add your bundle under `bundles/` and a brief description
of the jurisdiction and legal domain it covers.

---

## For developers: engine contributions

The engine is in `packages/engine/src/`. All query and parsing logic runs
inside a Web Worker — never on the main thread. Keep it that way.

Run the benchmark before and after any parser or query changes:

```bash
node packages/engine/bench/benchmark.js 200000
```

Target: all four queries complete in under 2000 ms total on Node 18
(a conservative proxy for a mid-range 2019 smartphone browser).
