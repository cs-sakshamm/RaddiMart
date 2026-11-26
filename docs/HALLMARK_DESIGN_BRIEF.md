# RADDIMART — Hallmark Design Brief

Status: Phase 0 design coordination brief for Hallmark. This is a brief, not a set of approved screens. Hallmark was invoked in Phase 0; the theme direction below is a seed for review, and no screen is approved for implementation until the project owner accepts the Hallmark output.

## 1. Official project identity

- Official project name and website name: **RADDIMART**.
- Tagline: **Connecting Every Scrap Collector to a Greener Tomorrow.**
- Application type: responsive, web-first, database-backed recycling marketplace.
- Four stakeholders: consumers, local Kabadiwalas / collectors, large Kabadiwalas / aggregators and recyclers.
- Primary theme colour: **#107357**. This is mandatory and may not be replaced.
- Previous working name "Kabadiwala Connect" is superseded. Do not introduce it as a second brand.

Tone inferred from the brief, since "clean and modern" alone is not a Hallmark tone: **soft-utilitarian, calm and exact**. The product should feel like a dependable tool used by people who know their work, with warmth for first-time consumers. The vibe in four to eight words: *plain-spoken, green, traceable, hands-on, unhurried*.

## 2. Material inventory

- **Real:** the RADDIMART name, tagline, supplied truck illustration, supplied SIH problem-statement modal screenshot, four stakeholder roles, manual material categories, administrator-maintained indicative rates, illustrative figures (₹80/kg, ₹95/kg, ₹800, ₹902.50), transaction statuses and the problem/solution/impact copy in `Problem_Solution_Content.md`.
- **Pictures:** the supplied truck illustration is the hero brand asset. No product screenshots exist yet. The supplied SIH screenshot is a modal reference only. No stock photography is required for dashboards.
- **Absent:** verified market prices, survey statistics, testimonials, logos of partner organizations, proof of legal recycler authorization and measured impact results. Do not invent them.

## 3. Logo usage

- Source of truth: `Brand-Assets/file_00000000af5482108d9d5e43e8b5ef1a.png` (official RADDIMART truck illustration, 1774 x 887 px). A byte-identical working copy is at `public/assets/raddimart-logo/raddimart-truck-logo.png`.
- Use the actual supplied illustration. Do not redraw it, replace it with a generic recycling icon, distort it, recrop the lettering or place it on a low-contrast background.
- Preserve aspect ratio and provide clear space around the mark.
- The logo may be paired with the wordmark RADDIMART as a separate text element, but the illustration itself must remain unchanged.
- Prefer an SVG export from the project owner if one exists; until then, use the supplied PNG at its native ratio.

## 4. Colour system

Starting tokens, already established in `src/styles/tokens.css`:

| Role | Value | Use |
| --- | --- | --- |
| Primary | `#107357` | Primary actions, active navigation, key status accents. Mandatory. |
| Dark green | `#0B5944` | Hover/pressed states, focus ring, dark headings on pale surfaces. |
| Pale green | `#E8F4EF` | Selected rows, quiet panels, success-adjacent surfaces. |
| Light background | `#F7F9F8` | Page background. |
| White | `#FFFFFF` | Primary surface and modal panel. |
| Main text | `#1F2937` | Body and headings. |
| Secondary text | `#66736D` | Helper copy, metadata, muted labels. |

Supporting tokens include a rule colour, error colour and success colour. Hallmark may refine neutrals, contrast pairs and radii **only while preserving `#107357` as the primary colour**. Colour must never be the sole carrier of meaning; pair status colour with text or shape.

## 5. Typography direction

Hallmark direction seed: the dealt **Dose** theme (modern-minimal, light paper, grotesk sans, chromatic-green accent, dealt 2/3 on 2026-11-24). Its type voices are candidates, not an approved brand system:

- Display: Schibsted Grotesk, sentence case, tight but readable tracking.
- Body: Instrument Sans at 16px or larger.
- Numeric labels, weights, times and transaction references: DM Mono with tabular figures, used sparingly.
- Maximum two type families plus one numeric outlier. Do not use tracked capitals, small caps or eyebrows for labels.
- Headings carry one weight and one colour. Do not italicize a single word inside a roman heading.

Font licensing and local font files require owner confirmation. Until then, the tokens declare the families and fallbacks; no remote font request is hard-coded in the foundation.

## 6. Visual style

- Clean, modern, approachable marketplace; not clinical, not playful to the point of novelty.
- One container width, one column gap below the hero, one radius per nesting level, one primary button style.
- Restrained motion: state changes only; no decorative orchestration. Always provide `prefers-reduced-motion` and keep content visible without scripting.
- Avoid purple-to-blue gradients, cards inside cards, emoji as icons, invented figures and decorative status dots.
- Show the real thing: materials, weights, lot references and status changes. Do not fill screens with generic illustrations.
- The four dashboards must share one shell, one table language and one status language. They must not look like four unrelated products.

## 7. Hallmark run record

**Hallmark · v2.0.0**

- **Shape** · Feature Stack (landing page draw `42c9e4`); Poster hero posture; edge-aligned navigation; index-column footer. Applicable to the future public landing page only.
- **Theme** · Dose, dealt 2/3, seed `raddimart-responsive-four-stakeholder-recycling-33d6·617b1d49·2026-11-24·r0`; green accent converted to the owner-supplied `#107357`; pharmacy-specific imagery and metaphors deliberately not carried over.
- **Chrome** · landing page: edge-aligned wordmark plus one action. Dashboards: one shared top bar; a sidebar only if more than about seven destinations are needed, collapsing under 60rem.
- **Hero** · Poster: supplied truck illustration, headline, one sentence and one primary action visible at 1280 x 800.
- **Sections** · Future landing page: hero, what RADDIMART connects, how the material flow works, role entry points, proof-free impact statement, footer. Steps and Grid were the two compositions left out of this draw.
- **Signature** · the four-stakeholder material flow shown as one traceable chain, with the truck illustration as the brand anchor.
- **Material** · real: supplied logo, supplied popup screenshot, role model, rates and lifecycle copy · pictures: supplied truck illustration and modal screenshot; no product captures yet · absent: partner logos, testimonials, survey statistics, verified prices.
- **Sweep** · Phase 0 foundation swept with Hallmark sloplint app scope: 0 FAIL, 0 WARN, 1 waived Reflex, render tier run at five viewports. No approved screen has been built yet.

Material ask: if an SVG logo, licensed font files, real collector/recycler photographs or verified rate tables are available, supply them before screen design. The single most useful addition would be a real screenshot or screen recording of the working product once dashboards exist.

## 8. Accessibility requirements

- WCAG-aligned contrast for text, controls and focus indicators; never colour alone for state.
- Visible `:focus-visible` ring on every interactive element, appearing immediately.
- Minimum 44 x 44 CSS px touch targets; labels above fields, never placeholder-as-label.
- Native semantics: `<button>`, `<a>`, `<dialog>`, form labels and table structures.
- Every control supplies default, hover, focus, active, disabled, loading, error and success states.
- Errors say what broke and how to fix it, linked with `aria-describedby` and `aria-invalid`.
- `overflow-x: clip` on both `html` and `body`; no `100vw` layouts.
- All animation has a reduced-motion fallback and content remains visible without scripting.
- Simple language and short forms for users with limited digital literacy; reserve space for 30–40% longer strings for future Hindi support.

## 9. Responsive design requirements

- Design and verify from 320 to 1920 CSS pixels.
- Two shared layout breakpoints: under 60rem (about 960px) and under 40rem (about 640px).
- Under 60rem: multi-column grids become one column; sidebars collapse into a menu; sticky panes unstack; tables keep the row-identifying column and action column visible by restacking or pinning.
- Under 40rem: display sizes step down, gutters tighten and annotations consolidate.
- Use `dvh`/`svh` for viewport-height panels such as the popup; never `vh` on a hero.
- Buttons and primary nav links stay single-line; shorten labels rather than wrapping them.
- Test mobile navigation with coarse pointers and keyboard access, not hover alone.

## 10. Public landing page requirements

- Introduces RADDIMART, the tagline and the four-stakeholder chain.
- Leads with the supplied truck illustration at full fidelity; no generic recycling icon.
- Primary action: enter the marketplace / sign up. Secondary action: learn how it works.
- Explains the problem and solution briefly without invented impact statistics.
- Provides role entry points for all four stakeholders.
- Footer carries product links and any required photo credits; no fake testimonials or partner logos.
- Hero headline, one sentence and primary action visible at 1280 x 800.
- Must not be implemented in Phase 0; this brief is the handoff.

## 11. Mandatory Problem & Solution popup

Behaviour:

- Opens automatically on a fresh homepage visit or session.
- Does not reopen on internal route navigation.
- A new homepage visit/session may show it again; no permanent dismissal flag.
- Centered white information panel, dark translucent backdrop, prominent upper-right close button with accessible label.
- Scrollable content area; background page scroll locked while open.
- Accessible dialog semantics, focus management, focus return, Escape dismissal and backdrop/close dismissal.
- Responsive full-width or near-full-width panel on mobile.
- Contains only the problem, the solution and the expected impact. It is not a product manual.
- Inspired by the supplied SIH problem-statement modal screenshot; not an exact reproduction.
- Final visual design must be Hallmark-approved before implementation. Phase 0 does not implement it.

Exact short copy to use, from `Problem_Solution_Content.md`:

### THE PROBLEM

The scrap collection and recycling ecosystem is fragmented. Consumers often lack transparent price information and convenient pickup coordination, while local collectors, aggregators and formal recyclers operate through disconnected networks. Material handovers can lack standardized records, making transactions difficult to track and limiting visibility into the recycling journey.

### OUR SOLUTION

RADDIMART is a digital marketplace connecting consumers, local Kabadiwalas, large aggregators and authorized recyclers. It enables structured scrap listings, indicative price discovery, pickup coordination, material-lot management, recycler offers and QR-verifiable digital handover records through one responsive website.

### EXPECTED IMPACT

A more connected and transparent recycling chain, improved visibility into material movement, better buyer discovery and stronger digital participation for informal scrap collectors.

## 12. Four dashboard requirements

All four dashboards share one shell, navigation pattern, table language, status badges and form language.

### Consumer dashboard

- My scrap listings, pickup request status, indicative estimate, transaction history and receipts.
- Primary action: create a scrap listing.
- Signature object: the pickup request timeline.

### Local Kabadiwala / Collector dashboard

- Available requests with city/zone and material filters, accepted jobs, actual weight entry, lot creation and earnings.
- Primary action: accept an eligible pickup request.
- Signature object: the available-request queue.

### Large Kabadiwala / Aggregator dashboard

- Assigned inventory, lots, consolidation, recycler profiles, buying-rate comparison and offers.
- Primary action: create an offer to a recycler.
- Signature object: the inventory and offer table.

### Recycler dashboard

- Facility profile, accepted categories, buying-rate management, incoming offers, handover confirmation, received weight and payment status.
- Recycler verification status must be visible as a fact, not implied by the role label.
- Primary action: respond to an incoming offer.
- Signature object: the incoming offers table.

Dashboards use tables before cards, controls 32–40px high with 44px hit targets, and fixed type scale. Filters, tabs and pagination belong in the URL. Data regions require loading, empty, error and full states.

## 13. Common component requirements

- Brand mark with supplied logo.
- Primary, secondary, ghost and destructive buttons with all eight states.
- Text input, select, textarea, native checkbox/radio, file upload label and date/time input.
- Status badge for material lifecycle and separate payment status.
- Filter row, data table, timeline, empty-state panel and skeleton shapes.
- Toast only where a transient confirmation is genuinely needed; never as a success state for a completed server action.
- Modal/dialog pattern based on native `<dialog>` where possible.
- All components consume tokens; no literal colour or font family outside the token block.

## 14. Mobile navigation requirements

- One top bar shared across roles, collapsing to a menu under 60rem.
- Current role and current section clearly indicated in text, not colour alone.
- Primary action remains reachable without scrolling the navigation away.
- Touch targets at least 44px; no hover-only controls.
- Dashboard tables restack on phones with row labels and actions retained.
- Focus order follows visual order; the menu trap and Escape behaviour are explicit.

## 15. QR receipt design

- Receipt is a digital transaction record, not a compliance certificate.
- Shows lot reference, transaction reference, category/subcategory, verified weight, city/zone, handover timestamp, recycler confirmation and payment status.
- QR encoding must be generated from the supplied public verification URL; no sensitive data in the QR payload.
- Public verification page is read-only and uses the same restrained visual language as dashboards.
- Must never show consumer private names, phone numbers, full street addresses or account data.
- Include the clarification that legal or regulatory compliance is not established by the receipt alone.

## 16. Empty, loading, success and error states

Every data region needs all four states:

- **Loading:** skeleton in the shape of the incoming table, list or timeline.
- **Empty:** one line naming what is empty, one line explaining why it matters and one action that fills it. Never a bare "No results".
- **Error:** what broke, what to do next and a retry action where appropriate; never colour alone.
- **Success:** the persisted result itself, sourced from the server. Do not invent a success state where no request was made.

Forms show validation on blur after first touch and then on input. Submit is disabled only while a request is in flight.

## 17. Design deliverables and export requirements

Requested Hallmark outputs:

1. Landing page desktop, tablet and mobile references.
2. Problem & Solution popup desktop and mobile references, including backdrop, scroll and focus treatment.
3. Login and registration references.
4. Four dashboard references sharing one shell, each at desktop, tablet and mobile sizes.
5. Scrap listing form, collector pickup request, aggregator inventory, recycler marketplace/offer, transaction tracking, QR receipt and public QR verification references.
6. Profile and account settings references.
7. Component specification: buttons, inputs, selects, status badges, tables, timelines, modals, navigation and empty/loading/error/success states.
8. Token export: colours, type scale, spacing, radii, motion durations and focus treatment, preserving `#107357`.
9. Responsive rules and breakpoint behaviour in a form OpenCode can translate to Tailwind tokens/classes.
10. A short written approval note naming any change from this brief and the reason.

Exports should be saved under a new `Design-References/Hallmark-Exports/` directory with clear filenames such as `landing-desktop.png`, `popup-mobile.png`, `collector-dashboard-desktop.png` and `tokens.md`. Hallmark may choose an equivalent structure; OpenCode will not invent approval where no export exists.

## 18. Ownership boundary

Hallmark owns visual direction, layouts, typography, colour system, spacing, hierarchy, responsive references, component appearance and dashboard patterns. OpenCode owns React/Tailwind implementation, routing, Supabase integration, database logic, testing, debugging and deployment. Do not change Hallmark-approved layouts or brand decisions without documenting the reason and obtaining owner approval.
