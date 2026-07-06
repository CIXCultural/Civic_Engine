# Eviction Defense Bundle Template
Powered by the CourtMotion civic engine, CIX Cultural is please to offer a locale-agnostic starter template for building a legal defense navigator.
Fork this template, fill in your jurisdiction's legal data, and deploy a fully functional navigator — no backend, no server, no infrastructure costs.

## Who this is for
- Civil society organizations and legal aid networks working on housing rights
- Community paralegals and advocates who want a digital tool without hiring developers
- Researchers and policy organizations publishing tenant rights information
- Any jurisdiction, any language

## What you will build
A decision-tree navigator that guides tenants through eviction defense procedures in plain language, ending with a personalized action checklist and direct links to free legal resources. 
It runs entirely in the browser — no data leaves the device.

## Prerequisites
- A text editor
- Basic understanding of JSON (key-value pairs, arrays, objects)
- Knowledge of your jurisdiction's tenancy law, court procedures, and free legal resources
- A GitHub account (free) for hosting

No programming knowledge required.

---

## Step 1 — Fork or copy the template
Copy `index.json` from this directory into a new folder: Civic-Engine/bundles/YOUR-JURISDICTION-eviction-defense/rules/index.json

Naming convention: `[country-region-city]-eviction-defense`

Examples:
- `kenya-nairobi-eviction-defense`
- `uk-england-eviction-defense`
- `ireland-dublin-eviction-defense`
- `brazil-saopaulo-eviction-defense`

---

## Step 2 — Fill in civicData
The `civicData` block is your jurisdiction's factual data. Every field you define here becomes available as a `{{placeholder}}` anywhere in your node text.

Replace every `[REPLACE: ...]` value with your jurisdiction's actual information:

```json
"civicData": {
  "jurisdiction_name": "Nairobi, Kenya",
  "primary_statute": "Landlord and Tenant (Shops, Hotels and Catering Establishments) Act, Cap 301",
  "notice_days_nonpayment": "30",
  "court_name": "Business Premises Rent Tribunal",
  "legal_aid_phone": "+254 20 271 2767",
  ...
}

Add as many custom fields as your jurisdiction needs. If your jurisdiction has a unique procedural requirement (like a court registry deposit, a mandatory mediation step, or a rental license requirement), add a field for it and reference it in your node text.

## Step 3 — Customize the nodes
Nodes are the questions and checklists tenants see. The template includes the standard node set:

Node	Purpose
start	Entry point — what has the tenant received?
notice_type	Branch on type of notice
notice_pay	Nonpayment notice — can they pay?
notice_violation	Lease violation — can they cure it?
notice_no_cause	No-cause notice — any just-cause protections?
defenses_check	Habitability defense
retaliation_check	Retaliation defense
rental_assistance_check	Has tenant applied for assistance?
court_received	Court papers received — urgency branch
find_hearing_date	Tenant doesn't know hearing date
preemptive_advice	Tenant worried before receiving notice
get_help_now	Tenant can't identify notice type
checklist_pay_now	Action: pay rent
checklist_cure	Action: fix lease violation
checklist_apply_assistance	Action: apply for assistance
checklist_main	Full hearing action checklist
To add a node: add a new key to the nodes object. Any node can link to it via "next": "your_node_key".

To remove a node: delete it and update any next references pointing to it.

Node types:

question — shows buttons, routes tenant to next node based on their answer
terminal — shows an action checklist, ends the flow
branch — silent routing node based on flags set earlier (no UI shown)

## Step 4 — Translate
Replace all English text in phase, text, label, and items[].text with your language. The engine renders whatever text is in the bundle — no code changes needed.

Set the language field at the top of the bundle to your BCP 47 language tag (e.g. "sw" for Swahili, "pt-BR" for Brazilian Portuguese, "ar" for Arabic).

For right-to-left languages (Arabic, Hebrew, Urdu), add "dir": "rtl" to the bundle root. The navigator shell respects this automatically.

## — Remove template metadata
Before publishing, remove all keys starting with _:

_template
_templateVersion
_instructions
All _note keys inside nodes
These are authoring aids, not part of the bundle schema.

## Step 6 — Validate
Run the bundle through the schema validator:
npx ajv validate -s civic-engine/packages/schema/src/bundle.schema.json \
  -d civic-engine/bundles/YOUR-BUNDLE/rules/index.json

## Step 7 — Deploy
The simplest deployment: add your bundle to the CIXCultural/courtnav repository and open a pull request. Once merged, it is live.

To deploy your own independent instance:

# Clone the engine
git clone https://github.com/CIXCultural/courtnav
cd courtnav

# Add your bundle
cp -r your-bundle civic-engine/bundles/

# Deploy to Cloudflare Pages (free)
./civic-engine/deploy.sh cloudflare

# Or deploy to GitHub Pages (free)
./civic-engine/deploy.sh pages

# Or pin to IPFS (censorship-resistant, free)
./civic-engine/deploy.sh ipfs

Bundle schema reference
Full schema: civic-engine/packages/schema/src/bundle.schema.json

Required top-level fields
Field	Type	Description
version	string	Semver, e.g. "0.1.0"
domain	string	Legal domain, e.g. "eviction-defense"
jurisdiction	string	ISO 3166 code
entryNode	string	Key of the first node shown
nodes	object	All nodes keyed by ID
Optional top-level fields
Field	Type	Description
language	string	BCP 47 tag, default "en"
dir	string	"ltr" or "rtl", default "ltr"
publishedAt	string	ISO date
civicData	object	Jurisdiction facts available as {{placeholders}}
Node fields
Field	Type	Applies to	Description
type	string	all	"question", "terminal", or "branch"
phase	string	question, terminal	Small label shown above the question
text	string	question	The question shown to the tenant
options	array	question	Answer buttons
items	array	terminal	Checklist items
conditions	array	branch	Routing conditions
effectiveAfter	string	all	ISO date — node only shown after this date
effectiveBefore	string	all	ISO date — node only shown before this date
Examples
Completed bundles you can learn from:

civic-engine/bundles/nyc-housing-demo/ — New York City (complex, multi-path)
civic-engine/bundles/florida-eviction-defense/ — Florida (simple statute, critical procedural trap)
civic-engine/bundles/maryland-baltimore-eviction-defense/ — Baltimore (rental license defense)
civic-engine/bundles/pennsylvania-philly-eviction-defense/ — Philadelphia (mandatory mediation, right to counsel)
Get help
Open an issue on GitHub: github.com/CIXCultural/courtnav/issues
Read the full authoring guide: civic-engine/CONTRIBUTING.md
Email: [REPLACE with CIX Cultural contact email]
License
MIT — free to use, fork, translate, and deploy for any community purpose.
