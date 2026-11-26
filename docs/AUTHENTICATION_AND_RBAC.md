# RADDIMART — Authentication and RBAC

This document describes the authentication and role-based access control (RBAC) system for RADDIMART Phase 2.

## Authentication Method

### Supported Method: Email/Password

- **Sign Up**: `supabase.auth.signUp()` with email, password, profile metadata and `emailRedirectTo`
- **Sign In**: `supabase.auth.signInWithPassword()` with email and password
- **Session Persistence**: `persistSession: true` — session stored in localStorage and restored on page reload
- **Auto-Refresh Token**: `autoRefreshToken: true` — Supabase handles token refresh automatically
- **Email Confirmation**: Disabled (intentional product decision). Signup returns an authenticated session immediately, so the user is redirected straight to their role dashboard. There is no verification page, resend action or `email_not_confirmed` handling.
- **Redirect after signup**: `/dashboard/{active_role}` (role read from `profiles`)
- **Local setting**: `supabase/config.toml` → `[auth.email] enable_confirmations = false`
- **Hosted setting**: Supabase Dashboard → Authentication → Providers → Email → "Confirm email" **off**

### Password Recovery

- `supabase.auth.resetPasswordForEmail(email)` — sends reset link; neutral success message
- `supabase.auth.updatePassword(password)` — user sets new password via recovery link

### Session Handling

- `supabase.auth.getSession()` — retrieves current session
- `supabase.auth.getUser()` — retrieves current user object
- Session restored on page reload via localStorage
- `persistSession: true` ensures session survives browser restart

## Role-Based Access Control (RBAC)

### Role Model

Four stakeholder roles with internal identifiers:

| Internal Identifier | Display Name |
|---------------------|--------------|
| `consumer` | Consumer |
| `collector` | Local Kabadiwala |
| `aggregator` | Large Kabadiwala / Aggregator |
| `recycler` | Recycler |

### Role Assignment

- **Default role**: `consumer` — every new user automatically receives the consumer role via database trigger on profile creation
- **Role requests**: Users can request additional roles (collector, aggregator, recycler) via the Role Request page
- **Admin approval**: Only administrators can approve role requests using the `approve_role_request()` database function
- **No self-promotion**: Users cannot change their own role or is_admin flag; all role changes are server-side

### Role Guard (Frontend)

After successful authentication:

1. Profile fetched from `supabase.from('profiles').select('active_role').eq('id', userId)`
2. Active role stored in application state
3. Navigation to correct dashboard: `/dashboard/{active_role}`
4. Protected routes check both authentication AND role

### Protected Routes

All dashboard routes protected by `ProtectedRoute` component:

- `/dashboard` — redirects to `/dashboard/{role}`
- `/dashboard/consumer` — Consumer dashboard only
- `/dashboard/collector` — Collector dashboard only
- `/dashboard/aggregator` — Aggregator dashboard only
- `/dashboard/recycler` — Recycler dashboard only

### Role-Based Redirects

- After login: user redirected to `/dashboard/{active_role}`
- If no profile exists: default to `/dashboard/consumer`
- If user manually enters unrelated dashboard URL: redirected to their permitted dashboard
- Access denied: clear message shown where appropriate

### RBAC Enforcement

**Ultimate security boundary**: PostgreSQL RLS policies and database functions

**Frontend shaping**: Role checks shape navigation and visible actions, but are never the security boundary

**Examples of role restrictions**:

- Consumer cannot access aggregator dashboard (contains management screens)
- Local Kabadiwala cannot access recycler dashboard
- Aggregator cannot access consumer-only management screens
- Recycler cannot access aggregator-only management screens

If a user enters an unauthorized route manually:
- Redirect to their permitted dashboard
- Display clear access-denied message where appropriate

## Authentication Flow

### 1. Sign Up (confirmation disabled)

```
User submits signup form → supabase.auth.signUp()
  → session returned (confirmations off) → read profiles.active_role → /dashboard/{active_role}
  → profile auto-created by on_auth_user_created trigger (default role: consumer)
  → no session (unexpected) → clear error, never pretend the user is signed in
```

The database trigger `public.handle_new_user()` creates the profile row from the auth user, so no verification round-trip is required for profile creation. No verification page, resend UI or email link exists in the app.

### 2. Sign In

```
User submits signin form → supabase.auth.signInWithPassword()
  → invalid credentials → "Email or password is incorrect." (one message for both fields)
  → rate limited → wait message
  → session → get profile → /dashboard/{active_role}
```

A newly registered user can sign in immediately; no email confirmation is required.

### 3. Sign Out

```
→ supabase.auth.signOut() → Navigation to /signin
```

### 4. Password Reset

```
User enters email → supabase.auth.resetPasswordForEmail() → 
Reset link sent → User checks email → Clicks link → 
New password set → Navigation to /signin
```

### 5. Role Request

```
Authenticated consumer submits role request → 
Role request saved to role_requests table with status 'pending' →
Applicant can view request status → Admin reviews via approve_role_request() →
Role updated if approved; user redirected to correct dashboard
```

## RBAC Summary

| Aspect | Rule |
|--------|------|
| Role source | `profiles.active_role` (server-side, not client-supplied) |
| Default role | `consumer` for all new users |
| Role changes | Only via `approve_role_request()` admin function |
| Self-promotion | Prevented at both frontend and database level |
| Admin identification | `profiles.is_admin = TRUE` (bootstrap via SQL) |
| Security boundary | RLS policies + database functions (not frontend checks) |
| Viewable roles | Frontend shows role-relevant navigation and content |
| Hidden roles | Backend enforces all critical operations |

## Security Edge Cases

- **Invalid email**: Sign up/login shows appropriate error message
- **Invalid password**: Authentication fails; user prompted to retry
- **Incorrect credentials**: Auth error; no user data exposed
- **Duplicate registration**: Email already taken; error shown
- **Email confirmation**: Disabled; users are authenticated at signup and can sign in immediately
- **Duplicate signup**: Neutral message asking the user to sign in; no duplicate account is created by the frontend
- **Rate-limited signup/sign-in**: Explains that too many attempts occurred and to wait
- **Raw provider errors**: Never shown for an unknown failure; classified messages only
- **Network failure**: User-friendly error; retry option
- **Supabase unavailable**: Configuration error state shown; app degrades gracefully
- **Missing profile**: Auto-created on first auth; if creation fails, user prompted to contact support
- **Profile loading failure**: Error state; user redirected to sign in
- **Session expiration**: Session check on route protection; redirect to sign in
- **Logout failure**: Supabase signOut(); navigation to signin page
- **Pending role request**: User can see status; cannot access collector+ dashboards until approved
- **Rejected role request**: User can submit new request if permitted
- **Role approval**: Admin function; role updated; user gains access to new dashboard
- **Role revocation**: Administrator can correct via database; user loses elevated access
- **Multiple tabs**: Session state synced; updates propagate across tabs

## Phase 7 auth bug and regression coverage

**Root cause (fixed):** signup sent the non-existent `options.emailConfirm`, ignored that Supabase returned no session, and immediately called `signInWithPassword`. GoTrue rejected it with `email_not_confirmed`, producing the reported verification error. There was no endpoint or UI to verify or resend.

**Superseded by the remove-email-verification task:** email confirmation is now disabled and the verification UI (`VerifyEmailPage`, `ResendVerification`) has been removed. See `docs/REMOVE_EMAIL_VERIFICATION_REPORT.md`. The components now are `src/lib/authApi.js`, `src/lib/authMessages.js`, `SignInPage`, `SignUpPage` and `AuthLayout`.

**Regression tests:**

- `tests/auth.test.js` — unit coverage of signup/sign-in branches.
- `tests/auth.spec.js` — real browser flows with Supabase Auth responses stubbed.

## Phase 3/4 enforcement (collector marketplace)

Frontend route guards remain cosmetic. The authoritative checks are:

| Requirement | Enforced by |
|-------------|-------------|
| Only approved collectors reach marketplace data | `scrap_listings` SELECT policy requires `current_active_role() = 'collector'`; aggregators and consumers see no marketplace rows |
| Consumers read only their own listings | `consumer_id = auth.uid()` SELECT policy |
| Only one collector can accept a pickup | UPDATE `USING (collector_id IS NULL AND status IN ('LISTED','PICKUP_REQUESTED'))`; a second claim matches no rows |
| Only the assigned collector updates their pickup | UPDATE `USING (collector_id = auth.uid())` plus the `scrap_listings_rules` trigger |
| Consumers cannot write collector fields | Trigger rejects `collector_id` / `actual_weight` changes by the consumer |
| Collectors cannot rewrite material terms | Trigger resets category, weight, condition, zone, preferred time, photo to the stored values |
| Invalid status transitions | Trigger raises `Invalid listing status transition` |
| Full address hidden before acceptance | `scrap_listing_addresses` RLS exposes the row only to the owner, the assigned collector, or an admin |
| No self-approval of role requests | `approve_role_request()` + `roles_requests` / profiles triggers |
| No self role escalation via direct API | `handle_profiles_update()` raises for non-admin callers |
| Photo uploads scoped to the owner | Storage policies require `listings/<auth.uid()>/…` |

Verified by `supabase/tests/002_phase3_phase4_rls_validation.sql` (SQL, role impersonation)
and `tests/integration/phase4.integration.test.js` (HTTP/PostgREST/Storage).

## Phase 5 enforcement (aggregator inventory and recycler offers)

| Requirement | Enforced by |
|-------------|-------------|
| Consumers cannot read material lots or offers | no SELECT policy for consumers on `material_lots` / `transactions` |
| Only approved aggregators see intake and their own lots | `material_lots` SELECT policy: `current_active_role() = 'aggregator'` AND (own aggregator_id OR unassigned intake) |
| One aggregator per lot | UPDATE policy `USING aggregator_id IS NULL AND status = 'IN_AGGREGATOR_INVENTORY'`; `enforce_material_lot_rules()` restricts the write to the caller's aggregator_id |
| Collected lot facts are immutable | the lot trigger rejects every other column change, including status and weight |
| Offers are visible only to the owning aggregator | `transactions` SELECT via `is_lot_aggregator(lot_id)` |
| Recycler sees only offers addressed to its facility | `transactions` SELECT via `is_offer_recycler(id)`; lot read via `recycler_has_lot_offer(id)` |
| One live offer per lot | partial unique index on `transactions(lot_id) WHERE status = 'OFFERED_TO_RECYCLER'` |
| Only withdrawal is allowed to a non-admin | `enforce_transaction_rules()` permits `OFFERED_TO_RECYCLER → WITHDRAWN` only; payment stays `PENDING` |
| Aggregators cannot offer someone else's lot | INSERT policy requires `is_lot_aggregator(lot_id)` |
| Recyclers cannot self-verify a facility | INSERT forces `verification_status = 'pending'`; UPDATE trigger restores the stored status and owner |
| Listing photos are not public | private `scrap-listings` bucket; SELECT limited to authenticated users; app uses signed URLs |

Verified by `supabase/tests/003_phase5_rls_validation.sql` (role impersonation) and
`tests/integration/phase5.integration.test.js` (HTTP/PostgREST/Storage).
