# RADDIMART — Phase 7 Report

**Date:** 26 November 2026
**Scope:** website-wide UI/UX refinement, functional issue resolution, email-verification root-cause fix
**Environment:** local development only. No deployment, no cloud Supabase change, no production data touched.
**Status:** implementation and automated verification complete for the work described; **one live-environment check remains pending** (see §12). Phase 7 is therefore not declared fully complete.

> **Superseded (26 November 2026):** The email-verification flow described in §7–§9 is no longer active. Email confirmation is now **disabled**; signup creates a session immediately and the verification page/resend UI have been removed. See `docs/REMOVE_EMAIL_VERIFICATION_REPORT.md`. The rest of this report is kept as a historical record.

---

## 1. Overall UI/UX improvements

| Area | Change |
|------|--------|
| Public landing page | New photographic hero (collection scene) replacing the oversized duplicate logo; purpose-built chain caption; clearer primary action. |
| Navigation | Logo kept in the masthead, section links plus a visible Sign in and Get started action on desktop; accessible Menu toggle on tablet/phone with Escape support and a Get started action inside the menu. |
| Challenge section | Two-column editorial layout with a real sorting-facility photograph, a shorter lead, and a three-item “what is missing” list instead of a wall of text. |
| Solution section | Split layout with a portrait image, plus three concrete product facts (one record, separate weights, checkable handover) derived from existing behaviour. |
| Materials | Asymmetric feature card plus a three-card row, replacing four identical cards; images crop consistently and load lazily. |
| Stakeholders | Numbered full-width rows with responsibility and benefit per role, replacing four generic cards. |
| How it works | Two-column layout with a sticky intro and a seven-step vertical rail; removes the dangling 4-column grid cell. |
| Benefits | Border-led columns rather than three more rounded cards. |
| CTA / footer | Dark CTA with a recovery-facility photograph; footer reorganised into Platform, Roles and Account columns with the logo retained. |
| Auth screens | Split brand/form shell: dark green panel with the approved logo and a real collection photograph on desktop, single-column on mobile. |
| Verification states | New “Check your email”, “Email verified” and “Verification link problem” screens built on the same shell. |
| Dashboards | Consistent header gradient, stronger summary cards with a brand rule, material thumbnails on listing/lot cards, improved empty states and loading text. |
| Profile / role request | Both moved into the shared dashboard shell with working navigation, status styling and clear form actions. |

The approved RADDIMART logo is unchanged and appears in the public nav, footer, every dashboard top bar, every auth screen and the handover verification page.

## 2. Pages and routes reviewed

Public: `/`, `/#how-it-works`, `/#materials`, `/#stakeholders`, `/#contact` (footer), Problem & Solution dialog.
Auth: `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/signout`.
Consumer: `/dashboard/consumer`, `/dashboard/create-listing`, `/listing/:id`, `/profile`, `/role-request`.
Collector: `/dashboard/collector`, `/collector/marketplace`, `/collector/pickups`, listing details as collector.
Aggregator: `/dashboard/aggregator`, `/aggregator/inventory`, `/aggregator/inventory/:id`, `/aggregator/offers`, `/aggregator/offers/:id`.
Recycler: `/dashboard/recycler`, `/recycler/offers`, `/recycler/offers/:id`, `/recycler/facility`.
Phase 6: handover sections inside aggregator/recycler offer details and `/verify/:token`.

## 3. Hallmark reviews completed

Hallmark v2.0.0 was used for the design pass and review. The rendered application was inspected from the production build at 1440 × 900, 768 × 1024 and 390 × 844, plus 360 px overflow checks. Screenshots are in `.hallmark/review/phase7/`. The signed-in screens were rendered with deterministic stubbed PostgREST responses because no local Supabase stack is available on this machine (Docker is not installed); the components, routing, CSS and states are the real application. The review record is in `docs/HALLMARK_PHASE_7_REVIEW.md`.

## 4. Visual defects identified and corrected

1. Hero duplicated the truck logo at very large size and had no real imagery; replaced with a photograph while the logo remains in the nav, footer and auth shell.
2. The Challenge section’s two-column copy was unbalanced and ended in a large empty area.
3. The seven-step flow left an empty fourth-column cell on desktop.
4. Cards and rows used identical rounded treatments on every section.
5. Mobile dashboard navigation clipped the final link; it now wraps and right-aligns Sign out.
6. Mobile listing cards squeezed the text into a narrow column after the first thumbnail change; replaced with an explicit two-column card grid.
7. The mobile menu’s toggle rendered below the open menu (order bug); the toggle now stays in the top bar.
8. Anchored sections sat under the sticky nav; `scroll-margin-top` was added.
9. Disabled primary buttons were white-on-pale-green; disabled styling now keeps dark text on a muted brand fill.
10. Sign-in/sign-up forms floated in a large empty page; the auth shell gives them a branded, aligned frame.
11. Form labels and page titles mixed Title Case and sentence case; page titles and the create-listing form labels were normalised.
12. Profile page displayed a lowercase role pill and had no navigation; role is capitalised and the shared dashboard nav is present.
13. Role request page used an inline orange status colour outside the palette; replaced with a token status pill.
14. Text-only listing, lot and offer cards made dashboards feel unfinished; project-owned material photography is now used as a fallback thumbnail.

## 5. Imagery added

Two new project-owned photographs were generated for Phase 7 and stored locally:

| File | Subject | Size |
|------|---------|------|
| `public/images/hero-collection.jpg` | A local collector sorting cardboard, cables and metal beside a collection cart | 1248 × 832, 159 KB |
| `public/images/sorting-facility.jpg` | Sorted bales and plastic inside a small recovery facility | 1248 × 832, 201 KB |

They are referenced with intrinsic `width`/`height`, `loading="lazy"` below the fold, `decoding="async"`, and `object-fit: cover` so no layout shift or distortion occurs. The existing five material photographs remain unchanged. No third-party stock URLs are used.

## 6. Logo preservation

The approved asset at `public/assets/raddimart-logo/raddimart-truck-logo.png` was not edited, replaced, hidden or redrawn. `BrandMark` still points to it. It appears in the public nav, the footer, all dashboard top bars, the auth screens and the handover verification header. The hero previously duplicated it at large scale; the hero now leads with photography, which is a composition change, not removal of the brand mark.

## 7. Email verification issue — root cause

The reported “email verification error” was reproduced from the code path and by stubbing the real Supabase Auth responses:

1. `SignUpPage` called `supabase.auth.signUp()` with `options: { emailConfirm: true }`. `emailConfirm` is **not** a Supabase option; confirmation is controlled by project configuration. It had no effect.
2. The project requires email confirmation, so `signUp()` returned a user and `session: null`.
3. The same handler immediately called `supabase.auth.signInWithPassword()`.
4. GoTrue correctly rejected that call with `email_not_confirmed` (“Email not confirmed”).
5. The app replaced the real cause with “Account created but sign in failed.” and navigated to `/signin`.
6. `/signin` displayed the raw provider text. There was no verification route, no `emailRedirectTo`, and no resend action, so the user could not complete the journey.

There was no database or RLS defect. The bug was entirely in signup/sign-in state handling.

## 8. Authentication fix implemented

- Removed the invalid `emailConfirm` option.
- Added `src/lib/authApi.js` and `src/lib/authMessages.js` for testable, provider-independent auth handling.
- Signup now uses `emailRedirectTo: ${window.location.origin}/verify-email` and **never attempts a password sign-in** when no session is returned.
- Signup shows a dedicated “Check your email” state with the address, an explanation, resend and a link to sign in.
- Existing-account and duplicate-signup responses resolve to the same neutral verification state, so account existence is not exposed.
- Sign-in classifies `email_not_confirmed` separately, shows a clear message and embeds a resend form pre-filled with the address.
- Wrong-email and wrong-password both return “Email or password is incorrect.”
- Raw GoTrue messages are not shown for unknown failures; rate limits, weak passwords, invalid email and network failures have their own copy.
- New `/verify-email` route:
  - supports PKCE `code`, `token_hash` links and the implicit hash consumed by `supabase-js`;
  - shows a verified state with a dashboard action and role-based redirect;
  - shows an expired/invalid state with a resend form instead of an endless loop.
- Resend uses `supabase.auth.resend({ type: 'signup' })` with the same redirect.
- `supabase/config.toml` now documents and allows the local dev and preview redirect URLs; cloud settings were not touched.
- No verification requirement was disabled and no unverified user is allowed into a protected area.

## 9. Authentication journey test results

Unit tests (`tests/auth.test.js`, 18 tests, all pass) cover signup with and without a session, duplicate signup, unknown provider errors, sign-in before verification, invalid credentials, rate limits, resend success/rate limit/empty email, PKCE code, token-hash and error callbacks, and non-leaking messages.

Browser tests (`tests/auth.spec.js`, network-stubbed Supabase Auth) cover and pass:

| Scenario | Result |
|----------|--------|
| Sign-in and sign-up pages render | pass |
| Forgot-password page renders | pass |
| Reset page without a recovery link shows a clear error | pass |
| Signup with confirmation required shows “Check your email” and makes **no token request** | pass |
| Sign-in before verification shows the unverified message and resend control | pass |
| Resend shows a success message | pass |
| Wrong password shows one neutral message | pass |
| Successful sign-in redirects to the role dashboard (collector stub) | pass |
| A valid verification link establishes a session and offers the dashboard | pass |
| Expired verification link offers a fresh link | pass |
| Protected routes redirect anonymous visitors | pass |
| Credential-based live sign-in | skipped (no `TEST_USER_*` configured) |

## 10. Other functional issues discovered and fixed

| Issue | Fix |
|-------|-----|
| Profile page `useEffect` depended on `fullName`/`phone`, so typing reloaded the profile and overwrote edits | Load once; edits are local until saved |
| Profile save submitted a form without `preventDefault`, causing a full-page reload | `preventDefault` added; update errors now surface |
| Profile page had no navigation and rendered `null` while loading | Shared dashboard shell plus a loading state |
| Role request page had no navigation and used inline `orange` | Dashboard shell, token status pill, back/cancel actions |
| Reset page could render duplicate invalid-link messages and an unusable form | One clear expired-link state; form only with a valid recovery session |
| Reset errors echoed raw provider text | Replaced with a clear expired/invalid message |
| `App.jsx` used `class` instead of `className` on the flow steps | Corrected during the flow-section rebuild |
| Dead Terms of Service `href="#"` link and unused imports | Link removed; imports cleaned |
| Broken/inconsistent heading case across signed-in pages | Page titles normalised; tests updated |
| No mobile menu; section links scrolled under the sticky nav | Accessible toggle + scroll offset |
| Empty and error states were single grey sentences | Helpful empty-state copy, first-listing action, consistent error buttons |

## 11. Tests executed and actual results

| Check | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | **0 errors, 0 warnings** |
| Production build | `npm run build` | **success** (137 modules; CSS 60.70 kB, JS 686.55 kB; Vite chunk-size warning only) |
| Unit tests | `npm test` | **70 passed, 35 skipped** (7 test files; integration files skip without local keys) |
| Browser tests, all 3 projects | `npx playwright test` | **102 passed, 36 skipped** |
| Integration suites | `vitest` Phase 4/5/6 | skipped: `INTEGRATION_SUPABASE_*` not configured and no local stack |

Skipped browser tests are the credential-based sign-in/password-recovery cases and the collector/aggregator/handover suites that require a local Supabase instance. Visual captures were produced by `scripts/capture-phase7.mjs` and `scripts/review-phase7-dashboards.mjs`.

## 12. Remaining issues and limitations

1. **Live email round-trip not executed.** Docker is not installed on this machine and no local Supabase instance is running. The fix is verified by unit tests and browser tests that stub GoTrue responses, but a real signup → Inbucket email → `/verify-email` → sign-in run is still required. Until that is done, the authentication issue should be described as **fixed in code and test-stubbed, not live-verified**.
2. **Cloud redirect allowlist.** `emailRedirectTo` must include `/verify-email` on the deployed project. This was intentionally not changed. The local values are documented in `supabase/config.toml`; the production value must be added through the Supabase dashboard during a deployment task.
3. **Signed-in visual review used stubbed data.** No live local database was available, so dashboards were reviewed with deterministic API responses. This verified layout and states, not database behaviour.
4. Offers, lot-details and handover detail screens inherit the shared styling but were not individually re-captured for Phase 7.
5. The build still emits the existing >500 kB chunk warning; code splitting was out of scope.
6. Lighthouse performance and real-device testing were not run.
7. The Vite dev server was started only through `vite preview` for captures; no deployment or publish step was performed.

## 13. Local-only confirmation

No deployment, publishing, Cloudflare change, cloud Supabase migration, production setting change, destructive database operation or production credential use was performed. All changes are in the working tree on `develop`. The only new remote calls were image generation for the two local assets; no application data left the machine.
