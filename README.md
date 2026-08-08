# Civic Engine

Civic rules are typically trapped in documents, websites, and custom applications. Civic Engine separates policy logic from application code by representing civic knowledge as portable, versioned rule bundles that can run across jurisdictions. It provides a local-first runtime for executable civic knowledge and legal logic.

Zero backend. Works offline. Runs multi-column queries in under 2 seconds on legacy hardware.

---

## Architecture

```
civic-engine/
├── packages/
│   ├── engine/       ← Web Worker + stream parser + DuckDB-WASM query layer
│   ├── schema/       ← JSON Schema for rule bundles + validator
│   └── ui-shell/     ← Generic navigator UI (no framework)
├── templates/
│   └── eviction-defense-template/   ← White-label demo
│       ├── index.json   ← Declarative decision tree
│       └── README.md    ← Bundle authoring instructions
└── examples/
    └── housing-navigator/  ← Working demo page
```

## Four Technical Challenges

| # | Challenge | Where it's solved |
|---|---|---|
| 1 | Logic integrity without a server trust boundary | `engine/evaluator.js` — rules stay in worker thread, never sent to main thread |
| 2 | Versioned civic data without a backend | `schema/index.js` — `publishedAt` staleness warning; bundles are independently versioned |
| 3 | Enterprise legal logic as a declarative, composable model | `schema/bundle.schema.json` — temporal rules, `effectiveAfter`/`supersedes`, JSON Schema |
| 4 | Multi-jurisdiction tabular queries on legacy hardware | `engine/parser.js` — stream parsing into typed arrays; `engine/wasm-query.js` — WASM with JS fallback |

## How to Add a New Jurisdiction

1. Create `bundles/<your-bundle>/rules/index.json` — validate against `packages/schema/src/bundle.schema.json`
2. Add civic data (courts, addresses, deadlines) to `bundles/<your-bundle>/data/`
3. Point a new `examples/<your-app>/index.html` at your bundle URL
4. No engine code changes required

## Relationship to CourtMotion

`bundles/nyc-housing-demo` is a white-label reimplementation of the NYC Housing Court appeals
domain for demonstration purposes. CourtMotion (the production app in `/api` and `/public`) is
**not modified** and shares no source code with this platform.

## Benchmark Results

Measured on Node 22 (conservative proxy for a mid-range 2019 smartphone browser).
Dataset: 200,000 rows, 12.2 MB CSV (synthetic census/voter registry scale).

| Operation | Time | Rows returned |
|---|---|---|
| Stream parse + columnar ingest | 706 ms | 200,000 |
| Single-column filter (`borough = Brooklyn`) | 4 ms | 40,000 |
| Multi-column filter + sort (`income > 60k AND pop > 1000`) | 64 ms | 500 |
| Geo bounding-box (midtown Manhattan ~4 km²) | 6 ms | 481 |

All four queries complete in **780 ms total** on a 12 MB file — well under the 2-second target.
DuckDB-WASM adds vectorised execution on top of this baseline.

Run yourself: `node civic-engine/packages/engine/bench/benchmark.js 200000`

## Query Engine and WASM Status

Civic Engine uses DuckDB-WASM for in-browser analytical queries when
WebAssembly is available. DuckDB-WASM runs inside the engine's Web Worker,
keeping query execution off the main UI thread.

The query layer is implemented in:

`packages/engine/src/wasm-query.js`

The engine also includes a pure-JavaScript fallback for environments where
DuckDB-WASM cannot be initialized, including browsers with limited WebAssembly
support or restrictive security policies.

### Current Query Architecture

```text
Application
    │
    ▼
Civic Engine API
    │
    ▼
Web Worker
    │
    ├── RuleEvaluator
    │
    ├── StreamParser
    │
    └── DuckDbQuery
            │
            ├── DuckDB-WASM
            │
            └── Pure-JS fallback
