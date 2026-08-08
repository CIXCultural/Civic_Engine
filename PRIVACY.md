# Civic Engine Privacy Policy

**Last updated:** August 8, 2026

## 1. Purpose

Civic Engine is an open-source software framework for building jurisdiction-specific civic and legal navigation applications.

Civic Engine provides:

* a declarative rule-bundle schema;
* a local rule-evaluation engine;
* a Web Worker execution layer;
* optional local data querying through DuckDB-WASM;
* a framework-independent user-interface shell; and
* best-effort mechanisms for clearing application session state.

Civic Engine is designed so that a conforming implementation can operate without requiring a central application server or transmitting a user's navigation responses to the Civic Engine maintainers.

This document describes the privacy characteristics and limitations of the **Civic Engine core software**. A particular application built using Civic Engine may have additional privacy practices depending on its host website, rule bundle, analytics, APIs, external services, or other integrations.

---

## 2. Privacy-by-Design Principles

Civic Engine is designed around the following principles:

1. **Data minimization** — the core engine does not require personally identifiable information (PII) to evaluate a rule bundle.
2. **Local processing** — rule evaluation and supported data processing occur in the user's browser.
3. **No required central backend** — the core engine does not require a Civic Engine-operated server to process navigation responses.
4. **No required user accounts** — the core engine does not require users to create accounts.
5. **Explicit external dependencies** — applications should disclose external network requests and third-party services used by their implementation.
6. **User-controlled session state** — implementations may use browser storage to preserve navigation progress, but this is not required by the engine architecture.
7. **Limited retention** — implementations should retain only the information necessary to provide the requested civic service.

---

## 3. Information Processed by the Core Engine

The core engine can process information supplied by an application user as navigation flags.

For example, a rule bundle may ask a user a question and store a response such as:

```text
noticeType = "nonpayment"
```

or:

```text
canPay = "no"
```

These values are used to traverse the declarative decision tree.

The core engine does not inherently require a user's:

* name;
* email address;
* telephone number;
* physical address;
* government identification number;
* financial account information; or
* other directly identifying information.

An implementer may nevertheless choose to collect such information in an application built using Civic Engine. Such collection is outside the requirements of the core engine and is the responsibility of the implementing application.

---

## 4. Local Processing

Civic Engine is designed to perform rule evaluation locally in the user's browser.

The general execution path is:

```text
User
  ↓
CivicShell
  ↓
Civic Engine API
  ↓
Web Worker
  ↓
RuleEvaluator
  ↓
Rule Bundle
```

The rule evaluator does not require user responses to be sent to a Civic Engine-operated backend.

Where tabular civic data is used, the engine can process that data locally through DuckDB-WASM or a JavaScript fallback implementation.

---

## 5. Browser Storage

The UI shell may use `localStorage` to preserve navigation state.

For example, an implementation may store:

```text
nodeId
flags
history
```

under an application-specific storage key.

This storage is controlled by the user's browser and is not inherently transmitted to Civic Engine maintainers.

Implementers should evaluate whether local browser persistence is appropriate for the sensitivity of their application. Applications handling particularly sensitive information should consider whether persistence is necessary at all.

Implementers may configure their application to use a dedicated storage key and may disable or replace persistence where appropriate.

---

## 6. Session Cleanup

Civic Engine includes `MemoryGuard`, a best-effort mechanism for reducing the persistence of application session state.

Depending on configuration, it can:

* clear tracked application state;
* remove registered `localStorage` entries;
* terminate registered Web Workers;
* respond to page lifecycle events; and
* purge state after a configurable period in which a page remains hidden.

`MemoryGuard` is a mitigation mechanism, not a cryptographic erasure mechanism.

JavaScript applications cannot guarantee physical overwriting of memory. JavaScript strings are immutable, and browser engines may retain copies through garbage collection, optimization, memory compaction, or other implementation mechanisms outside application control.

Accordingly:

> Civic Engine does not claim to provide forensic memory erasure or protection against an attacker with access to the underlying device or browser process.

---

## 7. Network Requests

The Civic Engine core is designed to operate without transmitting user navigation responses to a central Civic Engine service.

However, a particular implementation may make network requests for:

* rule bundles;
* civic datasets;
* application assets;
* updates;
* external links;
* analytics;
* accessibility or other hosted services; or
* third-party libraries or infrastructure.

These requests are implementation-specific and must be disclosed by the application that makes them.

Implementers should avoid unnecessary third-party network dependencies, particularly where the application is intended for sensitive civic or legal use.

---

## 8. Third-Party Dependencies

Civic Engine may incorporate third-party open-source software.

Applications should document dependencies that can result in network requests or otherwise affect the application's privacy characteristics.

In particular, implementations using DuckDB-WASM should ensure that the location and provenance of the DuckDB-WASM JavaScript and WebAssembly artifacts are documented.

A deployment should not describe itself as having "no external dependencies" if it retrieves executable code or other resources from a third-party CDN at runtime.

---

## 9. Rule Bundles and PII

Civic Engine rule bundles are declarative data structures.

A rule bundle can contain:

* decision-tree nodes;
* questions;
* conditions;
* jurisdiction-specific facts;
* checklist items;
* links;
* effective dates; and
* other configuration data.

Rule bundles should not contain unnecessary personal information.

The core schema does not require PII in a rule bundle.

Implementers are responsible for ensuring that any data added to their rule bundles is appropriate for publication and does not inadvertently expose confidential or personal information.

---

## 10. Implementer Responsibilities

Civic Engine is infrastructure. The privacy characteristics of a completed application depend on how the infrastructure is configured and deployed.

Implementers are responsible for:

* determining whether their application collects PII;
* minimizing data collection;
* obtaining consent where required;
* providing appropriate privacy notices;
* securing any external services;
* configuring analytics appropriately;
* documenting network requests;
* complying with applicable privacy and data-protection laws;
* determining appropriate retention periods;
* securing any server-side systems they add; and
* ensuring that jurisdiction-specific legal content is accurate and appropriately maintained.

Civic Engine does not determine whether a particular implementation complies with the laws applicable to that implementation.

---

## 11. Children and Vulnerable Users

Civic Engine may be used to build applications serving vulnerable populations.

Implementers should conduct additional privacy and safety review when an application is intended for:

* children;
* survivors of abuse;
* people facing eviction or homelessness;
* immigrants;
* people involved in legal proceedings;
* people experiencing financial hardship; or
* other populations for whom disclosure of information could create material harm.

Where sensitive information is not necessary to provide the service, implementations should avoid collecting it.

---

## 12. Legal and Civic Content

Civic Engine is a software framework and does not itself provide legal advice.

Jurisdiction-specific legal information is supplied through rule bundles created and maintained by individual implementers.

Users should be directed to appropriate official or professional resources where an application cannot safely resolve a user's situation.

---

## 13. Changes to This Policy

This document may be updated as Civic Engine's architecture, dependencies, or privacy practices evolve.

Material changes should be documented in the project's repository history.

---

## 14. Contact

Questions concerning the Civic Engine project's privacy architecture or this policy may be submitted through the project's public repository issue or contact mechanisms.

Civic Engine does not require users of third-party implementations to submit personal information to the project maintainers.

Please forward any questions you might have to studio@cixcultural.org.
