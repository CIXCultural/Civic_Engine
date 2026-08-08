# Civic Engine

Civic rules are typically trapped in documents, websites, and custom applications. Civic Engine separates policy logic from application code by representing civic knowledge as portable, versioned rule bundles that can run across jurisdictions. It provides a local-first runtime for executable civic knowledge and legal logic.

Zero backend. Works offline. Runs multi-column queries in under 2 seconds on legacy hardware.

---
## Positioning & Design Philosophy

### 1. The Challenge: Translating Civic Rules into Software

Civic regulations, administrative procedures, eligibility rules, and legal workflows change frequently and vary across jurisdictions. In conventional applications, these rules are often embedded directly in application code, meaning that a policy change can require a software-engineering change.

Civic Engine addresses this problem by separating **civic decision logic from application code**.

Jurisdiction- and domain-specific rules are represented as structured, declarative bundles that conform to a common schema. The engine interprets those bundles at runtime, while the UI shell provides a reusable interaction layer.

This creates a separation between:

* **Infrastructure** — the engine, schema, worker, query layer, and UI shell
* **Civic knowledge** — jurisdiction-specific rules, data, questions, and actions
* **Presentation** — the interface through which residents interact with the navigator

As a result, a new civic application can generally be created by authoring a new bundle rather than rewriting the underlying application.

### 2. Ecosystem Positioning

Civic Engine is part of the broader **Rules as Code (RaC)** and public-interest technology ecosystem. It is complementary to existing frameworks rather than intended to replace them.

Different RaC systems optimize for different outputs:

| System           | Primary orientation                                                          |
| ---------------- | ---------------------------------------------------------------------------- |
| **Docassemble**  | Guided interviews and document/form assembly                                 |
| **OpenFisca**    | Programmatic policy, tax, and social-benefit calculations                    |
| **Blawx**        | Formal legal rules and logic-based reasoning                                 |
| **Civic Engine** | Navigational civic journeys resulting in personalized actions and checklists |

The distinction is therefore primarily one of **application architecture and intended output**.

Civic Engine is designed for situations where the desired outcome is not necessarily a generated legal document or a numerical eligibility calculation, but rather:

> **“Given my situation and jurisdiction, what should I do next?”**

A Civic Engine application models that journey as a declarative decision tree whose terminal states can provide actions, deadlines, resources, warnings, and jurisdiction-specific links.

### 3. Data-First Design

Civic Engine uses a **data-first, declarative approach** to civic decision logic.

Instead of embedding every question and rule in application code, authors define:

* questions
* possible answers
* flags
* branching conditions
* effective dates
* jurisdictional data
* terminal actions and checklists

The engine provides the runtime required to interpret those definitions.

#### Advantages

**Maintainability**

Changes to jurisdiction-specific questions, text, routing, deadlines, and civic resources can often be made in a bundle without modifying the engine itself.

**Portability**

The same engine and UI shell can support substantially different civic applications by loading different bundles.

For example, the runtime could support:

* a housing navigator in New York
* a business-license navigator in another jurisdiction
* a benefits navigator
* a court-procedure navigator

without requiring the core engine to be rewritten for each use case.

**Author accessibility**

The bundle format is designed so that people who understand the relevant civic domain can author or maintain a bundle without needing to understand the implementation of the runtime.

This does **not** eliminate the need for domain expertise. Legal and policy content should still be reviewed by appropriately qualified subject-matter experts before publication.

**Separation of concerns**

The engine does not need to know the substantive law of a particular jurisdiction. It executes the structure supplied by the bundle.

### 4. Design Trade-offs

Civic Engine deliberately favors **simplicity, portability, and authorability** over unrestricted computational expressiveness.

| Data-first declarative model                               | Code-first model                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| Easier to inspect and validate                             | Greater programming flexibility                             |
| Rules can be changed independently of runtime code         | Complex calculations and edge cases are easier to implement |
| Portable across applications                               | Can integrate arbitrary libraries and services              |
| Accessible to non-engineering authors                      | Requires engineering expertise for changes                  |
| Strong separation between civic content and infrastructure | Logic and implementation can be tightly integrated          |

The trade-off is intentional.

A declarative decision-tree schema is well suited to navigational civic workflows, but it is not intended to replace general-purpose programming or specialized policy-simulation systems.

Where a civic application requires complex calculations, external integrations, or domain-specific computation, those capabilities can be provided by the surrounding application architecture while the Civic Engine remains responsible for the navigational decision layer.

### 5. The Core Abstraction

The central design principle is:

> **Create a new civic application by authoring a bundle—not by rewriting the engine.**

The architecture therefore separates the reusable runtime from the jurisdiction-specific knowledge it executes:

```text
                    CIVIC ENGINE

              ┌─────────────────────┐
              │      UI SHELL       │
              │  Generic interface  │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │       ENGINE        │
              │ Rule evaluation +   │
              │ worker/query layer  │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │       SCHEMA        │
              │ Bundle validation   │
              └──────────┬──────────┘
                         │
              ┌──────────▼───────────┐
              │       BUNDLE         │
              │ Domain + jurisdiction│
              │ + decision tree      │
              │ + civic data         │
              └──────────────────────┘
```

The result is an infrastructure model in which **software provides the execution layer while civic organizations and domain experts can provide the jurisdiction-specific decision content**.

---

## Architecture

```
## Architecture

civic-engine/
├── packages/
│   ├── engine/                    ← Web Worker + stream parser + DuckDB-WASM query layer
│   ├── schema/                    ← JSON Schema for rule bundles + validator
│   └── ui-shell/                  ← Generic navigator UI (no framework)
│
├── templates/
│   └── eviction-defense-template/ ← Reusable bundle authoring template
│       ├── index.json             ← Declarative decision tree
│       ├── civic-data.json        ← Jurisdiction-specific data template
│       └── README.md              ← Template-specific instructions
│
├── bundles/
│   └── nyc-housing-demo/          ← Concrete NYC reference implementation
│       ├── rules/
│       │   └── index.json         ← NYC-specific decision tree
│       ├── data/
│       │   └── courts.json        ← NYC-specific civic data
│       └── README.md              ← Reference implementation notes
│
├── examples/
│   └── housing-navigator/         ← Working demonstration application
│       └── README.md
│
├── AUTHORING.md                   ← General bundle-authoring guide
├── PRIVACY.md
├── SECURITY.md
├── GOVERNANCE.md
├── LICENSE
└── README.md
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
