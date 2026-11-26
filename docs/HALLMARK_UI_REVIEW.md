# RADDIMART — Hallmark UI/UX Review (Phases 1–4) and Readiness Assessment

**Date:** 25 November 2026
**Reviewer:** Hallmark v2.0.0, used as the active design reviewer
**Scope:** every implemented route, screen and shared pattern from Phase 1 through Phase 4
**Method:** the running application was inspected, not reports; screenshots were captured at
1440 × 900 and 390 × 844 from real local Supabase data; the changed source was checked with
Hallmark `sloplint` in app scope.

No design system, route, logo or completed feature was replaced. Corrections are additive and
use the existing Coral token set, with `#107357` preserved.

---

## 1. What was reviewed

| Area | Screens |
|------|---------|
| Public website | landing page, navigation, hero, Problem & Solution dialog, problem, solution, stakeholder, how-it-works, benefits, CTA and footer |
| Authentication | sign in, sign up, password reset, role request |
| Consumer | dashboard, create listing, listing details, edit/cancel, pickup request |
| Collector | dashboard, marketplace with filters, listing details, pickup management, actual weight, collection |
| Shared | headers, navigation, summary cards, listing cards, status badges, forms, loading/empty/error/success states, responsive behaviour, focus and touch targets |
| Roles | consumer, collector, aggregator and recycler dashboards |

Screenshots were produced by `scripts/review-capture.mjs` and `scripts/review-phase5.mjs` and
saved under `.hallmark/review/` (local only).

---

## 2. Findings and severity

### Critical — resolved

1. **The public website had no styles at all.** Every Phase 1 class (`.hero`,
   `.section-heading`, `.stakeholder-grid`, `.material-flow`, `.benefits-grid`, `.cta-*`,
   `.footer-*`) had no definition in an imported stylesheet. The homepage rendered as raw
   stacked text. *Fix:* added a token-only public layer to `src/styles/base.css`; added the
   supplied truck illustration to the hero as the design brief required; sized the footer mark.
2. **The Problem & Solution popup was not a dialog.** It rendered inline above the hero with no
   backdrop, no focus management and an uppercase content block. *Fix:* rebuilt as a native
   modal `<dialog>` (`showModal`, labelled title, top-right 44 px close button, Escape and
   backdrop dismissal, focus return, scroll lock); sentence-case section headings; copy
   preserved; no claim of recycler authorization.
3. **Two broken public links.** “Get Started” pointed at the non-existent `/getstarted`, and
   “Explore the Platform” at `/solution`, so both silently redirected home. *Fix:* `/signup`
   and `#how-works`.

### Major — resolved

4. **No shared navigation for signed-in screens.** Dashboards and marketplace pages were dead
   ends; the collector had no route to their profile, and the top bars did not align with the
   content column. *Fix:* one `DashboardNav` component (role-aware links, profile, sign out,
   active state) used by all eight signed-in screens; header and main now share the 72 rem
   column.
5. **The consumer dashboard showed a full-width “Role: consumer” pill** styled unlike any other
   element. *Fix:* role is now a compact label beside the brand in the shared top bar.
6. **Metadata was glued together with middle dots** (“E-waste · Cables and wires”, “Zone: … ·
   Preferred pickup: …”), which Hallmark’s floor forbids. *Fix:* each fact is its own line with
   its own label across consumer, collector, marketplace and pickup cards.
7. **Dates were US-locale with raw seconds** (`11/26/2026, 11:34:45 PM`). *Fix:*
   `Intl.DateTimeFormat('en-IN')` short date, 12-hour time, no seconds.
8. **Creating a listing had no form frame** and fields ran the full content width. *Fix:*
   two-column tokenised form card, one column under 60 rem.
9. **Off-platform status colour.** “Accepted” used a hard-coded blue outside the palette.
   *Fix:* token-only status treatments with text labels, so colour is never the only signal.
10. **Listing photos were publicly readable** by permanent URL. *Fix:* bucket is private;
    signed URLs are generated for signed-in users (see Phase 5 migration).

### Minor — resolved

11. Filter grid left a dangling empty column; now a balanced 3/2/1-column grid.
12. The indicative-price note ran inline after the amount; it is now a separate line.
13. The “no active rate” message appeared before a category was chosen; copy now reflects the
    actual state.
14. Focused controls lacked pressed feedback; `:active` states were added for buttons, nav links
    and the dialog close button.
15. Token violations found by `sloplint` (literal `#ffffff`, `#fdf3f2`, `#f1f1f1`, `#0f172a`)
    were replaced with `--color-on-brand`, `--color-error-pale` and `--color-scrim`; the required
    Hallmark stamp and critique line were added to `base.css`.

### Deliberately not changed

- The truck logo asset is untouched; only its displayed size and hero treatment changed.
- The Coral palette, Instrument Sans / Schibsted Grotesk / DM Mono type roles and the
  1440 px container remain.
- The landing copy structure, popup copy, routes and business rules are preserved.
- Side-stripe error/notice accents are retained: they are paired with text and are part of the
  existing error language. Tracked as a Hallmark `WARN`, not a blocker.

---

## 3. Hallmark self-review and refinement

The first correction pass was re-captured, then refined:

- the native dialog initially still laid out inside a wrapper; the wrapper was removed and the
  dialog fixed/centred with its own backdrop;
- the hero truck showed a white PNG rectangle; `mix-blend-mode: multiply` blends it into the
  pale band without editing the asset;
- the shared top bar produced a lone “Sign out” row on phones; under 40 rem it is now a
  single-line, horizontally scrollable strip with 44 px targets;
- forms inside dashboard sections created a card inside a card; nested form surfaces were made
  transparent;
- the facility fieldset stretched the contact-email cell; the fieldset now spans both columns;
- a standalone action in a section rendered as a full-width bar; section-level buttons now align
  left.

Final `sloplint` result for the reviewed files: **0 FAIL, 12 WARN** (all reviewed and accepted:
side-stripe notices, existing footer line, long access labels, and one false positive where a
success message *is* preceded by a real Supabase insert).

---

## 4. Readiness assessment

**Before corrections: NOT READY.** Three blockers (unstyled public site, non-modal popup,
broken primary links) meant the product could not be presented as complete, regardless of the
database work.

**After corrections: READY TO CONTINUE**, with limitations:

| Class | Finding |
|-------|---------|
| Blocker | none open |
| Major | none open |
| Minor | Side-stripe notices; English-only copy; manual zone matching |
| Future | Realtime refresh; full-text search; geolocation/radius; photo moderation |

Database integrity, RLS, authentication, build and lint were already verified in Phases 3–4 and
were re-verified after these changes. Phase 5 could proceed without reworking Phases 1–4.
