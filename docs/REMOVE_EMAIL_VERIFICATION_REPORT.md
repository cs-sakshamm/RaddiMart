# RADDIMART — Remove Email Verification Report

**Date:** 26 November 2026
**Branch:** `develop`
**Scope:** Remove the email-verification requirement from signup/authentication.
**Deployment:** None performed. No production Supabase setting changed.

---

## 1. Summary

Email verification has been removed as an active requirement. Signup now creates an
authenticated session immediately and redirects the user to their role dashboard. The
verification page, resend-verification component and all verification-specific messaging
have been removed from the active application. Local Supabase email confirmation was
disabled (`enable_confirmations = false`). Profile creation is unaffected because it is
driven by the existing `on_auth_user_created` trigger on `auth.users`.

Unrelated security controls were preserved: password authentication and validation,
session persistence, protected routes, RLS, database ownership triggers, storage policies
and secure role assignment.

## 2. Files modified

| File | Change |
|------|--------|
| `supabase/config.toml` | `[auth.email] enable_confirmations = false`; comments updated to drop the verification redirect. |
| `src/lib/authApi.js` | `signUpWithEmail` now returns `signed_in` when a session exists and a clear error otherwise; removed `resendVerificationEmail` and `completeEmailVerification`; renamed redirect helper to `signInRedirectUrl` (`/signin`). |
| `src/lib/authMessages.js` | Removed `EMAIL_NOT_VERIFIED_MESSAGE`, `isEmailNotConfirmed`, `friendlyResendError`, `invalidVerificationLinkMessage`; signup/sign-in copy now reflects the new flow. |
| `src/components/SignUpPage.jsx` | Removed the “Check your email” state and `ResendVerification`; on `signed_in` reads `active_role` and redirects to `/dashboard/{role}`; email hint updated. |
| `src/components/SignInPage.jsx` | Removed `email_not_verified` branch and `ResendVerification`; straight to role dashboard on success. |
| `src/App.jsx` | Removed the `/verify-email` route and the `VerifyEmailPage` import. (`/verify/:token` handover route is unrelated and kept.) |
| `tests/auth.test.js` | Rewritten for the new signup/sign-in behaviour; verification/resend/link tests removed. |
| `tests/auth.spec.js` | Removed the stubbed “email verification journey” suite and unused fixtures. |
| `AGENTS.md` | Updated the authentication rule to state email confirmation is disabled and how to disable it on the hosted project. |
| `docs/AUTHENTICATION_AND_RBAC.md` | Updated signup/sign-in flows, config, edge cases and the moved regression section. |
| `docs/AUTHENTICATION.md` | **New** focused auth doc (signup, sign-in, session, RBAC, local/hosted config). |

## 3. Files removed

| File | Reason |
|------|--------|
| `src/components/VerifyEmailPage.jsx` | Exclusively served `/verify-email`; route removed. |
| `src/components/ResendVerification.jsx` | Exclusively supported the removed verification flow. |

## 4. Supabase configuration changes

### Local — applied
`supabase/config.toml`:

```toml
[auth.email]
enable_confirmations = false
```

### Hosted — still required (manual)
The hosted Supabase project must also have confirmation disabled. This was **not** changed
because there is no authorized dashboard access in this environment.

**Verified on 2026-11-26:** the linked hosted project still returns
`"mailer_autoconfirm": false` from `GET /auth/v1/settings`, which is the exact mismatch that
produced the reported signup and sign-in failures. See
`docs/AUTHENTICATION_FIX_REPORT.md`.

1. Supabase Dashboard → **Authentication → Providers → Email**.
2. Turn **“Confirm email”** off, save.
3. Verify in the deployed app: sign up with a fresh address and confirm you land on a
   dashboard without any email step, then sign out and sign back in.

## 5. Database changes

**None.** Profile creation already happens via `public.handle_new_user()` (SECURITY DEFINER)
on `auth.users` INSERT in migration `20261124000400_phase3_rls_and_collector_marketplace.sql`.
That trigger fires when the auth user is created, independent of email confirmation, so every
successful signup still yields exactly one profile linked to the correct user, with default
role `consumer` and `ON CONFLICT (id) DO NOTHING` guarding duplicates. No migration was needed.

## 6. Authentication behaviour before and after

| Step | Before | After |
|------|--------|-------|
| Signup submit | `signUp` returned no session (confirmation on) → “Check your email” screen with resend | `signUp` returns a session → redirect to `/dashboard/{role}` |
| Verification | Email link → `/verify-email` → session → dashboard | Removed entirely |
| Resend | Available after signup and on `email_not_confirmed` | Removed |
| Sign-in (new user) | Refused until verified; `email_not_confirmed` message + resend | Works immediately |
| Error copy | “Please verify your email…” etc. | Neutral sign-in/registration messages only |
| Profile creation | `on_auth_user_created` trigger | Unchanged |

## 7. Tests executed and results

| Check | Command | Result |
|-------|---------|--------|
| ESLint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Production build | `npm run build` | ✅ success (135 modules; only the pre-existing >500 kB chunk warning) |
| Unit tests | `npm test` | ✅ 63 passed, 35 skipped (integration suites skip without local Supabase keys) |

*Updated after the follow-up diagnosis in `docs/AUTHENTICATION_FIX_REPORT.md`:* unit tests are
now 68 passed / 35 skipped, two Playwright browser regressions were added and pass on
Chromium (6 passed, 2 skipped), and a live signup → session → profile → sign-out → sign-in
round-trip against the local Supabase stack passed 12/12 checks.

## 8. Hallmark review status

**Not performed.** No Hallmark design review of the rendered signup/sign-in pages was run in
this session. The changes are removal-only: the existing `AuthLayout`, branding and design
system are untouched. A Hallmark pass on the rendered pages remains available if desired.

## 9. Hosted Supabase dashboard steps still required

See §4. In short: disable **Authentication → Providers → Email → Confirm email** on the
hosted project, then verify signup lands directly on a dashboard.

## 10. Remaining limitations

1. Hosted Supabase confirmation was not changed (no authorized access). Until it is
   disabled, the deployed app would still require verification at the Supabase layer even
   though the UI no longer supports it. Confirmed still on (`mailer_autoconfirm: false`).
2. Playwright and live local-Supabase journeys were not executed at the time of this report;
   they were executed afterwards and passed — see `docs/AUTHENTICATION_FIX_REPORT.md`.
3. `docs/PHASE_7_REPORT.md` and `docs/PHASE_8_*` still describe the historical
   verification implementation; they are retained as historical records and are superseded
   by this report for current behaviour.
4. `scripts/capture-phase7.mjs` still references the removed `/verify-email` route; it is a
   one-off Phase 7 capture script and is not part of the running app.

## 11. Confirmation

No deployment, publish, Cloudflare change, hosted Supabase change, destructive database
operation, or RLS modification was performed. All changes are in the working tree on
`develop`.
