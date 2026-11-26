// Profile lookup and safe self-repair.
//
// A signed-in user may only read their own row, and the only repair the browser
// may request is "create my own missing row with the default role". Both rules
// are enforced in the database (RLS on profiles, plus the SECURITY DEFINER
// `ensure_own_profile()` which takes no arguments and always uses auth.uid()).
// Nothing here can grant a role or reveal another user's profile.

export const PROFILE_FIELDS = 'id, full_name, phone, active_role, is_admin';

export const PROFILE_MESSAGES = {
  noSession: 'No active session. Please sign in.',
  missing:
    'Your account is signed in, but its profile could not be created. Please contact support.',
  permission:
    'Your profile is not accessible with the current permissions. Please try again, and contact support if this continues.',
  network: 'Could not reach the server. Check your connection and try again.',
  server: 'Your profile could not be loaded right now. Please try again in a moment.',
  unavailable:
    'Your account is signed in, but profile setup is not available yet. An administrator needs to apply the pending database migrations.',
};

function messageOf(error) {
  return String(error?.message || '');
}

function statusOf(error) {
  const status = Number(error?.status);
  return Number.isFinite(status) ? status : null;
}

// Turns a database/transport failure into a category and a sentence that is
// true for that category. A refused or unreachable read is never reported as a
// missing profile.
export function classifyProfileError(error) {
  if (!error) return { kind: null, message: '' };

  const code = String(error.code || '');
  const status = statusOf(error);

  // The repair function is not deployed on this database yet.
  if (code === 'PGRST202' || /could not find the function/i.test(messageOf(error))) {
    return { kind: 'unavailable', message: PROFILE_MESSAGES.unavailable };
  }

  // PostgreSQL insufficient_privilege, or PostgREST rejecting the JWT.
  if (code === '42501' || status === 401 || status === 403) {
    return { kind: 'permission', message: PROFILE_MESSAGES.permission };
  }

  if (
    status === 0 ||
    error instanceof TypeError ||
    /failed to fetch|load failed|network/i.test(messageOf(error))
  ) {
    return { kind: 'network', message: PROFILE_MESSAGES.network };
  }

  return { kind: 'server', message: PROFILE_MESSAGES.server };
}

// Asks the database to create the caller's own profile when it is missing.
// Idempotent: an existing row is returned untouched.
export async function ensureOwnProfile(supabase) {
  const { data, error } = await supabase.rpc('ensure_own_profile');
  if (error) return { profile: null, error: classifyProfileError(error) };
  return { profile: data ?? null, error: null };
}

// Reads the caller's own profile. When the row is genuinely absent it performs
// one repair attempt and re-reads, so an account that predates the signup
// trigger heals itself instead of asking the user to sign in again.
export async function readOwnProfile(supabase, userId) {
  if (!supabase || !userId) {
    return {
      profile: null,
      error: { kind: 'no_session', message: PROFILE_MESSAGES.noSession },
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();

  if (error) return { profile: null, error: classifyProfileError(error) };
  if (data) return { profile: data, error: null };

  const repair = await ensureOwnProfile(supabase);
  if (repair.error) return { profile: null, error: repair.error };

  const repaired = repair.profile;
  if (repaired && typeof repaired === 'object' && repaired.id) {
    return { profile: repaired, error: null };
  }

  // Some PostgREST versions return an array for a set-returning composite; read
  // the row back rather than guessing at the shape.
  const retry = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();

  if (retry.error) return { profile: null, error: classifyProfileError(retry.error) };
  if (!retry.data) {
    return { profile: null, error: { kind: 'missing', message: PROFILE_MESSAGES.missing } };
  }
  return { profile: retry.data, error: null };
}
