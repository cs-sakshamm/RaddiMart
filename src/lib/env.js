const SUPABASE_URL_KEY = 'VITE_SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY = 'VITE_SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_ANON_KEY = 'VITE_SUPABASE_ANON_KEY';
const SERVICE_ROLE_KEY = 'VITE_SUPABASE_SERVICE_ROLE_KEY';

export function getSupabaseConfig({ required = false } = {}) {
  if (import.meta.env[SERVICE_ROLE_KEY]) {
    throw new Error(
      'A Supabase service-role key must never be exposed to the browser. Remove VITE_SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  const url = import.meta.env[SUPABASE_URL_KEY];
  const key =
    import.meta.env[SUPABASE_PUBLISHABLE_KEY] || import.meta.env[SUPABASE_ANON_KEY];

  if (!url || !key) {
    if (required) {
      throw new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and either VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY.',
      );
    }
    return null;
  }

  return { url, key };
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}
