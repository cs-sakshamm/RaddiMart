# RADDIMART — Authentication Fix Report

**Date:** 2026-11-26
**Branch:** `develop` (working tree, uncommitted)
**Scope:** signup and sign-in failures reported from the screenshots; email verification stays
removed.
**Deployment:** none. No Cloudflare, hosting, or production Supabase change was made.

---

## 1. Verdict

Both reported failures came from **one cause**: the Supabase project still requires email
confirmation (`mailer_autoconfirm: false`) while the application had already removed email
verification and therefore expected a session on signup.

The frontend logic itself was correct for a project with confirmation disabled, but it had no
way to recognise the mismatch, so it reported an unexplained failure for signup and a generic
failure for sign-in.

What changed in this pass is detection and reporting: both failures are now identified by
their real cause, no session is ever faked, and the configuration mismatch is named where an
administrator will see it. The remaining step that makes signup work end-to-end for the hosted
project is a Supabase project setting, which cannot be changed from the browser and was not
changed without authorization (§8).

---

## 2. Root cause — Issue A (signup)

**Observed backend state.** The linked hosted project reports:

```
GET $VITE_SUPABASE_URL/auth/v1/settings   (apikey: publishable key)
→ { ... "disable_signup": false, "mailer_autoconfirm": false ... }
```

`mailer_autoconfirm: false` means "Confirm email" is **on**. GoTrue then creates the user and
returns `session: null` — a confirmed account is required before a session is issued.

**Exact failure path in the code at the time of the report** (`src/lib/authApi.js`):

1. `supabase.auth.signUp()` → succeeded, `error: null`, `data.user` present,
   `data.session === null`.
2. The `if (data?.session)` branch was skipped.
3. The fallback returned the literal string
   `"Account created but session could not be established. Please try signing in."`

That string is exactly what the signup screenshot shows, which confirms this path was taken
rather than an account-creation error. The account **was** created, and its `profiles` row was
created too (the `handle_new_user` trigger runs on `auth.users` insert regardless of
confirmation) — the account simply had no session.

The backend did not "fail to create an account"; it deliberately withheld the session because
the project-level confirmation requirement was still enabled.

## 3. Root cause — Issue B (sign-in)

The same account was unconfirmed (`email_confirmed_at = null`), so
`signInWithPassword()` is rejected by GoTrue with `400` and
`{ "error_code": "email_not_confirmed", "msg": "Email not confirmed" }`.

Reproduced directly on the local stack against an account whose `email_confirmed_at` is null:

```
sign-in while unconfirmed: status 400, error_code email_not_confirmed, session false
```

The frontend's `friendlySignInError()` had no branch for `email_not_confirmed`, so it fell
through to the last resort — `"Could not sign you in. Please try again."` — which is exactly
the sign-in screenshot text.

**This was not a wrong password.** A wrong password produces
`invalid_credentials`, which maps to `"Email or password is incorrect."` — a different message
than the one reported.

## 4. Why removing the verification UI did not fix it

Removing `VerifyEmailPage`, the resend action, and the session-less fallback only changed the
client. The confirmation requirement is enforced by the auth service, not by the React app, so
the account stayed unconfirmed and could never obtain a session. A client-side removal can
never substitute for the project setting; only disabling confirmation (or confirming the user)
unblocks the account.

---

## 5. Changes made

### Files modified

| File | Change |
|------|--------|
| `src/lib/authApi.js` | Signup now distinguishes three outcomes: `signed_in` (session present), `existing_account` (GoTrue's empty-`identities` response for a registered address), and `confirmation_required` (user created, no session → the project still requires confirmation). Added dev-only, non-sensitive diagnostics (operation + outcome + short code; never credentials, tokens or URLs). Never fabricates a session and never issues a redundant `signInWithPassword` call. |
| `src/lib/authMessages.js` | Added `CONFIRMATION_REQUIRED_SIGNUP_MESSAGE` and `CONFIRMATION_REQUIRED_SIGNIN_MESSAGE`, plus `email_not_confirmed` / "email not confirmed" classification in `friendlySignInError()` (checked before `invalid_credentials`, so a blocked account is not reported as a wrong password). |
| `src/components/SignUpPage.jsx` | Handles every non-`signed_in` status with the message that status carries; only reads `profiles.active_role` and navigates when a session genuinely exists. |
| `tests/auth.test.js` | Regression tests for both screenshot failures (see §7). |
| `tests/auth.spec.js` | Two browser-level regressions using stubbed auth responses: signup returning a user with no session, and sign-in returning `email_not_confirmed`. Asserts the old copy and the generic copy do not appear and no dashboard redirect happens. |
| `docs/AUTHENTICATION.md` | Documented the confirmation mismatch, how to verify the project setting, and how to unblock accounts created while confirmation was on. |
| `docs/REMOVE_EMAIL_VERIFICATION_REPORT.md` | Recorded the verified hosted state and the follow-up test results. |

### Files added

| File | Purpose |
|------|---------|
| `docs/AUTHENTICATION_FIX_REPORT.md` | This report. |

### Files removed

None in this pass. (Verification page and resend component were removed in the earlier
verification-removal change.)

### Supabase configuration

- `supabase/config.toml` already had `[auth.email] enable_confirmations = false`.
- **Verified it is the correct key for the installed CLI (3.4.0) and that it takes effect.**
  Before restarting, the running stack still reported `"mailer_autoconfirm": false`; after
  `supabase stop` + `supabase start` it reported `"mailer_autoconfirm": true`. The config
  change alone is not enough — **the auth service must be restarted**.
- The hosted project is unchanged and still reports `mailer_autoconfirm: false`. See §8.

### Database

**No migrations, no schema changes, no trigger changes, no RLS changes.** Profile creation
remains `public.handle_new_user()` (SECURITY DEFINER) on `auth.users` INSERT, which inserts one
row with `ON CONFLICT (id) DO NOTHING` and default role `consumer`. No role is taken from
user-supplied metadata.

---

## 6. Corrected authentication flow

**Signup**

```
form validation → supabase.auth.signUp()
  ├─ error?               → friendly message (existing account / weak password / rate limit / network)
  ├─ session returned?    → read profiles.active_role → /dashboard/{role}   (email_confirmed_at set)
  ├─ user, empty identities → neutral "sign in" message (account already exists)
  └─ user, no session     → confirmation_required message naming the project setting
```

**Sign-in**

```
supabase.auth.signInWithPassword()
  ├─ email_not_confirmed  → "blocked by an email confirmation requirement the app does not use"
  ├─ invalid_credentials  → "Email or password is incorrect."
  ├─ rate limited / network → specific retry messages
  ├─ other error          → "Could not sign you in. Please try again."
  └─ session             → read profiles.active_role → /dashboard/{role}
```

Sessions, `ProtectedRoute`, RLS, storage policies and role assignment are untouched.

---

## 7. Testing

### Commands executed

| Check | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | **Pass** — 0 errors, 0 warnings |
| Production build | `npm run build` | **Pass** — 135 modules; only the pre-existing >500 kB chunk warning |
| Unit tests | `npm test` | **68 passed, 35 skipped** (103 total) |
| Browser tests | `npx playwright test tests/auth.spec.js --project=chromium` | **6 passed, 2 skipped** |

The 35 skipped unit tests are the backend integration suites
(`tests/integration/phase4–6`), which require `INTEGRATION_SUPABASE_URL`,
`INTEGRATION_SUPABASE_ANON_KEY` and `INTEGRATION_SUPABASE_SERVICE_KEY` and skip with a warning
otherwise. They were not enabled for this change.

The 2 skipped Playwright tests are the credential-dependent sign-in and password-recovery
flows, which require `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` and skip by design.

Chromium only was run; the `mobile-chrome` and `mobile-safari` projects were not executed.

### Regression tests added

Unit (`tests/auth.test.js`):

- Signup returns `confirmation_required` (not a fake success) when the project withholds a
  session; the old "session could not be established" copy is asserted absent and
  `signInWithPassword` is asserted **not** called.
- Signup with empty `identities` is `existing_account`, not a confirmation problem.
- Signup with neither user nor session still yields a generic error.
- Sign-in with `email_not_confirmed` is `email_unconfirmed`, and is neither the generic copy
  nor the wrong-password copy; classification also works from the message alone.

Browser (`tests/auth.spec.js`, stubbed responses, no network):

- Signup form submitted against a user-without-session response shows the confirmation message,
  not the old copy, and does not navigate to a dashboard.
- Sign-in against `400 email_not_confirmed` shows the confirmation message, not
  "Could not sign you in", not "Email or password is incorrect", and does not navigate.

### Live end-to-end verification (local Supabase, real HTTP)

Local stack restarted so `enable_confirmations = false` took effect. A real round-trip through
GoTrue/PostgREST with a throwaway address passed **12/12 checks**:

| Check | Result |
|-------|--------|
| Signup HTTP 200, user created | Pass |
| Signup returns an access token (no confirmation step) | Pass |
| `email_confirmed_at` set on the new user | Pass |
| Profile readable with the signup token; exactly 1 row | Pass |
| Role `consumer`; `full_name` from metadata | Pass |
| New user signs in immediately (`200` + session) | Pass |
| No `email_not_confirmed` on sign-in | Pass |
| Sign-out (`204`) | Pass |
| Duplicate signup returns `user_already_exists`, no session | Pass |

All test accounts created for this verification were deleted afterwards; no existing data was
modified.

### Observations that shaped the fix

| Observation | Result |
|-------------|--------|
| Unconfirmed account, `mailer_autoconfirm: false` | `400 email_not_confirmed`, no session — the reported sign-in failure |
| Unconfirmed account, `mailer_autoconfirm: true` | **still** `400 email_not_confirmed` — auto-confirm does not retroactively confirm existing accounts |
| Same account after admin confirmation | `200` + session — the documented recovery path |

### Not verified

- A live signup/sign-in round-trip against the **hosted** project was not performed: the
  setting is still on there, and creating production accounts was not authorized.
- `mobile-chrome` and `mobile-safari` Playwright projects were not run.
- Hallmark review (§9 below).

---

## 8. Remaining action — hosted Supabase (required)

The hosted project must stop requiring confirmation. Neither the frontend nor this repository
can do it, and it was **not** changed here (no authorized dashboard access).

1. Supabase Dashboard → project → **Authentication → Providers → Email**.
2. Turn **“Confirm email”** off, save.
3. Verify the backend actually changed:

   ```bash
   curl -s "$VITE_SUPABASE_URL/auth/v1/settings" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
   ```

   Expect `"mailer_autoconfirm": true`. (Before: `false`.)
4. Sign up with a fresh address in the deployed app → should land on `/dashboard/consumer`
   with no email step, then sign out and sign back in.
5. **Unblock the account created during the failed signup.** Turning the setting off does not
   confirm accounts that already exist with `email_confirmed_at = null`; they remain blocked
   (verified above). In **Authentication → Users**, confirm that user's email (⋯ → *Confirm
   email*). Do not delete the account and do not reset the database.

No duplicate account needs to be created for the existing user.

---

## 9. Hallmark UI/UX review

**Not performed.** No Hallmark design review was run in this session, so no UI review result is
claimed. The changes are limited to the text and branch handling of the existing
`auth-error` element inside the unchanged `AuthLayout`; branding, the RADDIMART logo, form
fields, password visibility control, loading labels and layout are untouched. A Hallmark pass
on the rendered signup/sign-in error states remains available if wanted.

---

## 10. Confirmation

- No deployment, publish, Cloudflare change or production Supabase configuration change.
- No service-role key in the browser; the app still uses only the publishable key.
- No migrations, no RLS or storage-policy changes, no authentication bypass, no fabricated
  session, no redundant sign-in call.
- No account deleted and no database reset; local verification accounts were removed after use.
- Email verification remains removed; it was not reintroduced as a workaround.
