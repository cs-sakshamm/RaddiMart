-- Forward-only compatibility migration
--
-- Some Supabase projects keep the uuid-ossp extension in the `extensions`
-- schema. Migration 001 uses `CREATE EXTENSION IF NOT EXISTS`, which is a no-op
-- in that case, so the unqualified `uuid_generate_v4()` used by migrations 003+
-- cannot be resolved on the migration search_path ("$user", public).
--
-- This migration exposes a public shim only when one does not already exist.
-- It is idempotent: on projects where uuid-ossp lives in `public`, the
-- extension's own function is already present and nothing is created.
-- PostgreSQL's built-in gen_random_uuid() supplies the value, so no new
-- extension or cloud dependency is introduced.

DO $$
BEGIN
  IF to_regprocedure('public.uuid_generate_v4()') IS NULL THEN
    EXECUTE $ddl$
      CREATE FUNCTION public.uuid_generate_v4()
      RETURNS uuid
      LANGUAGE sql
      VOLATILE
      SET search_path = ''
      AS $fn$
        SELECT pg_catalog.gen_random_uuid()
      $fn$
    $ddl$;
  END IF;
END
$$;
