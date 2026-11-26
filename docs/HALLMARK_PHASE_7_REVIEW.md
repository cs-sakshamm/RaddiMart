# RADDIMART — Hallmark Phase 7 UI/UX Review

**Reviewer:** Hallmark v2.0.0 (Coral theme, Split Studio shape)
**Date:** 26 November 2026
**Method:** the production build was rendered and inspected, not inferred from source. Captures were taken at 1440 × 900, 768 × 1024 and 390 × 844; the page was additionally checked at 360, 1024, 1366 and 1920 px for horizontal overflow. Public and auth screens used the real app. Signed-in screens used the real components with deterministic stubbed PostgREST responses because Docker/local Supabase is unavailable.
**Evidence:** `.hallmark/review/phase7/` (`home-*`, `signin-*`, `signup-*`, `verify-expired-*`, `consumer-*`, `collector-*`, `aggregator-*`, `recycler-*`, `profile-*`).

No route, workflow, logo, palette or type family was replaced. Corrections are additive/token-based.

---

## 1. Review pass 1 — public website

### What was wrong

| Severity | Finding |
|----------|---------|
| Major | The hero used the truck logo at very large size a second time immediately below the nav, so the first screen was brand repetition rather than product evidence. |
| Major | The Problem section used two text columns of very different lengths and ended with a large empty half. |
| Major | How It Works was a 4-column grid with seven items, leaving an empty cell on desktop. |
| Major | Every section was a rounded card grid, which made the page read as template-generated. |
| Minor | Material cards were four identical tiles with no hierarchy. |
| Minor | The landing nav had no visible sign-in/get-started action and no mobile menu; links became an unreadable scroll strip on phones. |
| Minor | Anchored sections landed under the sticky nav. |
| Minor | Headline and section headings were Title Case while the rest of the product used sentence case. |
| Minor | The footer repeated four simple links and did not use the space for role/account navigation. |

### Corrections

- Hero is now copy + a real collection photograph with a “chain” caption. The approved logo remains in the nav, footer, auth shell and dashboards.
- Challenge is an editorial split: lead + facility photograph on the left, two concise paragraphs + “what is missing between the links” on the right.
- Solution adds three concrete facts already present in the product (one record per listing, three separate weights, checkable handover).
- Materials use one wide feature card and three supporting cards.
- Stakeholders are numbered rows, not four identical cards.
- How It Works is a sticky intro beside a seven-step rail.
- Benefits use rules and columns, not cards.
- Footer has Platform / Roles / Account columns.
- Nav has Sign in + Get started on desktop; on tablet/phone a Menu button controls a labelled panel, closes on Escape and includes Get started.
- `scroll-margin-top` added for anchors.
- Sentence-case headings throughout the public layer.

### Verdict after pass 1

The first screen now reads as a scrap-material marketplace rather than a generic SaaS hero. The page alternates photographic, editorial and list compositions instead of repeating cards.

---

## 2. Review pass 2 — signed-out screens

### What was wrong

| Severity | Finding |
|----------|---------|
| Major | Auth forms were a small floating card in an otherwise empty page; no brand context and no way back. |
| Major | Signup told the user the account was created and then attempted an immediate sign-in, producing the reported verification failure. |
| Major | No screen existed to explain or recover from a verification email or an expired link. |
| Minor | Disabled primary buttons were white text on a pale green fill (low contrast). |
| Minor | Sign-in and sign-up had no password guidance; the terms link pointed at `#`. |
| Minor | Reset page could show two different “invalid link” messages. |

### Corrections

- Shared `AuthLayout`: dark green brand panel with the approved logo and a collection photograph on desktop; compact logo + full-width form on mobile.
- Signup has a real “Check your email” state, resend control and sign-in link. No post-signup password attempt remains.
- Sign-in has a dedicated unverified state with resend, and a neutral wrong-credentials message.
- New `/verify-email` success, checking and expired states.
- Disabled primary buttons use dark ink on a muted brand fill.
- Reset page has a single clear expired-link state with a route to request a new link.
- Terms is plain acceptance copy; the dead link is gone.
- Form fields have labels, hints and password rules; focus states are visible and 44 px touch targets are retained.

### Verdict after pass 2

The signed-out journey is now explainable end to end in the UI: create → check email → verify → sign in, including resend and expired-link recovery.

---

## 3. Review pass 3 — signed-in surfaces

### What was wrong

| Severity | Finding |
|----------|---------|
| Major | Dashboard pages were text-only lists; listing cards had no visual material cue. |
| Major | Mobile dashboard nav clipped the last link (Sign out) with no indication that it scrolled. |
| Major | After the first mobile card fix, thumbnail + info + action competed in one flex row and squeezed the text into a narrow column. |
| Minor | Summary cards were flat boxes with no hierarchy. |
| Minor | Empty states were a single grey sentence with no next action. |
| Minor | Profile had no navigation, no loading state, and editing could be undone by its own effect. |
| Minor | Role request used an inline `orange` status and raw role identifiers. |
| Minor | Page titles mixed Title Case with the now sentence-case public/auth screens. |
| Minor | Listing status pills and actions stacked with unused space at desktop widths. |

### Corrections

- Summary cards gain a brand left rule, larger tabular figures and quieter labels.
- Listing, lot and offer cards use project-owned material photography as a thumbnail (uploaded photo takes precedence on the marketplace).
- Mobile cards use an explicit 64 px thumbnail column and a text column; actions sit beneath the text.
- Dashboard nav wraps on phones and right-aligns Sign out.
- Empty states explain what will appear and, for consumers, offer “Create your first listing”.
- Profile and role request moved into the shared dashboard shell with working nav, status pills and back/cancel paths.
- Page titles normalised to sentence case.
- Buttons inside sections align left; error-state buttons no longer stretch full width.

### Verdict after pass 3

The four roles now share one coherent shell while keeping different content shapes (inventory tables/lists, offer lists, facility form, pickup groups). The pages look related without being identical.

---

## 4. Responsive and accessibility checks

- No horizontal overflow was detected at 360, 390, 768, 1024, 1366, 1440 or 1920 px on the public page; the signed-in capture script also reports overflow per route and found none.
- Mobile nav is a labelled toggle (`aria-expanded`, `aria-controls`) and closes on Escape.
- The existing 44 px minimum target rule is retained for nav, buttons, filters and form controls.
- The dialog keeps native modal focus behaviour, Escape and backdrop dismissal.
- Focus-visible outlines are unchanged and use the focus token.
- Disabled buttons are no longer low contrast.
- Status is never communicated by colour alone; every pill has a text label.
- Images have descriptive alt text (decorative uploaded listing photos use an empty alt in the marketplace where the adjacent text describes them).
- `prefers-reduced-motion` continues to disable transitions.

## 5. Design system compliance

- Coral palette, `#107357` primary, Instrument Sans / Schibsted Grotesk / DM Mono and the 1440 px container are preserved.
- No literal colours were introduced outside `tokens.css`; new CSS uses `var(--color-*)` and `color-mix()`.
- No new design system, icon library or animation library was added.
- The approved logo asset is untouched.
- No invented metrics, testimonials, logo walls or certifications were added.
- The two new photographs are project-owned local assets, not hotlinked stock.

## 6. Remaining visual notes / accepted limitations

1. Signed-in screenshots used stub data, so they verify composition and states, not live pagination/count text.
2. Not individually re-captured in Phase 7: aggregator lot details, aggregator offer details, recycler offer details and both handover forms. They inherit the reviewed shell and card rules but have not been visually re-approved in this phase.
3. The wide material feature card intentionally gives the photograph more space than the copy; with a real user photo or a stricter content limit it can be rebalanced.
4. `color-mix()` is used for subtle tints; very old browsers without support fall back to the base token colour in most declarations, but this was not browser-matrix tested beyond Chromium/WebKit via Playwright.
5. Dashboard secondary page titles remain Title Case in a few section headings (for example “Pending pickup requests” is sentence case, while some older sub-headings remain as-is). No functional or readability issue was found.

## 7. Hallmark outcome

**Before Phase 7:** visually inconsistent public/auth layers, duplicated hero branding, template-like card repetition, no verification UI, and signed-in screens that read as raw data dumps.

**After Phase 7:** a purposeful public narrative with real material photography, a branded auth shell with complete verification states, and a consistent signed-in system with clear hierarchy, thumbnails, empty states and mobile navigation.

**Verdict:** ready for the live email-verification round-trip and a follow-up visual pass on the four offer/handover detail screens. No blocker-level visual defect remains on the pages inspected.
