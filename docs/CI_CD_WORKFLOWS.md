# RADDIMART — CI/CD Workflows

Two GitHub Actions workflows support testing and production validation:

1. `.github/workflows/ci.yml` — Continuous Integration
2. `.github/workflows/deploy-production.yml` — Production database validation and Vercel handoff

The frontend is deployed by **Vercel Git integration** from `main`. The GitHub workflow validates and, when needed, applies Supabase migrations before handing off to Vercel.

## CI workflow (`ci.yml`)

### Triggers

- Push to `main` or `develop`
- Pull request to `main` or `develop`

### Runtime

- Node.js `22` (`package.json` requires `>=22.12.0`)
- Vite 8 and Vitest 5 are not compatible with the default Node `20` runner image used previously.

### Jobs

| Job | Runs on | Description |
|-----|---------|-------------|
| `lint-and-build` | ubuntu-latest | ESLint + Vite production build |
| `unit-tests` | ubuntu-latest | vitest unit tests |
| `playwright-tests` | ubuntu-latest | Playwright browser tests (Chromium, mobile Chrome, mobile Safari) |
| `local-migration-validation` | ubuntu-latest | Starts local Supabase via Docker, applies migrations, runs SQL validation |
| `dependency-check` | ubuntu-latest | `npm audit` for vulnerable dependencies |
| `secret-scanning` | ubuntu-latest | GitHub CodeQL + TruffleHog secret scanning |

Playwright builds the app with a local-looking, non-secret browser config (`VITE_SUPABASE_URL=http://127.0.0.1:54321` and a stub publishable key). Browser suites stub Supabase at the network layer; suites that need a real database skip unless their `INTEGRATION_*` variables are configured.

### Concurrency

`ci-${{ github.ref }}` — cancels in-progress CI runs for the same ref.

### Artifacts

Playwright HTML report uploaded as `playwright-report` (7-day retention).

## Production workflow (`deploy-production.yml`)

### Trigger

- Push to `main` only

### Environment

Uses the GitHub `production` environment with an approval gate.

### Secrets used

| Secret | Source |
|--------|--------|
| `SUPABASE_ACCESS_TOKEN` | GitHub Actions secret |
| `SUPABASE_PROJECT_REF` | GitHub Actions secret |

No service-role key, database password or Cloudflare token is required by the workflow. Vercel environment variables are configured in the Vercel dashboard, not in GitHub Actions.

### Sequence

1. Checkout repository
2. Install Node.js 22 and dependencies (`npm ci`)
3. Verify `vercel.json` SPA configuration and the `dist/` artifact
4. Run ESLint
5. Run production build (`npm run build`)
6. Install Supabase CLI `3.3.0`
7. Authenticate Supabase CLI with `SUPABASE_ACCESS_TOKEN`
8. Link to the project named by `SUPABASE_PROJECT_REF`
9. Verify the linked project ref from `supabase/.temp/project-ref`
10. Dry-run pending migrations (`supabase db push --remote --dry-run --yes`)
11. Apply pending migrations (`supabase db push --remote --yes`)
12. Verify critical tables, RLS, helper functions, profile backfill and `authenticated` SELECT grant through a single read-only CLI query
13. Hand off to Vercel Git integration, which deploys the verified `dist/` output from `main`

`supabase migration list --remote` is intentionally not used as a gate: `supabase db push --remote --dry-run --yes` already validates remote migration state and pending files, while the list command can fail on transient API responses without affecting whether migrations can be applied.

### Safety rules

- Never runs `supabase db reset` remotely
- Never rewrites migrations already applied
- Uses additive, idempotent migrations only
- Never exposes a service-role key to the browser or GitHub Actions
- Fails safely if database validation fails
- Frontend deployment is handled only after the database checks pass

See `docs/VERCEL_DEPLOYMENT.md` for the Vercel dashboard setup and smoke test.
