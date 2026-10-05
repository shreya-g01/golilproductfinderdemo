# Gulf Product & Application Finder 2.0 – Prototype

Concept prototype for the Gulf Oil Lubricants India website revamp. All data is demonstration data.

## 1. How to run
Unzip, then double-click `index.html` (Chrome recommended). No server, install or internet connection is needed.
To show the official logo, save it as `assets/gulf-logo.png` (see `assets/README.txt`). Until then a labelled placeholder is shown.

## 2. What it demonstrates
1. Multi-path discovery: vehicle, equipment, industry, application, specification, problem, product
2. Application-based recommendations with a "Why this product?" explanation
3. Equipment / OEM / model relationships
4. Specification matching (API, ACEA, JASO, ILSAC, ISO VG, DIN, NLGI, SAE)
5. Problem-based search (problem → solution → product)
6. Technical data rendered as HTML, with TDS / specification / approval views
7. Product comparison (up to 3)
8. Lead capture with validation and a CRM-shaped payload
9. Distributor and Gulf Garage finder (pincode or city)
10. SEO/GEO entity architecture: "Explore by" entry points, entity chains, semantic HTML, JSON-LD

## 3. Demo journey
Click **Try a Demo Journey** (top bar or hero). It plays:
Construction → Backhoe Loader → JCB → 3DX → Heavy duty → High temperature → recommendation.

Suggested management walkthrough (about 5 minutes):
1. Landing page: six pathways and the search bar
2. Try a Demo Journey, then read "Why this product?"
3. Switch the "What are you looking for?" tabs (engine oil, hydraulic fluid, gear oil, grease)
4. View Product: HTML technical data, compatibility, documents
5. Add to Compare on two or three products, then Compare Products
6. Search "API CK-4", then "JCB 3DX"
7. Talk to a Gulf Technical Expert: submit the form
8. Find a Distributor: enter "Mumbai"
9. Management Demo and Prototype Analytics (top bar)

## 4. Data structure
All data sits in the `DATA` section of `index.html`.

| Constant | Holds |
|---|---|
| `PRODUCTS` | id, name, category, type (application), viscosity, segments, industries, specifications, approvals, tags (operating conditions and problems), applications, benefits, description, technicalData, tds |
| `VEHICLES` + `vehicleSystems()` | vehicle type, make, model, fuels → products per need |
| `EQUIPMENT` + `SYS` | sector, equipment type, OEMs, models → products per system |
| `TAGS`, `CONDITIONS`, `PROBLEMS` | shared vocabulary linking conditions and problems to products |
| `locations()` | mock distributors and garages |

Entity model: Product ↔ Category · Application · Industry · Vehicle · Equipment · OEM · Model · Specification · Approval · Operating condition · Problem · Benefits · Technical data · TDS · Lead CTA.

## 5. Replacing mock data with a real API
The UI reads data through `DataService` and `recommend(ctx)`.
- Replace `DataService` methods with `fetch()` calls (`/api/products`, `/api/products/{id}`, `/api/locations`).
- Replace `vehicleSystems()` and `SYS` with the validated lubrication chart / OEM specification table.
- Keep the `recommend(ctx)` contract: input `{subject, trail, systems, need, conditions}`, output `{primary, alternatives, reasons}`.
- Fill `approvals` from the Gulf technical database; the product page and approvals view already have the slot.
- Add a pack image URL per product and swap `packSVG()` for an `<img>`.

## 6. Sending leads to Salesforce
`LeadService.submit(payload)` is the single integration point. The payload already uses Lead-style fields
(`LastName`, `Company`, `MobilePhone`, `Email`, `City`, `LeadSource`, plus custom fields such as
`User_Type__c`, `Product_Interest__c`, `CTA__c`, `Finder_Context__c`).
Production flow: Website form → POST `/api/leads` (middleware: validation, consent, spam control) → Salesforce Web-to-Lead or REST API → assignment rules by user type, city and product.

## 7. Prototype-only areas
- Products, grades, specifications, vehicles, equipment models and their mappings are illustrative, not validated
- OEM approvals are deliberately left empty
- Recommendation scoring is a simple rule set, not Gulf technical guidance
- Distributor and garage locations are invented; "Get Directions" opens a map search for the area only
- Lead form does not send data anywhere; analytics events stay in the browser tab
- Header, footer and styling follow the brief, not a pixel audit of the live Gulf site
- Canonical, Open Graph and JSON-LD use placeholder URLs; the page is set to `noindex`

## 8. Recommended next steps
1. Validate product, specification and approval data with the technical team
2. Build the product / vehicle / equipment master as a structured database (TDS digitization)
3. Align header, footer and components with the live site's design system and add the official logo and pack shots
4. Give every entity its own indexable URL (product, OEM, model, industry, application, specification)
5. Connect the lead form to Salesforce and define routing rules
6. Connect the locator to the real distributor and garage database
7. Usability test with mechanics, fleet owners and industrial buyers
