# RADDIMART — Environment and Secrets

## Environment variables

All frontend environment variables use the `VITE_` prefix (Vite convention). Only browser-safe values are ever exposed.

### `.env.example` (committed to Git)

Template with placeholders only. Never contains real secrets.

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### `.env` (local only, never committed)

Real values for local development. Listed in `.gitignore`.

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### Vercel environment variables

Configured in the Vercel dashboard (not in Git) for Production, Preview and Development:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)

`VITE_SUPABASE_PUBLISHABLE_KEY` takes precedence when both are set.

## GitHub Actions secrets

Configured in repository **Settings → Secrets and variables → Actions**:

| Secret | Description | Never exposed to |
|--------|-------------|------------------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI personal access token | Frontend / browser |
| `SUPABASE_PROJECT_REF` | Supabase project reference ID | Frontend / browser |

The production workflow uses token-based remote access. It does not need `SUPABASE_DB_PASSWORD`. No Cloudflare token is used because Vercel handles frontend deployment.

## Security rules

1. **`.env` is never committed** — listed in `.gitignore` alongside `.env.*` (except `.env.example`).
2. **No service-role key in frontend** — `VITE_SUPABASE_SERVICE_ROLE_KEY` must never be set. `src/lib/env.js` throws if it is present.
3. **No database passwords in frontend or Vercel variables** — the GitHub workflow authenticates with a Supabase access token.
4. **No secrets in workflow logs** — GitHub Actions automatically masks secrets; workflows never `echo` secret values.
5. **`.env.example` contains browser-safe values only** — never a secret key.
6. **Supabase client returns `null` when unconfigured** — the app degrades gracefully without credentials.

## Adding a new secret or variable

1. Obtain the value from Supabase for GitHub Actions secrets, or from the Supabase API settings for Vercel browser variables.
2. Add GitHub secrets in repository settings; add Vercel variables in the Vercel dashboard.
3. Reference GitHub secrets in workflows using `${{ secrets.SECRET_NAME }}`.
4. Never print or log secret values.

## Required Vercel environment variables

Set these in the Vercel dashboard for the `RaddiMart` project:

| Variable | Value source |
|----------|-------------|
| `VITE_SUPABASE_URL` | `https://gzpjxyvhozlwwkqrxhok.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → Project Settings → API → Publishable key |

Do not set `VITE_SUPABASE_SERVICE_ROLE_KEY` in Vercel.
