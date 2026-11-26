# RADDIMART — Project Decisions and Technical Direction

## 1. Project Identity

Official project name: RADDIMART

Website name: RADDIMART

Primary tagline: Connecting Every Scrap Collector to a Greener Tomorrow.

Project type: Responsive, web-first, multi-stakeholder recycling marketplace.

Primary theme colour: #107357.

Design platform: Hallmark.

Engineering and coding agent: OpenCode.

Version control: GitHub.

Backend provider: Supabase.

Initial hosting target: Cloudflare Pages free plan, subject to current plan limitations and project requirements.

The previous working documentation name was Kabadiwala Connect. The official project identity is now RADDIMART.

All new product interfaces, code, metadata and documentation must use RADDIMART.

## 2. Product Vision

RADDIMART aims to digitally connect consumers, local scrap collectors, large Kabadiwala aggregators and formal recycling facilities in a single marketplace.

The platform is designed to improve price visibility, pickup coordination, material-lot tracking, recycler discovery and digital handover documentation.

The product is web-first and must be accessible from smartphones, tablets and desktops.

## 3. Stakeholder Roles

### 3.1 Consumer

Can:
- Register and log in.
- Select scrap category and subcategory.
- Enter approximate weight.
- Specify material condition.
- Enter pickup location and preferred pickup time.
- Optionally upload a reference photograph.
- View indicative price estimates.
- Create and track pickup requests.
- View transaction history and receipts.

### 3.2 Local Kabadiwala / Collector

Can:
- View available pickup requests.
- Filter requests.
- Accept or reject eligible requests.
- Record actual collected weight.
- Confirm collection.
- Create material lots.
- View collection history.
- View earnings and transaction records.

### 3.3 Large Kabadiwala / Aggregator

Can:
- View assigned material inventory.
- View material lots and weights.
- Consolidate compatible lots while preserving traceability.
- Browse recycler profiles.
- Compare recycler buying rates.
- Submit offers to recyclers.
- Track offer acceptance and rejection.
- Manage handovers and sales history.
- View earnings records.

### 3.4 Authorized Recycler

Can:
- Maintain facility profile.
- Publish accepted material categories.
- Maintain offered buying rates.
- View incoming material offers.
- Accept or reject offers.
- Confirm physical handover.
- Record final received weight.
- Update payment status.
- View purchase history.

The platform must not claim that a recycler is legally authorized unless that status has actually been verified. Use the documentation's role terminology while keeping verification status explicit.

## 4. Product Scope — MVP

The MVP includes:

1. Role-based authentication.
2. Four stakeholder dashboards.
3. Consumer scrap listing.
4. Manual category and subcategory selection.
5. Indicative price discovery.
6. Pickup request creation.
7. Collector request acceptance.
8. Actual weight recording.
9. Material lot creation.
10. Aggregator inventory management.
11. Lot consolidation.
12. Recycler profile and buying-rate management.
13. Recycler offer submission and acceptance.
14. Digital handover records.
15. Unique transaction references.
16. QR-based public verification.
17. Transaction history.
18. Basic earnings ledger.
19. Separate payment status.
20. Responsive web interface.

## 5. Material Categories

Manual dropdown categorization is mandatory in the MVP.

### E-waste
- PCBs.
- Cables and wires.
- LCD panels.
- CRT monitors.
- Batteries.
- Motors and magnet-bearing assemblies.
- Mixed electronic components.

### Metal scrap
- Copper.
- Aluminium.
- Iron.
- Steel.
- Brass.

### Plastic
- Hard plastic.
- Mixed plastic.
- PET bottles.

### Paper
- Newspapers.
- Cardboard.
- Office paper.

### Other
- Glass.
- Rubber.
- Miscellaneous scrap.

AI-based image classification is not part of the MVP.

Photographs are optional supporting references only.

## 6. Pricing Decisions

The initial MVP uses administrator-maintained indicative rates stored in PostgreSQL.

Estimated value:

Estimated Value = Approximate Weight × Indicative Rate per Unit Weight.

Actual collected weight is recorded by the collector.

Final transaction value is determined using the agreed recycler offer and actual transaction weight.

Illustrative demonstration values:
- 10 kg cables at ₹80/kg = ₹800 estimated value.
- 9.5 kg actual collected weight.
- Recycler rate of ₹95/kg.
- Final illustrative transaction value = ₹902.50.

These values are examples, not verified market quotations.

Live market price prediction is not part of the MVP.

## 7. Transaction Lifecycle

Implement the following material transaction statuses:

LISTED
PICKUP_REQUESTED
ACCEPTED
COLLECTED
IN_AGGREGATOR_INVENTORY
OFFERED_TO_RECYCLER
ACCEPTED_BY_RECYCLER
HANDOVER_CONFIRMED
COMPLETED

Payment status must remain independent:

PENDING
PAID

A completed physical handover must never automatically imply payment settlement.

## 8. QR and Digital Handover Decisions

Each confirmed handover must have:
- Unique lot ID.
- Unique transaction reference.
- Material category and subcategory.
- Verified weight.
- Relevant timestamps.
- Handover status.
- Recycler confirmation.
- Payment status.

QR verification must be read-only.

Public QR pages must not expose:
- Consumer private names.
- Phone numbers.
- Full street addresses.
- Authentication data.
- Private account information.

A QR receipt is a digital transaction record. It does not independently establish legal or regulatory compliance.

## 9. Technology Decisions

Frontend:
- React.
- Vite.
- JavaScript.
- Tailwind CSS.

UI:
- Hallmark-approved designs.
- Reusable React components.
- Responsive layouts.
- Accessible interface patterns.

Backend:
- Supabase.
- PostgreSQL.
- Supabase Auth.
- Supabase Storage.
- PostgreSQL Row-Level Security.

QR:
- Suitable QR code generation library.

Version control:
- GitHub.

Hosting:
- Cloudflare Pages, subject to current free-plan suitability.

Do not add an independent Express backend unless a concrete requirement justifies it.

## 10. Security Decisions

- Apply RLS to every private database table.
- Never rely solely on frontend role checks.
- Never expose Supabase service-role or secret keys in frontend code.
- Validate all critical operations server-side or through protected database functions.
- Prevent unauthorized access to other users' records.
- Prevent duplicate pickup acceptance.
- Validate transaction status transitions.
- Preserve transaction and handover history.
- Restrict public QR access to non-sensitive fields.
- Keep secrets out of Git.

## 11. Design Decisions

- Primary colour: #107357.
- White and light neutral backgrounds.
- Clean, modern marketplace aesthetic.
- Clear typography and hierarchy.
- Consistent spacing.
- Responsive mobile-first layouts.
- Accessible contrast.
- Large touch targets.
- Simple forms for users with limited digital literacy.
- Restrained animations.
- Original RADDIMART truck logo must be used without distortion.

Hallmark owns the design direction. OpenCode implements approved designs.

## 12. Homepage Popup Decision

The homepage must display an automatic Problem & Solution overview popup.

The popup must explain:
- The existing scrap-chain problem.
- The RADDIMART solution.
- The expected impact.

It must be inspired by the supplied SIH problem-statement modal screenshot.

It must have a dimmed backdrop, scrollable content, close button, keyboard accessibility and responsive layout.

It must open on a fresh homepage visit, not on every internal route change.

## 13. Out of Scope for MVP

Do not implement these as mandatory MVP features:

- AI image classification.
- AI price prediction.
- Blockchain.
- Native Android application.
- Voice navigation.
- Offline-first synchronization.
- GPS-based pickup verification.
- Automated recycler matching.
- Live market rate integrations.
- Payment gateway.
- Guaranteed regulatory certification.

These may be considered as future roadmap enhancements.

## 14. Development Ownership

Hallmark:
- UI/UX design.
- Brand system.
- Page layouts.
- Dashboard designs.
- Responsive design references.
- Component visual specifications.

OpenCode:
- Repository architecture.
- Frontend implementation.
- Backend implementation.
- Database schema.
- Authentication and authorization.
- Integrations.
- Testing.
- Debugging.
- Deployment preparation.
- Technical documentation.

Project owner:
- Accounts and credentials.
- Business decisions.
- Approval of designs.
- Approval of scope changes.
- Real-world validation.
- Deployment authorization.
- Final acceptance.

## 15. Engineering Principles

- Build incrementally.
- Keep code modular.
- Avoid unnecessary dependencies.
- Do not fabricate data.
- Do not create fake functionality.
- Do not claim untested features work.
- Use real database operations.
- Keep security enforced at the backend.
- Test all critical workflows.
- Preserve traceability.
- Document important architectural decisions.
- Follow Hallmark-approved visual references.

## 16. Definition of MVP Completion

The MVP is complete only when all four roles can execute their intended workflows, records persist in Supabase, permissions are enforced, the QR verification flow works, the payment status remains independent, the application is responsive, critical tests pass and the hosted application works.
