# Vercel deployment

Vercel is the production frontend host. Supabase remains the only backend project.

## Repository requirements (already in place)

- `vercel.json` declares:
  - framework: `vite`
  - install: `npm ci`
  - build: `npm run build`
  - output: `dist`
  - catch-all rewrite to `/index.html` so direct links such as `/profile` and `/dashboard/consumer` survive refresh
- `package.json` requires Node `>=22.12.0`
- GitHub CI uses Node `22`

## First-time Vercel setup

1. Open <https://vercel.com/new> and import `cs-sakshamm/RaddiMart`.
2. Use these settings:
   - Framework Preset: **Vite**
   - Root Directory: repository root
   - Build Command: `npm run build`
   - Install Command: `npm ci`
   - Output Directory: `dist`
   - Production Branch: `main`
3. In **Project Settings → General**, set Node.js Version to **22.x**.
4. Add environment variables in **Project Settings → Environment Variables** for Production, Preview and Development:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | `https://gzpjxyvhozlwwkqrxhok.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Copy from Supabase Dashboard → Project Settings → API → Publishable key |

   `VITE_SUPABASE_ANON_KEY` is only a fallback if no publishable key is set.

   Never add `VITE_SUPABASE_SERVICE_ROLE_KEY`, a database password or any secret key. The app rejects `VITE_SUPABASE_SERVICE_ROLE_KEY` at startup.

5. In Supabase Dashboard → Authentication → URL Configuration:
   - Site URL: your Vercel URL, for example `https://raddimart.vercel.app`
   - Redirect URLs: add `https://raddimart.vercel.app/**` and any custom domain with `/**`
   - Keep `http://localhost:5173/**` for local development
   - Email confirmation stays off

6. Click **Deploy**. Vercel builds from `main`.

GitHub Actions validates lint, tests, the build and Supabase migrations before the Vercel handoff. Vercel itself performs the frontend deployment from Git.

## Post-deploy smoke test

Open each URL directly, then hard-refresh it:

- `/`
- `/signin`
- `/signup`
- `/profile`
- `/dashboard/consumer`

Also verify:

1. Signing in with an existing account reaches the dashboard without “Profile not found.”
2. Signing up with a disposable account reaches the Consumer dashboard automatically.
3. The browser console has no Supabase configuration error.

Non-blocking build warnings may appear for lightningcss `@theme` and a chunk larger than 500 kB.
