# History

## Origins: The CourtMotion Production Environment

Civic Engine originated from the development of **CourtMotion**, a production legal-technology application designed to help people navigate court procedures and appellate processes.

The initial implementation necessarily combined several concerns within the application: jurisdiction-specific legal rules, procedural deadlines, user questions, navigation logic, and the presentation of resulting actions.

This created a recurring software-maintenance problem. The substantive rules could change while the underlying interaction mechanics remained substantially the same. A change to a deadline, procedural requirement, jurisdictional resource, or decision pathway could therefore require changes to application logic even when the underlying software behavior had not changed.

The experience exposed a broader architectural question:

> **What if jurisdiction-specific civic knowledge could be changed without rewriting the application that executes it?**

## The Architectural Breakthrough: Decoupling Rules from Runtime

The answer was to separate the **civic knowledge layer** from the **software runtime**.

The underlying mechanics of a civic navigator are relatively stable:

* presenting questions;
* recording user responses;
* maintaining state;
* evaluating conditions;
* navigating a decision tree;
* incorporating jurisdiction-specific data; and
* producing an actionable terminal result.

The content and rules driving those mechanics, however, are inherently variable.

Civic Engine emerged by extracting the reusable mechanics into a domain-agnostic runtime and representing jurisdiction-specific logic as structured data.

This resulted in three principal abstractions:

1. **Runtime** — evaluates and executes civic decision logic.
2. **Schema** — defines the structure of a valid rule bundle.
3. **Bundle** — contains the domain- and jurisdiction-specific questions, conditions, data, and actions.

The result is a separation between **how a civic application operates** and **what a particular jurisdiction requires it to do**.

## From Application to Framework

The next step was to make the extracted architecture independently reusable.

Rather than treating the CourtMotion implementation as a one-off application, Civic Engine generalizes the underlying pattern so that a new civic application can be created by authoring a new bundle rather than rebuilding the runtime.

The repository therefore includes not only the execution engine, but also:

* a machine-readable bundle schema;
* a framework-independent UI shell;
* reusable templates;
* an authoring guide;
* validation infrastructure;
* privacy and security documentation; and
* governance and contribution policies.

This changes the unit of reuse from the **application** to the **infrastructure that produces applications**.

## Transition to Open Civic Infrastructure

Civic Engine was subsequently released under the MIT License as an open-source project.

The objective is to make the underlying architecture available as reusable civic infrastructure rather than keeping the abstraction inside a single legal-technology product.

Organizations can use the runtime for different domains and jurisdictions while maintaining their own domain-specific bundles. The engine does not need to encode the substantive law of every jurisdiction; it provides the machinery for executing the structured knowledge supplied by the bundle.

The project therefore represents a progression:

```text
CourtMotion
    │
    │ recurring architectural problem
    ↓
Separation of civic rules from application logic
    │
    │ abstraction
    ↓
Reusable runtime + schema + UI shell
    │
    │ generalization
    ↓
Civic Engine
    │
    │ open source
    ↓
Reusable civic infrastructure
```

Civic Engine's origin is therefore practical rather than theoretical: it is an abstraction extracted from the experience of building a real civic application and generalized so that the same architectural pattern can be reused by other organizations and jurisdictions.
