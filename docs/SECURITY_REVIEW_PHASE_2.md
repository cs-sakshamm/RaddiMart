# RADDIMART — Phase 2 Security Review

## 1. Authentication Security

### 1.1 Supabase Client Configuration

- **Browser-safe key only**: Only `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` used in frontend
- **Service-role key never exposed**: `VITE_SUPABASE_SERVICE_ROLE_KEY` is rejected by `env.js` with error if present
- **Configuration validation**: `isSupabaseConfigured()` checks URL and key are set before creating client
- **Null client gracefully handled**: Foundation can render without credentials; auth gates disabled until configured

### 1.2 Session Management

- **persistSession: true**: Session stored in localStorage, restored on page reload
- **autoRefreshToken: true**: Supabase handles token refresh; no manual token management
- **detectSessionInUrl: true**: Session can be conveyed via URL parameters (one-time login)
- **Session validation on route protection**: ProtectedRoute checks session before rendering

### 1.3 Password and Credential Handling

- **Never store passwords in localStorage or sessionStorage**: Supabase manages session tokens server-side
- **No custom password hashing**: Uses Supabase Auth built-in password handling
- **Password strength**: Minimum 8 characters enforced in signup form
- **Password confirmation**: Required field matching validation

### 1.4 Email Security

- **Neutral password recovery message**: "If that email is registered, a password reset link has been sent." — does not reveal whether email exists in system
- **Email confirmation**: Enabled by default; user must verify before full access
- **No email enumeration**: Reset password flow designed to not reveal registration status

## 2. Role-Based Access Control Security

### 2.1 Role Source

- **`profiles.active_role`** stored in database, not derived from client-supplied data
- **`profiles.is_admin`** flag — stored in database, not modifiable from browser
- **Default**: every new user gets `active_role = 'consumer'` and `is_admin = FALSE` via database trigger

### 2.2 Preventing Self-Promotion

- **Frontend**: Role edit disabled; cannot change active_role or is_admin
- **Database**: RLS policies prevent users from updating own active_role or is_admin
- **Function**: `approve_role_request()` explicitly checks `auth.uid()` against request user_id to prevent self-approval
- **Constraint**: `no_duplicate_pending_request` prevents duplicate pending requests

### 2.3 Admin Authorization

- **Admin flag**: `profiles.is_admin = TRUE` — must be bootstrapped by project owner via SQL
- **Function authorization**: `approve_role_request()` uses `SECURITY DEFINER` and verifies `profiles.is_admin = TRUE`
- **No hidden admin checks**: Authorization through database, not URL patterns, button visibility, or localStorage
- **Single admin bootstrap**: One admin profile; owner decides who gets admin flag

### 2.4 Role Request Workflow Security

- **Users can create own request**: `INSERT INTO role_requests WHERE user_id = auth.uid()`
- **Users can read own requests**: `SELECT FROM role_requests WHERE user_id = auth.uid()`
- **Users cannot approve/reject**: `UPDATE FROM role_requests` restricted to admins via RLS
- **Users cannot modify review fields**: RLS prevents non-admin access to reviewed_by, reviewed_at, review_note
- **Admins can review**: RLS policy allows administrators to select and update role_requests
- **Prevent duplicate pending**: Constraint `no_duplicate_pending_request` in schema

### 2.5 Role Escalation

- **Approved role**: `UPDATE profiles SET active_role = <new_role> WHERE id = <user_id>`
- **Rejected role**: User's role unchanged; can submit new request
- **Role revocation**: Administrator can `UPDATE profiles SET is_admin = FALSE, active_role = 'consumer' WHERE id = <user_id>`
- **Multiple tabs**: Session state synced; role changes propagate across tabs

## 3. Database Security

### 3.1 Row Level Security

- **RLS enabled on all user-facing tables**: profiles, material_categories, price_rates, role_requests, transactions, handover_records, recyclers, material_lots, scrap_listings
- **Users own data only**: Each user can read/write only their own records (profiles.id = auth.uid())
- **Administrators have full access**: RLS policy WHERE profiles.is_admin = TRUE
- **Critical transitions protected**: Pickup acceptance, status changes, role approvals all server-side

### 3.2 Table-Specific RLS

| Table | User Access | Admin Access |
|-------|-------------|--------------|
| profiles | READ/OWN UPDATE only | Full access |
| material_categories | READ only | CRUD |
| price_rates | READ active only | CRUD |
| role_requests | CREATE/READ own | READ all, UPDATE status/notes |
| transactions | READ own, INSERT consumer | Full access |
| handover_records | READ own | Full access |
| recyclers | READ only | CRUD |
| material_lots | Role-specific READ | Full access |
| scrap_listings | READ/own UPDATE | Full access |

### 3.2 Database Functions

- **`approve_role_request()`**: SECURITY DEFINER, validates administrator permission, prevents self-approval, updates request and user role
- **Safe search_path**: SET to 'public' to avoid schema ambiguity
- **Explicit validation**: Caller's authorization explicitly validated; user ID from auth, not from request body
- **No dynamic SQL**: Static SQL queries only; no string interpolation of user-supplied data

## 3.3 Critical Security Boundaries

| Boundary | Rule |
|----------|------|
| Browser | Holds only publishable/anonymous credentials; never service-role key |
| Supabase Auth | Owns identity and session validity |
| PostgreSQL | Owns record ownership, status transitions, uniqueness, RLS |
| Frontend | Role checks shape navigation only; never security boundary |
| Storage | Private by default; policies mirror record ownership |
| Public QR | Narrow read-only fields; no personal data, no auth data |

## 4. Frontend Security

### 4.1 Input Validation

- **Required fields**: Enforced in all forms
- **Email format**: Validated on signup and password reset
- **Password matching**: Confirm password must match
- **Minimum password length**: 8 characters
- **Role selection**: Must select before submitting role request

### 4.2 Error Handling

- **User-friendly messages**: Never expose raw database errors
- **No stack traces**: User-facing errors are sanitized
- **Graceful degradation**: If Supabase unavailable, show configuration error state

### 4.3 Prevention of Common Vulnerabilities

- **XSS**: No user-supplied data rendered without sanitization; React's default XSS prevention
- **CSRF**: Supabase handles; no independent form submissions
- **SQL Injection**: Parameterized queries via Supabase JS client; no raw SQL in frontend
- **Path traversal**: All routes validated; no user-supplied path concatenation
- **Open redirects**: Redirect URLs configured in Supabase dashboard only

### 4.4 Session Security

- **Session timeout**: Handled by Supabase auto-refresh
- **Multiple tab sync**: Session state consistent across tabs
- **Logout**: `supabase.auth.signOut()` clears session on all tabs
- **Unfocused tab**: Session preserved; no leakage

## 5. Data Protection

### 5.1 Personal Information

- **Phone numbers**: Optional; stored encrypted at rest (PostgreSQL)
- **Location data**: City/zone-level only; no precise GPS in MVP
- **Identity exposure**: Public QR verification shows only non-sensitive transaction metadata
- **QR receipt**: Digital transaction record; does not establish legal compliance

### 5.2 Sensitive Data Protection

- **No service-role keys** in frontend code or environment
- **No passwords** in localStorage/sessionStorage
- **No auth tokens** exposed in API calls or URLs
- **QR payload**: Contains only transaction reference; no sensitive data

### 5.3 Data Retention

- **Profiles**: Persisted for active user session; can be updated
- **Role requests**: Persisted with status timeline (pending → approved/rejected)
- **Transaction history**: Persisted; historical records preserved, not overwritten
- **Handover records**: Persisted with QR tokens for verification

## 5.4 Compliance Notes

- **Not a certified recycling facility registry**: Recycler role does not imply legal authorization
- **Verification status separate**: `verification_status` in recyclers table distinct from role label
- **QR receipts**: Explicitly stated as digital transaction records only; not compliance certificates
- **Payment independent**: Payment status separate from handover confirmation

## 6. Security Testing

### 6.1 Available Tests

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- No critical vulnerabilities in implemented code

### 6.2 Tests Requiring Live Supabase

- Integration tests with actual auth flows
- RLS policy verification with multiple test users
- Role approval function testing
- End-to-end authentication workflows

### 6.3 Manual Security Checklist

- [ ] Supabase URL and key configured (no service-role key)
- [ ] Email confirmation enabled
- [ ] RLS enabled on all tables
- [ ] Admin profile bootstrapped via SQL
- [ ] `approve_role_request()` function tested with admin credentials
- [ ] Role request workflow tested (create, view status, admin approval)
- [ ] Password reset flow tested
- [ ] No VITE_SUPABASE_SERVICE_ROLE_KEY in environment
- [ ] Error messages are user-friendly (no database stack traces)
- [ ] Focus visible on all interactive elements
- [ ] Touch targets minimum 44px
- [ ] Responsive at 6 viewport sizes
- [ ] No horizontal overflow at any breakpoint
- [ ] Console errors none on fresh load

## 7. Known Security Considerations (Phase 2 Scope)

- **Recycler verification not independently verified**: Role approval grants access; does not certify legal authorization
- **No payment gateway**: Payment status tracked independently but no gateway integrated
- **No AI classification**: Image-based scrap categorization not implemented
- **No blockchain**: No distributed ledger components
- **No native mobile**: Web-only responsive experience
- **No offline-first**: Session depends on Supabase availability

These are Phase 2 boundaries; future phases may address these areas.