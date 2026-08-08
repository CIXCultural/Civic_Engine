# Civic Engine Authoring Guide

## Overview

Civic Engine is a declarative framework for building jurisdiction-specific civic and public-interest navigators.

Applications are authored primarily as data rather than application code. A bundle defines:

* the jurisdiction and domain;
* jurisdiction-specific civic data;
* questions presented to users;
* branching conditions;
* terminal action checklists;
* links to external resources;
* effective dates for rules;
* and other application-specific configuration.

The Civic Engine runtime evaluates the bundle and the generic UI shell renders the resulting navigation.

This separation allows organizations to create new civic applications without modifying the underlying engine, and 
by understanding that using Civic Engine can be distilled into 10 steps:

1. Choose your domain: Select the specific civic or public-interest area.
2. Copy the template: Start with a fresh, pre-configured bundle template.
3. Define your jurisdiction: Specify the target geographic or administrative area.
4. Add your civic data: Input the required jurisdiction-specific regulations and facts.
5. Create your questions: Draft the queries that users will see.
6. Define the possible answers: Establish the valid response choices for users.
7. Connect nodes: Link each answer to its respective next node.
8. Create the checklist: Build the final action list for terminal screens.
9. Validate the bundle: Run checks to ensure data integrity and flow.
10. Publish it: Deploy the validated bundle to the runtime engine.

Civic applications are created by authoring a bundle, not rewriting software.

---

## Architecture

A Civic Engine application consists of three principal layers:

```text
Civic Engine Runtime
        │
        ├── Rule Evaluator
        ├── Worker
        ├── Stream Parser
        ├── Query Layer
        └── Memory Guard
                │
                ▼
        Bundle Schema
                │
                ▼
        Jurisdiction Bundle
                │
        ├── Rules
        └── Civic Data
                │
                ▼
        Generic UI Shell
                │
                ▼
        Civic Navigator
```

The engine provides generic capabilities. The bundle provides domain- and jurisdiction-specific content.

### The engine should not contain jurisdictional rules

Do not modify the engine to encode facts such as:

* court deadlines;
* agency names;
* local filing procedures;
* addresses;
* telephone numbers;
* local eligibility rules;
* local legal terminology.

These belong in the bundle or associated civic data.

---

# Creating a Bundle

A bundle is a JSON document conforming to the Civic Engine bundle schema.

The basic structure is:

```json
{
  "version": "0.1.0",
  "publishedAt": "2026-08-08",
  "domain": "your-domain",
  "jurisdiction": "YOUR-JURISDICTION",
  "language": "en",
  "entryNode": "start",
  "civicData": {},
  "nodes": {}
}
```

The exact required fields are defined by:

`packages/schema/bundle.schema.json`

Always validate a bundle against the schema before publishing it.

---

# 1. Version

The `version` field identifies the version of the bundle.

Use Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

For example:

```json
"version": "1.0.0"
```

Increment:

* **MAJOR** for incompatible changes to the bundle;
* **MINOR** for new functionality that remains compatible;
* **PATCH** for corrections that do not change the bundle's structure.

Bundle versions are independent from the Civic Engine runtime version.

---

# 2. Publication Date

`publishedAt` identifies when the bundle was published.

Example:

```json
"publishedAt": "2026-08-08"
```

Jurisdiction-specific information can become outdated quickly. Bundle authors should review and republish bundles when relevant laws, procedures, deadlines, agencies, or contact information change.

---

# 3. Domain

`domain` identifies the civic problem addressed by the application.

Examples:

```json
"domain": "eviction-defense"
```

```json
"domain": "housing-appeals"
```

```json
"domain": "benefits-access"
```

```json
"domain": "small-claims"
```

Use a descriptive, stable identifier.

---

# 4. Jurisdiction

`jurisdiction` identifies the geographic or governmental jurisdiction to which the bundle applies.

Examples:

```json
"jurisdiction": "US-NY-NYC"
```

```json
"jurisdiction": "US-CA-SF"
```

```json
"jurisdiction": "KE-NBO"
```

The jurisdiction identifier should be sufficiently specific to prevent users from confusing one bundle's rules with another jurisdiction's rules.

---

# 5. Language

When supported by the bundle schema, `language` identifies the primary language of the user-facing content.

Use a BCP 47 language tag.

Examples:

```json
"language": "en"
```

```json
"language": "es"
```

```json
"language": "pt-BR"
```

If an application supports multiple languages, use separate localized bundles or the project's supported localization mechanism rather than mixing incompatible content in a single field.

---

# 6. Entry Node

`entryNode` specifies where navigation begins.

Example:

```json
"entryNode": "start"
```

The corresponding node must exist in `nodes`.

---

# 7. Civic Data

`civicData` contains jurisdiction-specific values that can be inserted into user-facing text.

Example:

```json
"civicData": {
  "jurisdictionName": "Example City",
  "courtName": "Example Housing Court",
  "courtPhone": "555-0100",
  "appealDeadlineDays": "30",
  "selfHelpUrl": "https://example.gov/self-help"
}
```

Values can be referenced using double-brace interpolation:

```text
{{courtName}}
```

For example:

```json
{
  "text": "Contact {{courtName}} at {{courtPhone}}."
}
```

The resulting user-facing text becomes:

```text
Contact Example Housing Court at 555-0100.
```

### Keep jurisdictional data out of the engine

If a fact can vary between jurisdictions, it should normally be represented in the bundle rather than hard-coded into the runtime.

---

# 8. Nodes

The `nodes` object contains the application's decision tree.

Each node has a unique identifier:

```json
"nodes": {
  "start": {},
  "next_question": {},
  "final_checklist": {}
}
```

Node identifiers should be:

* unique;
* descriptive;
* stable;
* written consistently.

Three principal node types are supported:

```text
question
branch
terminal
```

---

# Question Nodes

A question node collects information from the user or presents a decision.

Example:

```json
{
  "type": "question",
  "phase": "Step 1 — Your Situation",
  "text": "What type of notice did you receive?",
  "options": [
    {
      "label": "Nonpayment notice",
      "value": "nonpayment",
      "setsFlag": "noticeType",
      "next": "nonpayment"
    },
    {
      "label": "Other notice",
      "value": "other",
      "setsFlag": "noticeType",
      "next": "other_notice"
    }
  ]
}
```

Each option may:

* display a label;
* assign a value;
* set a flag;
* specify the next node.

---

# Flags

Flags store information collected during navigation.

For example:

```json
"setsFlag": "noticeType"
```

combined with:

```json
"value": "nonpayment"
```

results in a flag conceptually equivalent to:

```text
noticeType = nonpayment
```

Flags can subsequently be used by branch conditions.

Choose descriptive flag names and use a consistent naming convention throughout a bundle.

---

# Date Inputs

Question nodes can request a date.

Example:

```json
{
  "type": "question",
  "text": "When were you served?",
  "inputType": "date",
  "flagName": "serviceDate",
  "next": "next_step"
}
```

The selected date is stored in the specified flag.

Authors should not assume that collecting a date automatically calculates a legal deadline. If deadline calculations are required, they should be explicitly implemented and validated rather than inferred from a simple date field.

---

# Branch Nodes

A branch node evaluates conditions against accumulated flags.

Example:

```json
{
  "type": "branch",
  "conditions": [
    {
      "when": {
        "flag": "noticeType",
        "eq": "nonpayment"
      },
      "next": "nonpayment_path"
    },
    {
      "when": {
        "flag": "noticeType",
        "eq": "other"
      },
      "next": "other_path"
    }
  ]
}
```

The evaluator selects the first matching condition.

A fallback condition can be represented with:

```json
{
  "when": null,
  "next": "fallback"
}
```

Put specific conditions before fallback conditions.

---

# Supported Conditions

The evaluator supports condition forms such as:

### Equality

```json
{
  "flag": "borough",
  "eq": "manhattan"
}
```

### Inequality

```json
{
  "flag": "status",
  "neq": "complete"
}
```

### Truthiness

```json
{
  "flag": "hasNotice",
  "truthy": true
}
```

### Membership

```json
{
  "flag": "borough",
  "in": ["manhattan", "bronx"]
}
```

Conditions can also be combined where supported by the evaluator.

Authors should keep decision logic explicit and easy to audit.

---

# Terminal Nodes

A terminal node produces an action checklist.

Example:

```json
{
  "type": "terminal",
  "phase": "Next Steps",
  "items": [
    {
      "text": "Contact {{legalAidName}}.",
      "urgent": true
    },
    {
      "text": "Review the court's self-help resources.",
      "link": "{{selfHelpUrl}}",
      "urgent": false
    }
  ]
}
```

Terminal nodes should provide concrete next steps rather than merely restating the user's situation.

Where appropriate, organize actions according to urgency.

---

# Checklist Items

Checklist items support:

```text
text
link
urgent
```

Example:

```json
{
  "text": "Call the court immediately.",
  "link": "tel:555-0100",
  "urgent": true
}
```

Use `urgent: true` only where the action genuinely requires prompt attention.

---

# Links

Links may contain interpolated civic data.

Example:

```json
{
  "text": "Court website",
  "link": "{{courtUrl}}"
}
```

Telephone links may also be used:

```json
{
  "text": "Call legal aid.",
  "link": "tel:{{legalAidPhone}}"
}
```

Authors are responsible for ensuring that external URLs and telephone numbers are current.

---

# Phases

The optional `phase` field provides a human-readable progress or section label.

Example:

```json
"phase": "Step 2 — Prepare for Court"
```

Phases are presentation metadata. They should not contain logic required for evaluating the decision tree.

---

# Temporal Rules

Nodes may specify an effective period:

```json
{
  "type": "question",
  "effectiveAfter": "2026-01-01",
  "effectiveBefore": "2026-12-31"
}
```

These fields allow a node to become active or inactive based on the current date.

Use temporal rules when a rule genuinely has a defined effective period.

When replacing a rule, consider preserving the previous version for auditability rather than silently changing historical content.

---

# Superseding Rules

Nodes may identify the node they replace:

```json
"supersedes": "previous_node"
```

This metadata can help authors and maintainers understand changes to jurisdictional rules.

It does not, by itself, create a migration or version-control mechanism.

Use Git history and bundle versioning for authoritative change tracking.

---

# Authoring Jurisdictional Content

Civic Engine does not determine whether a legal or civic rule is correct.

The bundle author is responsible for the substantive content of the bundle.

Before publishing a jurisdiction-specific bundle, verify:

* statutory references;
* procedural deadlines;
* filing requirements;
* eligibility requirements;
* agency names;
* court names;
* addresses;
* telephone numbers;
* URLs;
* emergency resources;
* language and terminology;
* effective dates.

For legal navigators, authors should consider review by an appropriately qualified attorney, legal aid organization, court-help organization, or other subject-matter expert.

Civic Engine is infrastructure. It does not independently validate the legal correctness of the content supplied by a bundle author.

---

# Avoiding Hard-Coded Assumptions

A bundle should describe the rules of its own jurisdiction.

Do not assume that a procedure from one jurisdiction exists elsewhere.

For example, do not copy:

```text
30-day appeal period
```

into another jurisdiction merely because another bundle uses a 30-day period.

Instead, represent the local rule through the new bundle's own `civicData` and decision tree.

Similarly, do not assume that:

* the same courts exist;
* the same deadlines apply;
* the same defenses exist;
* the same forms are required;
* the same legal-aid organizations operate;
* the same terminology is used.

---

# Template-Based Authoring

New authors should normally begin with an existing template rather than copying a production bundle.

Templates provide:

* example node structures;
* placeholder civic data;
* recommended authoring patterns;
* warnings about jurisdiction-specific assumptions.

For example:

```text
templates/
└── eviction-defense-template/
    ├── index.json
    └── README.md
```

The template should be adapted to the author's jurisdiction before publication.

Do not publish a template containing unresolved `[REPLACE]` placeholders.

---

# Bundle Data

Large or frequently changing datasets should generally be kept separate from the rule tree.

For example:

```text
bundle/
├── rules/
│   └── index.json
└── data/
    └── courts.json
```

The rule bundle can then reference appropriate civic data rather than embedding large datasets directly into the decision tree.

This separation is particularly useful for:

* court directories;
* government offices;
* service providers;
* geographic datasets;
* benefits locations;
* census or demographic data;
* other structured civic datasets.

---

# Privacy

Authors should minimize collection of personal information.

A bundle should collect only information necessary to provide the intended civic navigation.

Avoid placing personally identifying information into:

* bundle files;
* `civicData`;
* static datasets;
* logs;
* URLs;
* query parameters.

Do not put secrets, API keys, credentials, or private user records into a public bundle.

Review `PRIVACY.md` and `SECURITY.md` before publishing an application.

---

# Security

Bundle authors are responsible for reviewing external links and data sources.

Do not assume that an external URL is trustworthy merely because it appears in a civic bundle.

Where possible:

* prefer official government or institutional resources;
* use HTTPS;
* verify telephone numbers;
* verify links before publication;
* avoid embedding untrusted executable content;
* avoid collecting unnecessary user data.

The Civic Engine runtime provides security mechanisms, but it cannot make unsafe bundle content safe.

---

# Testing a Bundle

Before publishing, verify at minimum:

1. The bundle passes schema validation.
2. The `entryNode` exists.
3. Every `next` reference points to an existing node.
4. Every branch has an appropriate fallback or complete set of conditions.
5. Every terminal node contains actionable content.
6. Every interpolation placeholder has a corresponding value.
7. External links resolve correctly.
8. Telephone numbers are current.
9. Dates and deadlines have been reviewed.
10. The complete decision path can be tested from beginning to end.

Test both ordinary and unexpected paths.

For example:

```text
Start
  ↓
Question A
  ↓
Question B
  ↓
Branch
  ├── Path 1
  ├── Path 2
  └── Fallback
       ↓
Terminal
```

A user should never encounter a dead-end node, missing node, broken link, or unexplained branch.

---

# Publishing Checklist

Before publishing a bundle:

### Content

* [ ] Jurisdiction is correct.
* [ ] Domain is correct.
* [ ] Language is correct.
* [ ] Legal and civic rules have been reviewed.
* [ ] Deadlines have been verified.
* [ ] Agency and court information is current.
* [ ] Emergency resources are current.
* [ ] External links have been tested.

### Technical

* [ ] Bundle passes JSON Schema validation.
* [ ] Entry node exists.
* [ ] All node references resolve.
* [ ] No unresolved `[REPLACE]` placeholders remain.
* [ ] Interpolation variables resolve.
* [ ] Decision paths have been tested.
* [ ] No secrets or credentials are included.

### Governance

* [ ] Bundle version has been incremented appropriately.
* [ ] `publishedAt` is correct.
* [ ] Significant changes are recorded in the project's changelog.
* [ ] Appropriate subject-matter review has occurred.
* [ ] The responsible organization or maintainer is documented.

---

# Creating a New Civic Application

A new application generally requires only:

1. A jurisdiction-specific bundle.
2. Any required civic data.
3. A host page using the generic UI shell.

The underlying engine should not need to be modified unless the application requires a capability that is genuinely outside the existing engine's abstraction.

A typical application structure is:

```text
my-civic-app/
├── rules/
│   └── index.json
├── data/
│   └── civic-data.json
└── ...
```

The application can then load its bundle through the generic shell:

```js
import { CivicShell } from '@civic-engine/ui-shell';

// Point the generic shell at the application's rule bundle.
const shell = new CivicShell({
  bundleUrl: '/rules/index.json'
});

// Mount the navigator into the host page.
shell.mount(document.getElementById('app'));
```

The host application is responsible for branding, deployment, and any additional presentation requirements. The decision logic remains in the declarative bundle.

---

# Design Principle

The central authoring principle is:

> **Put civic policy in the bundle and generic computation in the engine.**

If a change is required because one jurisdiction has a different rule, first ask whether the difference belongs in the bundle.

If the change would benefit every Civic Engine application regardless of jurisdiction, it may belong in the engine.

This distinction preserves the portability and reusability of the framework.

---

# Further Documentation

See:

* `README.md` — project overview and architecture
* `packages/schema/` — bundle schema and validation
* `templates/` — starter bundles
* `PRIVACY.md` — privacy practices
* `SECURITY.md` — security practices
* `GOVERNANCE.md` — project governance
* `CONTRIBUTING.md` — contribution process
* `CODE_OF_CONDUCT.md` — community standards
* `CHANGELOG.md` — project change history
