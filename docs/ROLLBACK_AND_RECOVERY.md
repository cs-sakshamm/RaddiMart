# RADDIMART — Rollback and Recovery

## Rollback scenarios

| Scenario | Rollback method | Data impact |
|----------|----------------|-------------|
| Frontend deployment fails | Promote the previous successful Vercel deployment | None |
| Database migration fails partway | Fix migration and re-apply with `supabase db push`; do not reset | None (migrations are additive) |
| Bad migration applied to production | Create a new forward-only correcting migration and apply it | Controlled by the correcting migration |
| Supabase access token leaked | Rotate `SUPABASE_ACCESS_TOKEN` in GitHub secrets | None |

## Frontend rollback (Vercel)

Vercel keeps previous deployments. To roll back:

1. Go to Vercel → `RaddiMart` project → Deployments.
2. Find the last known-good Production deployment.
3. Open the deployment menu and choose **Promote to Production**.

Alternatively, revert the Git commit and let Vercel redeploy `main`:

```powershell
git revert <bad-commit-hash>
git push origin main
```

If the bad Vercel deployment came from an environment-variable change, correct the variable in the Vercel dashboard and redeploy.

## Database migration rollback

Supabase migrations are **additive and forward-only**. There is no automatic `down` migration.

### If a migration fails partway

1. Check migration history with `supabase migration list --remote`.
2. Fix the failing migration file.
3. Re-run `supabase db push --remote --dry-run --yes`, then `supabase db push --remote --yes`.
4. Do NOT run `supabase db reset` (this destroys all data and is forbidden remotely).

### If a bad migration is applied to production

1. Do not edit or delete the applied migration file.
2. Create a new migration that reverts or corrects the changes:
   ```powershell
   npm run supabase:migration:new
   ```
3. Write SQL in the new migration to undo or fix the bad change.
4. Apply via `supabase db push --remote --yes`.
5. Verify critical database objects (tables, RLS, functions, indexes, profile backfill and grants).

## Secrets rotation

### Rotating Supabase access token

1. Generate a new token in Supabase dashboard → Account settings → Access tokens.
2. Update `SUPABASE_ACCESS_TOKEN` in GitHub repository secrets.
3. Old token is immediately invalidated.

### Rotating Supabase publishable/anon key

1. Regenerate the browser-safe key in Supabase Dashboard → Project Settings → API.
2. Update `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) in Vercel.
3. Redeploy the Production environment so the new value is compiled into the frontend.

## Disaster recovery

### Lost Supabase project access

1. Contact Supabase support to restore project access.
2. Re-link the CLI: `supabase link --project-ref <ref>`.
3. Verify migration history: `supabase migration list --remote`.

### Accidental data deletion

1. Supabase provides point-in-time recovery (PITR) on paid plans.
2. On the free plan, restore from any available backup or re-apply migrations.
3. Application data must be re-entered by users.

### Vercel project deleted

1. Recreate the Vercel project from `cs-sakshamm/RaddiMart` with `main` as the Production branch.
2. Confirm `vercel.json` build settings and Node 22.x.
3. Reconfigure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Update Supabase Auth redirect URLs to the new Vercel domain.

## Emergency contacts

- Project owner: deployment authorization, business decisions
- Supabase support: database and auth infrastructure issues
- Vercel support: frontend hosting and deployment issues

## What NOT to do during rollback

- Do not run `supabase db reset` against any environment other than local.
- Do not delete or modify applied migration files.
- Do not bypass migration errors during recovery.
- Do not expose secrets in rollback scripts or logs.
