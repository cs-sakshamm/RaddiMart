# RADDIMART — Rollback and Recovery

## Rollback scenarios

| Scenario | Rollback method | Data impact |
|----------|----------------|-------------|
| Frontend deployment fails | Revert to previous Cloudflare Pages deployment | None |
| Database migration fails partway | Fix migration, re-apply; do not reset | None (migrations are additive) |
| Bad migration applied to production | Create new reverting migration; apply via `supabase migration up` | Controlled by reverting migration |
| Supabase credentials leaked | Rotate `SUPABASE_ACCESS_TOKEN`, regenerate keys | None |

## Frontend rollback (Cloudflare Pages)

Cloudflare Pages keeps previous deployments. To roll back:

1. Go to Cloudflare Pages → `raddimart` project → Deployments.
2. Select the previous successful deployment.
3. Click "Rollback to this deployment" or redeploy that version.

Alternatively, revert the Git commit and re-trigger the GitHub Actions deployment:

```powershell
git revert <bad-commit-hash>
git push origin main
```

## Database migration rollback

Supabase migrations are **additive and forward-only**. There is no automatic `down` migration.

### If a migration fails partway

1. Check `supabase migration list` to see which migrations applied.
2. Fix the failing migration file.
3. Re-run `supabase migration up`.
4. Do NOT run `supabase db reset` (this destroys all data and is forbidden remotely).

### If a bad migration is applied to production

1. Do not edit or delete the applied migration file.
2. Create a new migration that reverts or corrects the changes:
   ```powershell
   npm run supabase:migration:new
   ```
3. Write SQL in the new migration to undo or fix the bad change.
4. Apply via `supabase migration up --password $env:SUPABASE_DB_PASSWORD`.
5. Verify critical database objects (tables, RLS, functions, indexes).

## Secrets rotation

### Rotating Supabase access token

1. Generate a new token in Supabase dashboard → Account settings → Access tokens.
2. Update `SUPABASE_ACCESS_TOKEN` in GitHub repository secrets.
3. Old token is immediately invalidated.

### Rotating Supabase database password

1. Change the password in Supabase dashboard → Database → Settings.
2. Update `SUPABASE_DB_PASSWORD` in GitHub repository secrets.
3. Update `.env` locally if using local Supabase.

### Rotating Cloudflare API token

1. Generate a new token in Cloudflare dashboard → My Profile → API Tokens.
2. Update `CLOUDFLARE_API_TOKEN` in GitHub repository secrets.

## Disaster recovery

### Lost Supabase project access

1. Contact Supabase support to restore project access.
2. Re-link the CLI: `supabase link --project-ref <ref>`.
3. Verify migration history: `supabase migration list`.

### Accidental data deletion

1. Supabase provides point-in-time recovery (PITR) on paid plans.
2. On the free plan, restore from any available backup or re-apply migrations.
3. Application data must be re-entered by users.

### Cloudflare Pages project deleted

1. Recreate the Pages project named `raddimart`.
2. Reconnect the GitHub repository or re-trigger GitHub Actions deployment.
3. Reconfigure environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

## Emergency contacts

- Project owner: deployment authorization, business decisions
- Supabase support: database infrastructure issues
- Cloudflare support: Pages hosting issues

## What NOT to do during rollback

- Do not run `supabase db reset` against any environment other than local.
- Do not delete or modify applied migration files.
- Do not bypass migration errors during recovery.
- Do not expose secrets in rollback scripts or logs.
