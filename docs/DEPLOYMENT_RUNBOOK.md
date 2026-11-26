# RADDIMART — Deployment Runbook

## Production deployment sequence

The production deployment is fully automated via GitHub Actions:

1. **CI passes** — `ci.yml` runs on push to `main` (lint, build, unit tests, Playwright, migration validation, dependency check, secret scanning).
2. **Production approval** — GitHub `production` environment requires reviewer approval before deployment proceeds.
3. **Database migration** — `deploy-production.yml` applies pending Supabase migrations to the production project.
4. **Frontend build** — Vite production build outputs to `dist/`.
5. **Cloudflare Pages deployment** — Wrangler deploys `dist/` to the `raddimart` Pages project.
6. **Production smoke test** — Verifies the deployment completed.

## Manual deployment steps (if automation is unavailable)

### Prerequisites

- GitHub `production` environment approval
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` configured
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` configured

### Step 1: Verify local state

```powershell
git checkout main
git pull origin main
npm ci
npm run lint
npm run build
```

### Step 2: Deploy database migrations

```powershell
npm install -g supabase@3.3.0
supabase login --token $env:SUPABASE_ACCESS_TOKEN
supabase link --project-ref $env:SUPABASE_PROJECT_REF
supabase migration list
supabase migration up --password $env:SUPABASE_DB_PASSWORD
```

### Step 3: Verify database objects

Confirm all 9 tables exist, RLS is enabled, and `approve_role_request()` function is present (see `supabase/tests/001_migration_validation.sql`).

### Step 4: Deploy frontend to Cloudflare Pages

```powershell
npx wrangler pages deploy dist --project-name raddimart
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables.

## Pre-deployment checklist

- [ ] CI passes on `main`
- [ ] Production environment approval granted
- [ ] Supabase CLI authenticated
- [ ] Migration history reviewed (`supabase migration list`)
- [ ] No destructive migrations pending
- [ ] Frontend build succeeds
- [ ] Cloudflare Pages project `raddimart` exists

## Post-deployment verification

- [ ] Cloudflare Pages deployment shows successful
- [ ] Application loads at the production URL
- [ ] Sign-in page is reachable
- [ ] No console errors on fresh load
- [ ] Database migration applied without errors

## What NOT to do during deployment

- Do not run `supabase db reset` against production.
- Do not edit migration files that have already been applied.
- Do not run automatic destructive SQL.
- Do not bypass migration errors — fix and re-attempt.
- Do not deploy frontend if database migration failed.
- Do not print secrets in logs.
