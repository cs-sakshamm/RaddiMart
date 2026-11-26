# RADDIMART — Deployment Runbook

## Production deployment sequence

The production workflow validates the database and hands off to Vercel Git integration:

1. **CI passes** — `ci.yml` runs on push to `main` (lint, build, unit tests, Playwright, migration validation, dependency check, secret scanning).
2. **Production approval** — GitHub `production` environment requires reviewer approval before deployment proceeds.
3. **Frontend verification** — `deploy-production.yml` builds the app and verifies `vercel.json` and `dist/`.
4. **Database migration** — pending Supabase migrations are dry-run, then applied to the production project.
5. **Database verification** — a single read-only query checks tables, RLS, functions, profile backfill and grants.
6. **Vercel deployment** — Vercel Git integration builds and deploys the verified `main` commit.
7. **Production smoke test** — verifies the deployed application and sign-in/signup flows.

## Manual deployment steps (if automation is unavailable)

### Prerequisites

- GitHub `production` environment approval
- `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` configured
- Vercel dashboard access with environment variables already set

### Step 1: Verify local state

```powershell
git checkout main
git pull origin main
npm ci
npm run lint
npm test
npm run build
```

### Step 2: Validate and deploy database migrations

```powershell
npm install -g supabase@3.3.0
supabase login --token $env:SUPABASE_ACCESS_TOKEN
supabase link --project-ref $env:SUPABASE_PROJECT_REF
supabase db push --remote --dry-run --yes
supabase db push --remote --yes
```

Never run `supabase db reset` against production.

### Step 3: Verify database objects

Confirm all 9 tables exist, RLS is enabled, helper functions are present, every auth user has a profile and `authenticated` can `SELECT` from `profiles`. Use the read-only verification query in `.github/workflows/deploy-production.yml` or the SQL validation files under `supabase/tests/`.

### Step 4: Deploy frontend through Vercel

Push the verified commit to `main`. Vercel Git integration deploys it automatically using `vercel.json`. In the Vercel dashboard, confirm the Production deployment is **Ready** and that the browser-safe Supabase variables are present.

## Pre-deployment checklist

- [ ] CI passes on `main`
- [ ] Production environment approval granted
- [ ] Supabase CLI authenticated and linked to the correct project ref
- [ ] Migration dry-run succeeds and has no destructive changes
- [ ] Frontend build succeeds
- [ ] Vercel project has Node 22.x and the browser-safe Supabase variables

## Post-deployment verification

- [ ] Vercel Production deployment shows **Ready**
- [ ] Application loads at the production URL
- [ ] `/signin`, `/signup`, `/profile` and `/dashboard/consumer` load directly and after refresh
- [ ] No console errors on fresh load
- [ ] Signing in with an existing account reaches the dashboard without “Profile not found.”
- [ ] Database migration applied without errors

## What NOT to do during deployment

- Do not run `supabase db reset` against production.
- Do not edit migration files that have already been applied.
- Do not run automatic destructive SQL.
- Do not bypass migration errors — fix and re-attempt.
- Do not deploy frontend if database migration failed.
- Do not print secrets in logs.
