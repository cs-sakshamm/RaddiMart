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

### Cloudflare Pages environment variables

Configured in the Cloudflare Pages dashboard (not in Git):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)

## GitHub Actions secrets

Configured in repository **Settings → Secrets and variables → Actions**:

| Secret | Description | Never exposed to |
|--------|-------------|------------------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI personal access token | Frontend / browser |
| `SUPABASE_PROJECT_REF` | Supabase project reference ID | Frontend / browser |
| `SUPABASE_DB_PASSWORD` | Supabase postgres database password | Frontend / browser |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (Pages edit scope) | Frontend / browser |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | Frontend / browser |

## Security rules

1. **`.env` is never committed** — listed in `.gitignore` alongside `.env.*` (except `.env.example`).
2. **No service-role key in frontend** — `VITE_SUPABASE_SERVICE_ROLE_KEY` must never be set. `src/lib/env.js` throws if it is present.
3. **No database passwords in frontend variables** — `SUPABASE_DB_PASSWORD` is only used by GitHub Actions for Supabase CLI migration deployment.
4. **No secrets in workflow logs** — GitHub Actions automatically masks secrets; workflows never `echo` secret values.
5. **`.env.example` contains placeholders only** — real URLs and keys are replaced with examples.
6. **Supabase client returns `null` when unconfigured** — the app degrades gracefully without credentials.

## Adding a new secret

1. Obtain the value from the service provider (Supabase, Cloudflare).
2. Add it to GitHub repository secrets.
3. Reference it in the workflow using `${{ secrets.SECRET_NAME }}`.
4. Never print or log the value.

## Required Cloudflare Pages environment variables

Set these in the Cloudflare Pages dashboard for the `raddimart` project:

| Variable | Value source |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase browser-safe anon key |

Do not set `VITE_SUPABASE_SERVICE_ROLE_KEY` in Cloudflare Pages.
