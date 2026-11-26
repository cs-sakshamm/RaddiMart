# RADDIMART — CI/CD Workflows

Two GitHub Actions workflows automate testing and deployment:

1. `.github/workflows/ci.yml` — Continuous Integration
2. `.github/workflows/deploy-production.yml` — Continuous Deployment

## CI workflow (`ci.yml`)

### Triggers

- Push to `main` or `develop`
- Pull request to `main` or `develop`

### Jobs

| Job | Runs on | Description |
|-----|---------|-------------|
| `lint-and-build` | ubuntu-latest | ESLint + Vite production build |
| `unit-tests` | ubuntu-latest | vitest unit tests |
| `playwright-tests` | ubuntu-latest | Playwright browser tests (Chromium, mobile Chrome, mobile Safari) |
| `local-migration-validation` | ubuntu-latest | Starts local Supabase via Docker, applies migrations, runs SQL validation |
| `dependency-check` | ubuntu-latest | `npm audit` for vulnerable dependencies |
| `secret-scanning` | ubuntu-latest | GitHub CodeQL + TruffleHog secret scanning |

### Concurrency

`ci-${{ github.ref }}` — cancels in-progress CI runs for the same ref.

### Artifacts

Playwright HTML report uploaded as `playwright-report` (7-day retention).

## Production deployment workflow (`deploy-production.yml`)

### Trigger

- Push to `main` only

### Environment

Uses the GitHub `production` environment with an approval gate. Deployment cannot proceed without required reviewer approval.

### Secrets used

| Secret | Source |
|--------|--------|
| `SUPABASE_ACCESS_TOKEN` | GitHub Actions secret |
| `SUPABASE_PROJECT_REF` | GitHub Actions secret |
| `SUPABASE_DB_PASSWORD` | GitHub Actions secret |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret |

### Deployment sequence

1. Checkout repository
2. Install Node.js dependencies (`npm ci`)
3. Run ESLint
4. Run production build (`npm run build`)
5. Install Supabase CLI
6. Authenticate Supabase CLI with `SUPABASE_ACCESS_TOKEN`
7. Link to target Supabase project via `SUPABASE_PROJECT_REF`
8. Verify linked project ref matches `SUPABASE_PROJECT_REF`
9. Check migration history (`supabase migration list`)
10. Validate pending migrations before applying
11. Apply pending migrations (`supabase migration up --password SUPABASE_DB_PASSWORD`)
12. Verify critical database objects:
    - All 9 tables exist
    - RLS enabled on all user-facing tables
    - `approve_role_request()` function exists with expected signature
13. Deploy frontend to Cloudflare Pages (`npx wrangler pages deploy dist`)
14. Production smoke test

### Safety rules

- Never runs `supabase db reset` remotely
- Never rewrites migrations already applied
- Never uses automatic destructive SQL
- Never bypasses migration errors
- Fails safely if any step fails
- Frontend deployment only proceeds if database migration succeeds

## Deployment order (enforced)

1. CI tests (lint, build, unit, Playwright, migration validation)
2. Production approval (GitHub environment gate)
3. Database migration deployment (Supabase CLI)
4. Production frontend build (Vite)
5. Cloudflare Pages deployment (Wrangler)
6. Production smoke tests

Frontend deployment is blocked if database deployment fails (separate jobs with the DB job completing first).

## Avoiding competing Cloudflare deployments

Do not connect the same Cloudflare Pages project to GitHub integration deployment while also using GitHub Actions deployment. Use only one deployment method per project.
