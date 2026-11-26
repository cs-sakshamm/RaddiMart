import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './env.js';

let supabaseClient;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const config = getSupabaseConfig();
  if (!config) return null;

  supabaseClient = createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}
