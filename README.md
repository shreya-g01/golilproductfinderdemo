# Gulf Lubrication Intelligence – Prototype

Concept prototype for the Gulf Oil Lubricants India website revamp. **All data is demo / illustrative.**

## What this prototype is
A working front-end prototype of a connected lubrication platform: seven modules that read one shared data model.
It shows the product experience and the architecture. It does not make Gulf technical claims.

## How to run
Unzip and double-click `index.html` (Chrome recommended). No server, install or internet connection is needed.
The official Gulf logo supplied for the prototype is included as `assets/gulf-logo.png` and is used unmodified in the header and footer.
"Reset prototype data" in the footer clears passports, samples and analytics stored in the browser.

## Platform architecture
```
index.html   page shell, header, footer, SEO metadata, JSON-LD slots
style.css    Gulf-style design system
data.js      central data layer (gulfData) – the only source of data
app.js       routing, engines (search, recommendation, advisor, oil analysis, TCO), rendering
```
Routes mirror production URLs, for example `#/equipment/jcb/3dx`, `#/products/superfleet-supreme`,
`#/specifications/api-ck-4`, `#/problems/high-oil-temperature`, `#/knowledge/hydraulic-oil-overheating`,
`#/industries/construction`, `#/applications/construction`, `#/oems/jcb`.

## The seven modules
1. **AI Advisor** – rule-based simulated advisor. Recognises equipment, system, operating conditions and oil-analysis parameters, then answers from the shared data. No external AI service.
2. **Product Finder** – eight entry points (vehicle, equipment, industry, application, problem, specification, product, OEM), "Why this product?" reasoning, comparison of up to three products.
3. **Equipment Database** – 21 demo machines and vehicles with a lubrication requirements table and links to every other module.
4. **Oil Analysis** – sample workflow, report with status per parameter, interpretation, recommended action and an interactive trend chart.
5. **TCO Calculator** – editable inputs, live results, cost breakdown, clearly labelled as illustrative.
6. **Lubrication Passport** – per-asset record: lubrication profile, timeline, maintenance events, saved TCO scenarios, verified products, demo QR. Stored in the browser.
7. **Technical Knowledge** – 14 articles in 12 categories plus an interactive knowledge graph.

Also included: global search, distributor and garage finder, product authentication, reusable expert lead form, analytics dashboard.

## Demo journey
**Run Full Demo** (top bar or home page) plays ten steps, about 15 seconds each. Use Next / Pause in the controller to go at your own pace.
1. Equipment: JCB 3DX
2. Application: Construction → Backhoe Loader → JCB → 3DX → Heavy duty + High temperature
3. Product Finder: recommended Gulf product
4. Why this product?
5. Oil Analysis: report OA-004, iron flagged, rising trend
6. AI Advisor interprets the result
7. TCO Calculator: illustrative cost scenario
8. Lubrication Passport: JCB 3DX added as JCB-001
9. Knowledge Graph: relationships highlighted
10. Lead form: "Request Gulf Technical Assessment" with context carried over

**Management Demo** opens a one-screen explanation of what is being built.

## Data architecture
`gulfData` in `data.js` holds: `products`, `equipment`, `oems`, `industries`, `applications`, `systems`, `conditions`, `problems`,
`specifications` (derived from products), `oilParams`, `oilAnalysis`, `maintenanceEvents`, `technicalArticles`, `distributors`, `garages`, `authCodes`.
Records reference each other by id: equipment → OEM, industry, systems → candidate products → specifications; articles → equipment, products, systems, problems, parameters; reports → equipment, system, product.

## Recommendation engine
`recommend(ctx)` in `app.js` is a pure function. Input: subject, candidate products per system, active system, operating conditions.
Output: primary product, alternatives, and the reasons shown under "Why this product?".
The Finder, Equipment Database, AI Advisor, Passport, TCO Calculator and Knowledge Graph all call it.
In production, replace the scoring with the validated lubrication chart and OEM specification table and keep the same contract.

## Knowledge graph
`buildGraph(equipment)` generates nodes and edges from the central data for one machine across eleven layers
(OEM → equipment → application → condition → system → specification → product → evidence → oil analysis → maintenance → TCO) and draws them as SVG.
Selecting a node highlights everything upstream and downstream. No graph database is used.

## Future API architecture
```
Frontend → API Gateway → Central Gulf Database
   (Product Data · Equipment Data · Technical Knowledge · Oil Analysis · Customer Data)
   → Salesforce CRM · ERP · Payment Systems · WhatsApp Business API
```
Seams in the code are marked `PRODUCTION:`. `Store` (browser storage) becomes authenticated API calls; `gulfData` becomes API responses.

- **Salesforce** – `LeadService.submit(payload)` already builds a Lead-shaped payload (`LastName`, `Company`, `MobilePhone`, `Email`, `City`, `LeadSource` and custom fields including `Platform_Context__c`). Flow: form → `/api/leads` → validation, consent, spam control → Salesforce → assignment rules.
- **ERP** – product master, batch data for product authentication, distributor master and pricing.
- **WhatsApp Business** – lead confirmation, service reminders from the Passport, oil analysis alerts, QR deep links.
- **Oil analysis** – laboratory system results attached to a sample ID; limits set per product and system by the technical team; flags written to the Passport.

## Production considerations
- Validate every product, specification, approval, interval and analysis limit with the technical team
- Customer accounts, consent, access control and data retention for equipment, analysis and location data
- Server-side rendering of entity pages and JSON-LD so crawlers and AI engines read them without JavaScript
- A grounded AI advisor with guardrails and escalation to a human expert
- Alignment with the live site's design system and pack imagery
- Accessibility audit and performance budget

## Prototype-only assumptions
- Products, grades, specifications, equipment mappings, capacities and intervals are illustrative
- OEM approvals are deliberately empty; OEM names identify equipment and do not imply approval
- Oil analysis values and limits are invented; user-submitted samples generate values from hours on oil
- TCO defaults, prices and the Gulf scenario's interval and maintenance impact are editable assumptions, not claims
- The AI Advisor is rule-based; phrasing outside its patterns gets a general answer
- The QR is a demo pattern and is not scannable
- Locations, phone numbers, batch details and analytics seed numbers are invented
- Leads are not sent anywhere; passports and events are stored only in the browser
- Header, footer and styling follow the written brief, not an audit of the live Gulf site
