# RADDIMART — Agent Instructions

Permanent instructions for all agents (OpenCode, Hallmark, and future agents) working on RADDIMART.

## Core principles

- **Build incrementally.** Do not rebuild the application or introduce unnecessary architectural changes.
- **Preserve existing working functionality.** Inspect before modifying.
- **Reuse existing services and event architecture.** Do not create duplicate service instances.
- **Use configuration instead of hardcoded machine-specific values.**
- **Do not introduce cloud dependencies.** Greeto/RADDIMART must remain offline-capable where applicable.
- **Do not silently download models or dependencies during operation.**
- **Do not block the GUI/main thread.**
- **Handle failures gracefully.**
- **Use deterministic automated tests.**
- **Do not fabricate performance numbers or claim untested hardware compatibility.**
- **Do not change unrelated modules.**
- **Preserve existing visitor/user data.**
- **Document architectural changes.**

## Stack

- React 19 + Vite 8 + Tailwind CSS 4 + JavaScript
- Supabase JS client 2.119.2 (browser-safe anon/publishable key only)
- Supabase CLI v3.3.0 (local database development)
- Vercel (production frontend hosting)
- Playwright (browser tests), vitest (unit tests)
- Hallmark (UI/UX design), OpenCode (implementation)

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production. Deployed to Vercel and Supabase production. |
| `develop` | Development. Integration branch for feature work. |
| `feature/*` | Individual feature branches, created from `develop`. |

## Supabase rules

- **One cloud project only.** Do not create or require a second Supabase project.
- **Browser-safe keys only.** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Never `VITE_SUPABASE_SERVICE_ROLE_KEY`** in frontend code or environment.
- **Migrations are additive and forward-only.** Never edit or delete applied migrations.
- **Never run `supabase db reset` remotely.** Local only.
- **RLS is enforced on every user-facing table.** Frontend role checks are cosmetic only.
- **Role identifiers:** `profiles.active_role` = `consumer/collector/aggregator/recycler`; `role_requests.requested_role` = `local_collector/aggregator/recycler` (maps `local_collector` → `collector`).
- **`approve_role_request()`** is the SECURITY DEFINER function for admin role approval. Do not bypass it.
- **Email confirmation is disabled (intentional product decision).** Signup creates an authenticated session immediately; users are redirected straight to their role dashboard with no verification step. Do not reintroduce a verification page, resend UI or `email_not_confirmed` handling. Local setting: `supabase/config.toml` (`[auth.email] enable_confirmations = false`). The hosted Supabase project must also have email confirmation turned off (Dashboard → Authentication → Providers → Email → "Confirm email" off).

## Local development commands

```powershell
npm install
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # Production build to dist/
npm run lint             # ESLint
npm run test             # vitest unit tests
npm run test:ui          # Playwright browser tests (needs a build + running local Supabase
                         # for the collector suite)
npm run supabase:start   # Start local Supabase (Docker required)
npm run supabase:stop    # Stop local Supabase
npm run supabase:reset   # Reset local database only (never remote)
npm run supabase:migration:up   # Apply pending local migrations
npm run supabase:migration:new  # Create a new migration
npm run supabase:gen:types      # Generate DB types from local Supabase
```

## Testing requirements

- Unit tests: `tests/**/*.test.{js,jsx}` (vitest)
- Browser tests: `tests/**/*.spec.js` (Playwright, 3 projects: Chromium, mobile Chrome, mobile Safari)
- Database validation: `supabase/tests/001_migration_validation.sql` (schema) and `supabase/tests/002_phase3_phase4_rls_validation.sql` (RLS + listing workflow)
- Backend integration tests: `tests/integration/phase4.integration.test.js` (real PostgREST/Storage).
  Enable with `INTEGRATION_SUPABASE_URL`, `INTEGRATION_SUPABASE_ANON_KEY` and
  `INTEGRATION_SUPABASE_SERVICE_KEY`. They only run against loopback URLs and skip with a warning otherwise.
  The Phase 4 Playwright suite needs the app built with the same local `VITE_SUPABASE_*` values.
- Never hardcode personal credentials. Use `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` env vars for auth tests.
- Tests requiring a real Supabase project must use a safe, explicitly configured test procedure. Never run destructive tests against production.
- Local seed (`supabase/seed.sql`) contains only the administrator-managed catalogue and local
  development rate cards. It is never applied to a remote project.

## CI/CD

- `.github/workflows/ci.yml` — runs on push/PR to `main` and `develop` (lint, build, unit, Playwright, migration validation, dependency check, secret scanning).
- `.github/workflows/deploy-production.yml` — runs on push to `main`, uses GitHub `production` environment approval gate.
- Deployment sequence: CI → approval → DB migration → frontend build → Vercel Git deployment → smoke test.
- Never deploy frontend if database migration fails.

## Documentation

- `docs/DEVOPS_SETUP_GUIDE.md` — local setup, branches, scripts, secrets
- `docs/CI_CD_WORKFLOWS.md` — CI and deployment workflows
- `docs/ENVIRONMENT_AND_SECRETS.md` — environment variables and secrets
- `docs/DEPLOYMENT_RUNBOOK.md` — manual deployment steps and checklist
- `docs/ROLLBACK_AND_RECOVERY.md` — rollback procedures and secrets rotation
- `docs/VERCEL_DEPLOYMENT.md` — Vercel setup, environment variables and smoke test
- `docs/PHASE_3_REPORT.md` — migration recovery + Phase 3 backend verification
- `docs/PHASE_4_REPORT.md` — collector marketplace implementation and test results
- `docs/PHASE_5_REPORT.md` — aggregator inventory and recycler offers
- `docs/PHASE_5_DESIGN.md` — approved Phase 5 design specification
- `docs/PHASE_7_REPORT.md` — Phase 7 UI/UX refinement, functional fixes, auth root cause and test results
- `docs/MATERIAL_CATEGORIES_FIX_REPORT.md` — hosted catalogue bootstrap, listing validation and focused mobile review
- `docs/AUTH_SIGNUP_SIGNIN_REPAIR.md` — Sign up / sign in root causes, auth state model, tests and manual Supabase steps
- `docs/HALLMARK_PHASE_7_REVIEW.md` — Phase 7 design review and corrections
- `docs/HALLMARK_UI_REVIEW.md` — UI/UX review and readiness assessment
- `docs/MIGRATION_FIX_REPORT.md` — migration failures and fixes
- `docs/ARCHITECTURE.md` — system architecture
- `docs/DATABASE_SCHEMA.md` — database schema
- `docs/AUTHENTICATION_AND_RBAC.md` — auth and RBAC
- `docs/SECURITY_REVIEW_PHASE_2.md` — security review
- `docs/HALLMARK_DESIGN_BRIEF.md` — design brief
- `docs/DESIGN_SYSTEM.md` — design system
- `docs/DESIGN_REVIEW_REPORT.md` — design review

## Future phase responsibilities

All future phases must:
- Use Hallmark for UI/UX design.
- Use OpenCode for implementation.
- Add automated tests (unit + Playwright).
- Validate migrations locally before production.
- Use CI and deployment workflows.
- Update AGENTS.md and documentation as needed.

## Do NOT

- Do not create a second Supabase project.
- Do not expose service-role or secret keys to the browser.
- Do not hardcode localhost URLs in redirect/email redirect options; use `${window.location.origin}/...`.
- Do not create duplicate TTS, Supabase client, or conversation manager instances.
- Do not duplicate event subscriptions.
- Do not commit `.env` or any secrets.
- Do not run destructive commands against production.
- Do not bypass migration errors.
- Do not claim untested features work.
