# RADDIMART — Authentication

**Status:** Email verification is **disabled** by product decision. Signup creates an
authenticated session immediately and the user lands on their role dashboard. There is no
verification page and no resend action.

`email_not_confirmed` is still recognised, but only to **diagnose and name a backend
misconfiguration**: if the Supabase project has not also turned confirmation off
(`mailer_autoconfirm: false`), signup returns a user with no session and password sign-in is
rejected. Both cases are reported explicitly rather than as a generic failure.
See `docs/AUTHENTICATION_FIX_REPORT.md`.

This document covers signup, sign-in, session handling, role-based dashboard access and the
Supabase email-confirmation configuration (local and hosted).

---

## 1. Signup behaviour

1. The user opens `/signup` and submits full name, email, optional phone and password.
2. The form validates password length (≥ 8) and matching confirmation client-side.
3. `signUpWithEmail()` in `src/lib/authApi.js` calls `supabase.auth.signUp()`.
4. Because email confirmation is off, Supabase returns a **session** with the created user.
5. `SignUpPage` reads the user's `profiles.active_role` and navigates to `/dashboard/{role}`
   (defaults to `consumer`).
6. The database trigger `public.handle_new_user()` (on `auth.users` INSERT) creates the
   matching `profiles` row with default role `consumer`. This runs regardless of email
   confirmation, so profile creation is unaffected.

If Supabase returns a user **without** a session — which only happens when the project still
requires confirmation — `signUpWithEmail()` returns `status: 'confirmation_required'` and the
page shows a message naming the cause and the fix instead of a generic retry prompt. It never
pretends the user is authenticated, never fabricates a session, and never spins forever.

A registered address returns GoTrue's empty-`identities` user with no session, which is
reported as `existing_account` (neutral wording), not as a confirmation problem.

**Duplicate accounts:** a neutral message asks the user to sign in; account existence is not
confirmed to an anonymous visitor.

## 2. Sign-in behaviour

- `signInWithEmail()` calls `supabase.auth.signInWithPassword({ email, password })`.
- Invalid credentials (wrong email or wrong password) return one neutral message:
  *"Email or password is incorrect."* — whether an address has an account is never revealed.
- `email_not_confirmed` (the project still requires confirmation) returns `kind:
  'email_unconfirmed'` with a message naming the confirmation requirement, **not** the generic
  *"Could not sign you in"* and not the wrong-password message.
- Rate limits return a wait message; network failures return a connection message.
- On success the role is read from `profiles` and the user is sent to `/dashboard/{role}`.
- A newly registered user can sign in immediately; no confirmation step is required.

## 3. Session handling

- `getSupabaseClient()` (`src/lib/supabase.js`) creates a single client with
  `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`.
- Sessions persist in localStorage and are restored on reload.
- `ProtectedRoute` redirects unauthenticated visitors to `/signin`.
- `SignOut` (`/signout`) calls `supabase.auth.signOut()` then navigates to `/signin`.

## 4. Role-based dashboard access

- Active role is read from `profiles.active_role` (server-side), never from user-supplied
  metadata.
- Dashboards: `/dashboard/consumer`, `/dashboard/collector`, `/dashboard/aggregator`,
  `/dashboard/recycler`.
- RLS policies are the security boundary; frontend role checks only shape navigation.
- Roles are granted only through the `approve_role_request()` admin function. No
  self-promotion, no trusting client role metadata.

Removing email verification does **not** change any of the above: password auth, session
persistence, protected routes, RLS, storage policies and secure role assignment are all
preserved.

## 5. Supabase email-confirmation configuration

### Local development (`supabase/config.toml`)

```toml
[auth.email]
enable_confirmations = false
```

Apply/restart the local stack (`npm run supabase:start`) so the setting takes effect.

### Hosted / production Supabase

If you do not have authorized dashboard access, do not change the hosted project from code.
Instead:

**Verified state (2026-11-26):** the linked hosted project still reports
`"mailer_autoconfirm": false`, so the mismatch described above is live. This was read from the
public settings endpoint using the browser-safe publishable key:

```bash
curl -s "$VITE_SUPABASE_URL/auth/v1/settings" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
# → { ... "mailer_autoconfirm": false ... }  (confirmation still required)
```

1. Open the Supabase Dashboard for the project.
2. Go to **Authentication → Providers → Email**.
3. Turn **“Confirm email”** off and save.
4. Re-run the command above; expect `"mailer_autoconfirm": true`.
5. Confirm the change by signing up with a fresh address in the deployed app: you should be
   redirected straight to a dashboard with no email required.

> The frontend cannot disable confirmation; the setting lives in the Supabase project.

**Accounts created while confirmation was required** are left with
`email_confirmed_at = null` and stay blocked from password sign-in even after the setting is
turned off (verified on the local stack: `400 email_not_confirmed` with
`mailer_autoconfirm: true`). Unblock them from **Authentication → Users → ⋯ → Confirm email**,
which was verified to restore sign-in (`200` + session). No database reset and no duplicate
account is needed.

## 6. Password recovery (unchanged)

- `/forgot-password` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })`.
- `/reset-password` waits for the recovery session and lets the user set a new password.
- These flows are independent of email confirmation for signup.

## 7. Related documents

- `docs/AUTHENTICATION_AND_RBAC.md` — full RBAC and RLS enforcement detail.
- `docs/REMOVE_EMAIL_VERIFICATION_REPORT.md` — change record for this task.
