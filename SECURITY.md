# Civic Engine Security Policy

**Last updated:** August 8, 2026

## 1. Purpose

Civic Engine is an open-source framework for building civic and legal navigation applications created by CIX Cultural.

Because implementations may be used in situations involving housing, legal proceedings, public benefits, immigration, financial hardship, or other high-stakes circumstances, security and data-minimization are design considerations of the project.

This document describes the security architecture of the Civic Engine core, its limitations, and the process for reporting vulnerabilities.

---

## 2. Security Architecture

Civic Engine separates the application into several components:

```text
packages/
├── engine/
│   └── src/
│       ├── evaluator.js
│       ├── memory-guard.js
│       ├── parser.js
│       ├── wasm-query.js
│       ├── worker.js
│       └── index.js
├── schema/
│   └── bundle.schema.json
└── ui-shell/
    └── src/
        └── CivicShell.js
```

The architecture is designed so that CPU-intensive operations can occur outside the browser's main UI thread.

The primary execution path is:

```text
UI
 ↓
Main-thread API
 ↓
Web Worker
 ├── RuleEvaluator
 ├── StreamParser
 └── DuckDB-WASM / JS fallback
```

This separation reduces the impact of computationally intensive operations on the user interface and limits direct exposure of engine internals to the main UI layer.

---

## 3. Rule-Bundle Isolation

Rule bundles are jurisdiction- and domain-specific configurations.

The engine must scope node evaluation to the bundle from which the node originated.

Implementations should invoke evaluation using the equivalent of:

```text
evaluateNode(bundleUrl, nodeId, flags)
```

rather than resolving a node solely by its identifier.

This is necessary because independent bundles may legitimately contain identical node identifiers such as:

```text
start
checklist_main
notice_type
```

A node identifier must therefore not be treated as globally unique across bundles.

---

## 4. Input Validation

Rule bundles should be validated against the Civic Engine JSON Schema before publication.

Validation should occur before an untrusted bundle is registered with the runtime.

The schema defines the expected structure of:

* bundle metadata;
* civic data;
* nodes;
* questions;
* branch conditions;
* terminal checklists;
* links; and
* temporal metadata.

Schema validation does not establish that the substantive legal content is correct. It establishes structural validity.

---

## 5. SQL Identifier Validation

The DuckDB query layer constructs structured SQL queries from application-supplied query descriptions.

Values should be parameterized or escaped appropriately.

Identifiers such as:

* dataset names;
* column names;
* latitude/longitude column names; and
* sort columns

must be validated against a strict identifier allowlist before interpolation into SQL.

A suitable baseline identifier rule is:

```text
^[A-Za-z_][A-Za-z0-9_]*$
```

Applications should not allow arbitrary user-controlled SQL to reach the query layer.

The query interface is intended to accept structured query objects, not arbitrary SQL statements from untrusted users.

---

## 6. WebAssembly

Civic Engine may use DuckDB-WASM for local analytical queries.

WebAssembly execution does not make arbitrary code trustworthy. Implementers should:

* obtain WASM artifacts from trusted sources;
* pin dependency versions;
* maintain dependency inventories;
* verify package provenance where appropriate; and
* update dependencies when security vulnerabilities are identified.

The project does not treat an unfinished custom WebAssembly query module as part of the production query path.

---

## 7. Web Workers

CPU-intensive processing is performed in a Web Worker where supported.

The worker handles operations such as:

* rule evaluation;
* stream processing;
* dataset ingestion; and
* analytical queries.

The main-thread API communicates with the worker through structured messages.

Workers should be terminated when they are no longer required, particularly for applications handling sensitive session data.

`MemoryGuard` provides a mechanism for applications to register worker-termination callbacks.

---

## 8. Session Data and MemoryGuard

`MemoryGuard` provides best-effort cleanup of application state.

It can:

1. clear tracked state objects;
2. remove registered `localStorage` entries;
3. invoke registered purge callbacks;
4. terminate workers through registered callbacks; and
5. respond to relevant page lifecycle events.

This mechanism does **not** guarantee physical memory erasure.

Browser JavaScript does not provide an API for securely overwriting arbitrary memory. Garbage collection, JIT optimization, string interning, memory compaction, and browser implementation details may result in residual copies that the application cannot access.

Accordingly, applications must not rely on `MemoryGuard` as protection against:

* malware;
* browser compromise;
* device compromise;
* forensic memory acquisition; or
* privileged local attackers.

---

## 9. Browser Storage

The UI shell may persist navigation state in `localStorage`.

Applications handling sensitive information should evaluate whether persistence is appropriate.

Where persistence is used, applications should:

* use an application-specific storage key;
* avoid storing unnecessary PII;
* provide a mechanism to clear session state;
* consider automatic expiration;
* avoid storing credentials or authentication secrets; and
* avoid treating browser storage as a secure secrets store.

---

## 10. External Network Dependencies

Applications should minimize runtime dependencies on third-party infrastructure.

In particular, executable JavaScript or WebAssembly artifacts should preferably be served from infrastructure controlled by the deploying application rather than fetched from an unrelated third-party CDN.

This reduces:

* supply-chain exposure;
* availability dependencies;
* unexpected third-party network requests;
* privacy leakage through resource requests; and
* dependency on external infrastructure in restricted-network environments.

---

## 11. Content Security Policy

Deployments should consider an appropriate Content Security Policy (CSP).

A deployment using WebAssembly, Web Workers, or externally hosted resources should configure its CSP according to the actual resources required by the application.

Implementers should avoid broadly permitting:

```text
*
```

where a narrower policy is possible.

The exact CSP depends on the hosting environment and should be tested against the deployed application.

---

## 12. Dependency Security

The project should maintain dependencies using version-pinned or otherwise controlled package specifications where practical.

Security-sensitive updates should be reviewed before deployment.

Implementers should periodically review:

* npm dependencies;
* WebAssembly dependencies;
* build tooling;
* browser APIs;
* external data sources; and
* hosting infrastructure.

---

## 13. Data Source Security

Civic Engine may ingest CSV or NDJSON data from a URL.

Applications should treat remote datasets as untrusted input.

Implementers should:

* use HTTPS;
* validate expected schemas;
* verify trusted data sources;
* avoid executing data as code;
* limit dataset size where appropriate; and
* ensure that datasets do not contain unintended PII.

The parser treats CSV and NDJSON as data and does not intentionally execute their contents as JavaScript.

---

## 14. Denial-of-Service Considerations

Large or malformed datasets can consume substantial browser memory or CPU resources.

Implementers should consider:

* dataset size limits;
* query result limits;
* bounded ingestion;
* input validation;
* worker termination;
* appropriate timeouts; and
* resource limits for untrusted sources.

The default query result limit should not be interpreted as a complete denial-of-service defense.

---

## 15. Legal-Content Integrity

Security includes the integrity of the rule bundles themselves.

An attacker who modifies a jurisdiction-specific rule bundle could cause users to receive incorrect civic or legal guidance.

Deployments should therefore protect published bundles against unauthorized modification.

Where appropriate, implementers should use:

* version control;
* code review;
* controlled deployment;
* HTTPS;
* integrity verification; and
* documented publication processes.

---

## 16. Security Limitations

Civic Engine does not guarantee protection against:

* a compromised operating system;
* a compromised browser;
* malicious browser extensions;
* malware;
* device-level surveillance;
* network-level monitoring;
* compromised hosting infrastructure;
* compromised third-party dependencies;
* malicious rule-bundle authors; or
* incorrect legal content.

Civic Engine is a browser-based application framework, not a hardened secure operating environment.

Implementers should assess their own threat model before deploying the framework in high-risk contexts.

---

## 17. Vulnerability Reporting

Security vulnerabilities should not be disclosed publicly before maintainers have had an opportunity to assess and address them.

Security reports should include:

* a description of the vulnerability;
* affected component and version;
* steps required to reproduce it;
* potential security impact; and
* any suggested mitigation.

Where the repository provides a private security-advisory mechanism, reporters should use that mechanism.

If no private mechanism is available, reporters should contact the project maintainer through the repository's current contact information and request a private disclosure channel.

---

## 18. Responsible Disclosure

The project asks security researchers to:

* avoid accessing or modifying data belonging to other users;
* avoid disrupting production services;
* avoid destructive testing;
* provide sufficient information to reproduce the issue; and
* allow reasonable time for remediation before public disclosure.

The project will make reasonable efforts to acknowledge valid reports and coordinate disclosure where appropriate.

---

## 19. Security Updates

Security-related fixes should be documented in the repository history and, where appropriate, in release notes.

Material security changes should identify:

* affected versions;
* fixed versions;
* affected components; and
* any required deployment changes.
