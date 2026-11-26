# RADDIMART — DevOps Setup Guide

This guide covers the complete DevOps and CI/CD automation setup for RADDIMART.

## Prerequisites

- Node.js 22.12+ (Vite 8 and Vitest 5 require it; Node 24 is verified locally)
- npm
- Docker Desktop (for local Supabase development)
- Supabase CLI v3.3.0 or later
- GitHub account with access to the `cs-sakshamm/RaddiMart` repository
- Vercel account with Git integration enabled
- One Supabase cloud project (no second project is created or required)

## Repository branches

| Branch | Purpose |
|--------|---------|
| `main` | Production. Deployed to Vercel and Supabase production. |
| `develop` | Development. Integration branch for feature work. |
| `feature/*` | Individual feature branches, created from `develop`. |

## Local development setup

### 1. Clone and install

```powershell
git clone https://github.com/cs-sakshamm/RaddiMart.git
cd RaddiMart
git checkout develop
npm ci
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in browser-safe Supabase values:

```powershell
copy .env.example .env
```

Edit `.env`:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-browser-safe-anon-key
# or VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never add `VITE_SUPABASE_SERVICE_ROLE_KEY` or any secret key to `.env`.

### 3. Start the dev server

```powershell
npm run dev
```

Open `http://localhost:5173`.

### 4. Local Supabase (Docker required)

Start local Supabase:

```powershell
npm run supabase:start
```

Apply migrations:

```powershell
npm run supabase:migration:up
```

Run migration validation tests:

```powershell
$env:PGPASSWORD = 'postgres'
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/001_migration_validation.sql
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/002_phase3_phase4_rls_validation.sql
```

`postgres` is the documented development password for the ephemeral local stack only.

Reset only the local database (never remote):

```powershell
npm run supabase:reset
```

Stop local Supabase:

```powershell
npm run supabase:stop
```

Generate TypeScript database types from local schema:

```powershell
npm run supabase:gen:types
```

## Available npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run vitest unit tests |
| `npm run test:ui` | Run Playwright browser tests |
| `npm run supabase:start` | Start local Supabase (Docker) |
| `npm run supabase:stop` | Stop local Supabase |
| `npm run supabase:reset` | Reset local database only |
| `npm run supabase:migration:up` | Apply pending local migrations |
| `npm run supabase:migration:new` | Create a new migration |
| `npm run supabase:gen:types` | Generate DB types from local Supabase |
| `npm run supabase:status` | Show local Supabase status |

## GitHub secrets required

Configure these in GitHub repository **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI personal access token |
| `SUPABASE_PROJECT_REF` | Supabase project reference ID |

No database password, service-role key or Cloudflare token is required by the workflows. Vercel environment variables are configured in the Vercel dashboard.

## GitHub Environments required

Create a **production** environment in GitHub (**Settings → Environments → production**):

- Add required reviewers (approval gate)
- No deployment bypass rules

## Vercel setup

1. Import `cs-sakshamm/RaddiMart` in Vercel.
2. Keep the committed `vercel.json` settings: Vite framework, `npm ci`, `npm run build`, `dist` output and SPA rewrite.
3. Set the Node.js version to **22.x** in Project Settings.
4. Add the browser-safe Supabase environment variables in the Vercel dashboard for Production, Preview and Development.
5. Set the Supabase Auth redirect URLs to the Vercel domain.

See `docs/VERCEL_DEPLOYMENT.md` for the exact steps and smoke test.
