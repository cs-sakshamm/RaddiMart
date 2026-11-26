# RADDIMART — DevOps Setup Guide

This guide covers the complete DevOps and CI/CD automation setup for RADDIMART.

## Prerequisites

- Node.js 20.19+ or 22.12+ (Node 24 verified)
- npm
- Docker Desktop (for local Supabase development)
- Supabase CLI (v3.3.0 or later)
- GitHub account with access to the `cs-sakshamm/RaddiMart` repository
- Cloudflare account with Pages enabled
- One Supabase cloud project (no second project is created or required)

## Repository branches

| Branch | Purpose |
|--------|---------|
| `main` | Production. Deployed to Cloudflare Pages and Supabase production. |
| `develop` | Development. Integration branch for feature work. |
| `feature/*` | Individual feature branches, created from `develop`. |

## Local development setup

### 1. Clone and install

```powershell
git clone https://github.com/cs-sakshamm/RaddiMart.git
cd RaddiMart
git checkout develop
npm install
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
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/001_migration_validation.sql
```

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
| `SUPABASE_DB_PASSWORD` | Supabase database password (postgres) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

## GitHub Environments required

Create a **production** environment in GitHub (**Settings → Environments → production**):

- Add required reviewers (approval gate)
- No deployment bypass rules

## Cloudflare Pages setup

1. Create a Cloudflare Pages project named `raddimart`.
2. Connect the GitHub repository `cs-sakshamm/RaddiMart`.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables in Pages settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)
6. Do NOT enable Git integration deployment in the Cloudflare dashboard if using GitHub Actions deployment (avoids competing deployments).
