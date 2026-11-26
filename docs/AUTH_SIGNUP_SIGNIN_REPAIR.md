# Sign Up / Sign In — Root-Cause Repair

Scope: the existing Supabase email/password authentication path. No provider
change, no new dependency, no schema change.

## Root causes found

### 1. The route guard navigated during render and hijacked navigation

`src/components/ProtectedRoute.jsx` called `navigate()` from the render body and
redirected **every** signed-in visitor to `/dashboard/{active_role}`.

Effects: `/profile`, `/listing/:id`, `/collector/marketplace`, `/aggregator/...`
and `/recycler/...` were unreachable for signed-in users — the first render after
the role loaded bounced them back to their own dashboard. React also warned about
updating a router component while rendering, and the same route could be pushed
repeatedly.

Fix: the guard now only redirects an unauthenticated visitor (declaratively, with
`<Navigate replace>`); an authenticated visitor always sees the requested page.
Role mismatch is already handled inside each dashboard component.

### 2. There was no authentication state model

Every guard read `supabase.auth.getSession()` once on mount and never subscribed
to auth events. A token refresh, sign-out in another tab or an expired session
left the UI on a stale state, and there was no defined "still initialising"
phase.

Fix: `src/components/AuthProvider.jsx` (state module in `src/lib/authState.js`)
owns one `onAuthStateChange` subscription plus the initial `getSession()` read,
and exposes `initializing | authenticated | unauthenticated`. The subscription is
cleaned up on unmount, and the app is wrapped once in `src/main.jsx`.

### 3. Protected pages could render before the session was read

`ProtectedRoute` returned `null` while checking and then rendered children; with
no shared initialising state every guard performed its own check, so slow storage
reads and re-checks produced flashes and repeated profile queries.

Fix: a guarded page now renders a small `role="status"` placeholder until the
single shared check completes, then either the page or a redirect.

### 4. The intended destination was lost after sign-in

The guard did not record where the visitor was going, so a deep link always ended
on the dashboard.

Fix: the guard passes `state.from`; `SignInPage` accepts it only through
`safeRedirectTarget()` (in-app paths only — no absolute or protocol-relative
URLs), so this cannot become an open redirect.

### 5. Forms sent invalid input to the provider

Both auth forms used `noValidate` but only sign-up checked the password length
and confirmation. Empty names/emails/passwords and malformed emails reached the
network, and errors were shown only in one summary line.

Fix: `src/lib/authValidation.js` holds the rules (required fields, email format,
minimum provider-compatible password length, confirmation match, terms). Errors
are shown beside each field with `aria-invalid`/`aria-describedby`, and invalid
input never triggers a request.

### 6. Duplicate submissions were possible

The submit button was disabled by React state, which does not stop a second
submit fired from the form in the same tick.

Fix: both handlers short-circuit on a `useRef` flag set synchronously.

### 7. Network failures were reported inconsistently per browser

The AuthRetryableFetchError message differs by browser ("Failed to fetch",
"Load failed", …), so WebKit network failures fell through to a generic message.

Fix: classification uses the error name and status, distinguishing a connectivity
failure (`status 0`) from a 5xx server failure.

## Email confirmation

`supabase/config.toml` disables confirmations (`[auth.email] enable_confirmations
= false`), which is the project decision recorded in `AGENTS.md`, so a successful
signup returns a session immediately. No verification-callback page is added. If
the hosted project still requires confirmation, signup returns `session: null`
and sign-in returns `email_not_confirmed`; both are reported explicitly instead of
being shown as success or as a wrong password.

## Tests

- `tests/auth-validation.test.js` — validation rules, redirect safety, role
  lookup, error classification (20 tests).
- `tests/auth.test.js` — existing auth API/message tests (unchanged).
- `tests/auth-flow.spec.js` — sign-in/sign-up journeys against stubbed provider
  responses: success and refresh persistence, invalid credentials, unconfirmed
  account, network and 5xx failures, no-request validation, double submit,
  destination resume, sign-out, signup success, duplicate email, confirmation
  mismatch (14 tests × 3 browser projects).

## Manual deployment steps

The frontend cannot change these; they belong to the Supabase project.

1. Authentication → Providers → Email: **Confirm email off** (matches
   `enable_confirmations = false`).
2. Authentication → URL Configuration: **Site URL** = the production origin, and
   the redirect allowlist must include `https://<production-host>/**` and
   `http://localhost:5173/**` (password reset uses
   `${window.location.origin}/reset-password`).
3. Verify a real signup and a real sign-in once against the hosted project; the
   automated suites use stubbed or loopback data only.
