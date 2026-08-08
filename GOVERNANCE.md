# Civic Engine Governance

**Last updated:** August 8, 2026

## 1. Project

Civic Engine is an open-source software framework for building civic and legal navigation applications.

The project provides reusable infrastructure rather than a single jurisdiction-specific application.

Its architecture separates:

* the core engine;
* the rule-bundle schema;
* the user-interface shell;
* jurisdiction-specific rule bundles; and
* example implementations.

---

## 2. Ownership

Civic Engine is an open-source project owned and maintained by **Ingenio CIX / CIX Cultural**.

The project source code is publicly available under the MIT License.

Ownership of the core project does not imply ownership of jurisdiction-specific legal content contributed by independent implementers unless such ownership is separately established.

---

## 3. Open-Source License

Civic Engine is distributed under the **MIT License**.

The license permits users to:

* use the software;
* copy it;
* modify it;
* merge it into other projects;
* publish modified versions;
* distribute copies; and
* use it commercially,

subject to the terms of the MIT License.

The license applies to material covered by the project's copyright notice and does not automatically grant rights to third-party dependencies, trademarks, or independently authored jurisdiction-specific content.

---

## 4. Project Structure

The repository distinguishes between reusable infrastructure and application-specific content.

```text
packages/
├── engine/
├── schema/
└── ui-shell/

templates/
└── eviction-defense-template/

examples/
└── housing-navigator/
```

### `packages/engine`

Contains the core runtime, including:

* rule evaluation;
* Web Worker execution;
* stream parsing;
* DuckDB-WASM query support;
* JavaScript query fallback; and
* session-state cleanup mechanisms.

### `packages/schema`

Contains the JSON Schema used to describe compatible rule bundles.

### `packages/ui-shell`

Contains the framework-independent navigator interface.

### `templates`

Contains starter rule bundles intended to help independent authors create their own civic applications.

### `examples`

Contains examples demonstrating how the framework can be used.

---

## 5. Separation of Core Software and Local Content

Civic Engine is intentionally designed so that jurisdiction-specific rules can be maintained separately from the core runtime.

An implementation may create a bundle containing:

* jurisdiction-specific legal rules;
* local deadlines;
* court information;
* government resources;
* legal-aid information;
* civic datasets; and
* other locally relevant information.

Such content is not automatically part of the Civic Engine core.

This separation allows the engine to be reused across jurisdictions without modifying the underlying runtime.

---

## 6. Maintainer Responsibilities

The project maintainer is responsible for:

* maintaining the core repository;
* reviewing contributions;
* maintaining the schema;
* addressing reported security vulnerabilities;
* maintaining documentation;
* managing releases;
* maintaining project licensing information; and
* preserving the interoperability of the core packages.

The maintainer does not guarantee the accuracy of independently authored jurisdiction-specific legal content.

---

## 7. Contributor Responsibilities

Contributors should:

* submit original work or work they have the right to contribute;
* comply with applicable open-source licenses;
* avoid submitting confidential or personally identifiable information;
* document significant architectural changes;
* include tests where appropriate;
* avoid introducing unnecessary dependencies;
* identify security implications of significant changes; and
* preserve compatibility with the documented Civic Engine interfaces where practical.

Contributors should not submit private legal case information, credentials, secrets, or other sensitive data to the public repository.

---

## 8. Contributions

Contributions may include:

* bug fixes;
* security fixes;
* tests;
* documentation;
* accessibility improvements;
* performance improvements;
* schema improvements;
* interoperability improvements; and
* new framework capabilities.

Contributors should use the repository's issue tracker and pull-request mechanisms where available.

For substantial architectural changes, contributors should open an issue or design discussion before implementation when practical.

---

## 9. Code Review

Changes to the core engine should receive maintainer review before being merged into the primary branch.

Security-sensitive changes should receive additional scrutiny.

Particular attention should be given to changes involving:

* user data;
* browser storage;
* network requests;
* Web Workers;
* WebAssembly;
* SQL construction;
* external dependencies;
* rule-bundle isolation; and
* authentication or authorization if such capabilities are added in the future.

---

## 10. Release Management

Releases should identify the relevant version of the Civic Engine packages.

Changes that affect the public schema or runtime API should be documented.

Security fixes should be identified appropriately in release notes.

Where a change can break existing rule bundles or implementations, the release documentation should describe the migration required.

---

## 11. Schema Compatibility

The rule-bundle schema is a public interface between Civic Engine and independent implementers.

Changes to required fields, node types, condition structures, or other schema semantics should therefore be treated as compatibility-sensitive changes.

The project should avoid silently changing the meaning of an existing valid bundle.

When a breaking schema change is necessary, the project should:

1. increment the appropriate schema or package version;
2. document the change;
3. provide migration guidance where practical; and
4. identify affected bundles or implementations.

---

## 12. Jurisdiction-Specific Content

Civic Engine does not centrally determine which legal rules apply in a jurisdiction.

Independent implementers are responsible for validating the content of their own rule bundles.

Implementers should consider review by appropriately qualified local experts before deploying applications that provide legal or civic guidance.

The existence of a template or example does not establish that its legal propositions apply in any particular jurisdiction.

---

## 13. Do-No-Harm Principle

Civic Engine is intended to support access to civic information and navigation.

Implementations should avoid design choices that could foreseeably cause material harm to users.

Particular care should be taken where applications concern:

* eviction;
* homelessness;
* immigration;
* family safety;
* criminal or civil proceedings;
* public benefits;
* financial hardship; or
* other high-stakes circumstances.

Implementers should provide appropriate escalation paths when automated navigation cannot safely resolve a user's situation.

---

## 14. Accessibility and Inclusion

Civic Engine aims to support applications that are accessible and usable by diverse populations.

Contributors are encouraged to consider:

* keyboard navigation;
* screen-reader compatibility;
* readable language;
* responsive layouts;
* low-bandwidth environments;
* mobile devices;
* multilingual implementations; and
* users with limited technical literacy.

Accessibility requirements may vary by jurisdiction and deployment context.

---

## 15. Transparency

The project should document material architectural changes and significant changes to privacy or security practices.

The repository should remain sufficiently documented for an independent developer to understand:

* how the engine works;
* how to create a rule bundle;
* how to validate a bundle;
* how to instantiate the UI shell; and
* how to deploy an implementation.

---

## 16. Platform Independence

Civic Engine is designed around open web technologies and documented interfaces.

The core architecture does not require a proprietary application platform or a Civic Engine-operated backend.

Where third-party dependencies are used, their role should be documented and dependencies should not be represented as project-owned infrastructure.

The project should prefer portable, openly documented technologies where practical.

---

## 17. Changes to Governance

This governance document may be updated as project participation increases.

Changes affecting:

* ownership;
* licensing;
* contribution rights;
* decision-making authority; or
* project stewardship

should be documented publicly in the repository.

---

## 18. Future Community Governance

Civic Engine is currently maintained under a maintainer-led model.

If the project develops a substantial external contributor community, governance may evolve to include additional maintainers, technical steering processes, community representatives, or other structures appropriate to the project's scale.

Any transition to a materially different governance model should be documented publicly.

---

## 19. Project Stewardship

The project's long-term objective is to maintain Civic Engine as reusable civic infrastructure rather than to restrict the framework to a single jurisdiction, organization, or application.

The project therefore prioritizes:

* interoperability;
* reusability;
* transparent documentation;
* open licensing;
* privacy-conscious architecture;
* security;
* accessibility; and
* separation between the core runtime and jurisdiction-specific content.
