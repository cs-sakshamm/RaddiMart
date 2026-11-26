# RADDIMART — Problem Statement, Proposed Solution and Expected Impact

## 1. Project Overview

RADDIMART is a digital marketplace designed to connect consumers, local Kabadiwalas, large scrap aggregators and formal recycling facilities through a unified, traceable recycling workflow.

Its primary objective is to improve the organization, transparency and connectivity of the informal scrap collection chain while helping recyclable materials move toward responsible recycling channels.

Tagline:

"Connecting Every Scrap Collector to a Greener Tomorrow."

## 2. The Problem

India's scrap collection and recycling ecosystem relies significantly on informal local collectors and Kabadiwalas who recover recyclable materials from households and small businesses.

However, the different stages of this value chain often operate through disconnected networks and undocumented handovers.

Consumers commonly sell scrap through ad-hoc interactions and may lack reliable indicative price benchmarks or convenient pickup coordination.

Local Kabadiwalas frequently depend on informal buyer networks, with limited digital visibility into competing buyers, collection opportunities and structured earning histories.

Large Kabadiwalas and aggregators must source material from fragmented upstream collectors and may lack standardized visibility into incoming material lots.

Formal recycling facilities need organized and categorized material streams, but sourcing and tracking material across multiple informal collection tiers can be difficult.

Material handovers may be recorded through verbal agreements or informal records, limiting the availability of standardized digital transaction histories and traceability.

E-waste presents an additional concern because discarded electronic materials may enter unsafe informal processing channels rather than being directed toward appropriate recycling facilities.

### 2.1 Key Problem Areas

1. Lack of transparent scrap price visibility for consumers and collectors.
2. Fragmented networks connecting local Kabadiwalas and larger aggregators.
3. Limited digital visibility into collection opportunities.
4. Difficulty organizing and tracking material lots.
5. Limited rate comparison and discovery between aggregators and recyclers.
6. Lack of standardized digital handover records.
7. Limited transaction-level traceability across stakeholder handovers.
8. Risk of e-waste being diverted toward unsafe informal processing channels.

These points describe the structural problem context of the project. Do not attach fabricated survey statistics or claim that every collector or recycler experiences every issue.

## 3. The Proposed Solution — RADDIMART

RADDIMART proposes a responsive, web-based, four-stakeholder marketplace connecting:

1. Consumers / Households.
2. Local Kabadiwalas / Collectors.
3. Large Kabadiwalas / Scrap Aggregators.
4. Authorized Recyclers.

The platform digitizes the movement of scrap from initial listing and collection to aggregation, recycler selection and digital handover.

### 3.1 Consumer Connection

Consumers can:
- Select scrap categories and subcategories manually.
- Enter approximate weight and material condition.
- Add a pickup location and preferred pickup time.
- Optionally upload a reference photograph.
- View indicative buying rates and estimated scrap value.
- Create pickup requests.
- Track request and transaction status.

### 3.2 Local Collector Connection

Local Kabadiwalas can:
- Discover available pickup requests.
- Accept or reject eligible jobs.
- Record actual collected weight.
- Confirm collection.
- Create structured material lots.
- Maintain digital collection and earnings histories.

### 3.3 Aggregator Connection

Large Kabadiwalas and aggregators can:
- View assigned material inventory.
- Track material lots and actual weights.
- Consolidate compatible lots while preserving traceability.
- Browse recycler profiles.
- Compare published buying rates.
- Submit offers to recyclers.
- Track sale and handover status.

### 3.4 Recycler Connection

Recyclers can:
- Maintain facility profiles.
- List accepted material categories.
- Publish buying rates.
- Review incoming material offers.
- Accept or reject offers.
- Confirm physical material handover.
- Record received weight.
- Update payment status.

Recycler authorization must be verified independently before the platform represents a facility as legally authorized.

## 4. How RADDIMART Works

The platform follows a downstream material flow:

Consumer
→ Local Kabadiwala
→ Large Aggregator
→ Authorized Recycler

### Step 1 — Scrap Listing

A consumer creates a scrap listing by manually selecting a material category and subcategory, entering approximate weight and condition, and submitting pickup information.

### Step 2 — Price Discovery

RADDIMART retrieves an administrator-maintained indicative rate from the database and calculates an estimated value.

Estimated Value = Approximate Weight × Indicative Rate.

The estimate is not a guaranteed final sale price.

### Step 3 — Pickup Acceptance

Local Kabadiwalas can view available pickup requests and accept eligible jobs.

### Step 4 — Actual Collection

The collector records actual collected weight and confirms collection.

A structured material lot is created with a unique identifier.

### Step 5 — Aggregation

The material lot becomes visible in the assigned aggregator's inventory.

The aggregator can manage and consolidate compatible material lots while preserving their source history.

### Step 6 — Recycler Discovery

The aggregator views recycler profiles, accepted categories and published buying rates.

The aggregator selects a recycler and submits a material offer.

### Step 7 — Recycler Acceptance

The recycler reviews the offer and accepts or rejects it.

### Step 8 — Digital Handover

After physical receipt, the recycler confirms the handover and relevant weight information.

RADDIMART creates a structured digital handover record.

### Step 9 — QR Verification

A unique transaction reference is used to generate a QR-verifiable receipt.

The public verification page displays only non-sensitive transaction information.

Payment status is recorded separately and changes to PAID only when payment settlement has been recorded.

## 5. Indicative Pricing Example

Consider an illustrative transaction:

- Material: E-waste / Cables and Wires.
- Consumer estimated weight: 10 kg.
- Demonstration indicative rate: ₹80/kg.
- Estimated value: ₹800.
- Actual collected weight: 9.5 kg.
- Demonstration recycler rate: ₹95/kg.
- Final illustrative transaction value: ₹902.50.

These figures are examples used to explain the workflow. They are not verified current market prices.

## 6. Digital Traceability

RADDIMART creates structured material-lot and handover records.

Each relevant transaction can retain:
- Lot identifier.
- Transaction reference.
- Material category and subcategory.
- Approximate and actual weight.
- Collection timestamp.
- Handover timestamp.
- City/zone-level location details.
- Recycler information.
- Quoted rate.
- Final transaction value.
- Recycler confirmation.
- Payment status.

QR verification provides a read-only view of selected transaction metadata.

Public verification must not reveal consumer private names, phone numbers or full street addresses.

A QR receipt is a digital transaction record. It does not independently establish legal or regulatory compliance.

## 7. Expected Impact

### Economic Impact

- Better visibility into indicative scrap prices.
- Improved buyer discovery for collectors and aggregators.
- More organized material sourcing.
- Structured transaction and earning histories.
- Potential reduction in unnecessary collection trips through better pickup coordination.

### Environmental Impact

- Encourages responsible routing of recyclable materials.
- Improves visibility into e-waste movement.
- Supports the connection of categorized material streams with appropriate recycling facilities.
- Promotes more structured material handovers.

### Social Impact

- Digitally includes local Kabadiwalas and informal collectors.
- Gives independent collectors a structured platform to participate in the recycling chain.
- Improves transaction visibility for stakeholders.
- Supports more transparent interactions between different participants.

These are expected benefits and design objectives, not measured or guaranteed results.

## 8. Innovation and Differentiation

RADDIMART focuses on the complete recycling value chain rather than only providing a consumer-facing scrap pickup service.

Its distinguishing elements are:

1. Four-stakeholder marketplace connectivity.
2. Indicative price discovery through stored category rates.
3. Structured material lots.
4. Aggregator inventory management.
5. Recycler rate comparison and offer submission.
6. Digital handover records.
7. QR-verifiable transaction references.
8. Separate payment status tracking.
9. A web-first experience designed for mobile accessibility.

## 9. MVP Boundaries

The initial version includes:
- Responsive website.
- Four stakeholder dashboards.
- Manual material categorization.
- Database-driven indicative rates.
- Scrap listing and pickup requests.
- Material lot management.
- Aggregator inventory.
- Recycler marketplace.
- Digital handover.
- QR verification.
- Transaction history.
- Basic earnings ledger.

The initial version does not include:
- AI image classification.
- AI-based price prediction.
- Blockchain.
- Native mobile application.
- Voice navigation.
- Offline-first synchronization.
- GPS-based collection verification.
- Automated recycler matching.
- Payment gateway integration.
- Guaranteed regulatory certification.

## 10. Long-Term Vision

RADDIMART can evolve toward a more comprehensive digital recycling ecosystem.

Possible future enhancements include:
- Full multilingual support.
- Voice-based navigation.
- Offline-first synchronization.
- AI-assisted material classification.
- Historical price analytics.
- Automated recycler matching.
- GPS-based collection verification.
- Verified recycler registry integrations.
- Financial inclusion and formal earning-history partnerships.

These are future roadmap possibilities, not current MVP capabilities.

## 11. One-Paragraph Summary

RADDIMART is a responsive digital recycling marketplace that connects consumers, local Kabadiwalas, large scrap aggregators and formal recycling facilities in one structured workflow. It addresses fragmented scrap collection networks, limited price visibility, disconnected material sourcing and undocumented handovers through manual scrap categorization, indicative price discovery, pickup coordination, material-lot management, recycler rate comparison and QR-verifiable digital handover records. By bringing every stakeholder onto one platform, RADDIMART aims to support a more transparent, organized and traceable recycling chain while digitally including informal scrap collectors.

## 12. Short Homepage Popup Version

### THE PROBLEM

The scrap collection and recycling ecosystem is fragmented. Consumers often lack transparent price information and convenient pickup coordination, while local collectors, aggregators and formal recyclers operate through disconnected networks. Material handovers can lack standardized records, making transactions difficult to track and limiting visibility into the recycling journey.

### OUR SOLUTION

RADDIMART is a digital marketplace connecting consumers, local Kabadiwalas, large aggregators and authorized recyclers. It enables structured scrap listings, indicative price discovery, pickup coordination, material-lot management, recycler offers and QR-verifiable digital handover records through one responsive website.

### EXPECTED IMPACT

A more connected and transparent recycling chain, improved visibility into material movement, better buyer discovery and stronger digital participation for informal scrap collectors.
