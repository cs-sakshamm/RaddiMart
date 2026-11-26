import { describe, it, expect, vi } from 'vitest';
import {
  PROFILE_MESSAGES,
  classifyProfileError,
  ensureOwnProfile,
  readOwnProfile,
} from '../src/lib/profileApi.js';
import { fetchOwnProfile } from '../src/lib/listingsApi.js';
import { fetchActiveRole } from '../src/lib/authApi.js';

const PROFILE = {
  id: 'user-1',
  full_name: 'New User',
  phone: null,
  active_role: 'consumer',
  is_admin: false,
};

// Minimal PostgREST-shaped stub: `from('profiles').select().eq().maybeSingle()`
// returns the queued reads in order, and `rpc()` returns a fixed result.
function profileClient({ reads = [PROFILE], readError = null, rpc = { data: null, error: null }, session = { user: { id: 'user-1' } } } = {}) {
  const calls = { reads: 0, rpcs: 0 };
  const maybeSingle = vi.fn(async () => {
    const index = Math.min(calls.reads, reads.length - 1);
    const row = reads[index];
    calls.reads += 1;
    if (readError) return { data: null, error: readError };
    return { data: row ?? null, error: null };
  });
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle };
  const supabase = {
    from: vi.fn(() => chain),
    rpc: vi.fn(async () => {
      calls.rpcs += 1;
      return rpc;
    }),
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: session ? { user: session.user } : null },
        error: null,
      })),
    },
  };
  return { supabase, calls };
}

describe('profile error classification', () => {
  it('treats a permission failure as an access problem, not a missing profile', () => {
    const result = classifyProfileError({ code: '42501', message: 'permission denied for table profiles' });
    expect(result.kind).toBe('permission');
    expect(result.message).toBe(PROFILE_MESSAGES.permission);
    expect(result.message).not.toMatch(/not found/i);
  });

  it('treats a missing repair function as an incomplete deployment', () => {
    const result = classifyProfileError({
      code: 'PGRST202',
      message: 'Could not find the function public.ensure_own_profile without parameters in the schema cache',
    });
    expect(result.kind).toBe('unavailable');
    expect(result.message).toMatch(/pending database migrations/i);
  });

  it('classifies transport failures as network problems', () => {
    expect(classifyProfileError({ name: 'TypeError', message: 'Failed to fetch' }).kind).toBe('network');
    expect(classifyProfileError({ status: 0, message: 'Load failed' }).kind).toBe('network');
  });

  it('classifies anything else as a retryable server problem', () => {
    const result = classifyProfileError({ status: 500, message: 'internal error' });
    expect(result.kind).toBe('server');
    expect(result.message).not.toMatch(/internal error/);
  });
});

describe('readOwnProfile', () => {
  it('returns the row without repairing when the profile exists', async () => {
    const { supabase, calls } = profileClient({ reads: [PROFILE] });
    const result = await readOwnProfile(supabase, PROFILE.id);
    expect(result.error).toBeNull();
    expect(result.profile).toEqual(PROFILE);
    expect(calls.rpcs).toBe(0);
    expect(supabase.from).toHaveBeenCalledWith('profiles');
  });

  it('repairs a genuinely missing profile once and returns the new row', async () => {
    const { supabase, calls } = profileClient({
      reads: [null],
      rpc: { data: PROFILE, error: null },
    });
    const result = await readOwnProfile(supabase, PROFILE.id);
    expect(calls.rpcs).toBe(1);
    expect(result.error).toBeNull();
    expect(result.profile).toEqual(PROFILE);
  });

  it('falls back to a re-read when the repair returns no row object', async () => {
    const { supabase, calls } = profileClient({ reads: [null, PROFILE] });
    const result = await readOwnProfile(supabase, PROFILE.id);
    expect(calls.rpcs).toBe(1);
    expect(calls.reads).toBe(2);
    expect(result.profile.id).toBe(PROFILE.id);
  });

  it('reports a missing profile only after a repair attempt fails to create one', async () => {
    const { supabase } = profileClient({ reads: [null, null] });
    const result = await readOwnProfile(supabase, PROFILE.id);
    expect(result.error.kind).toBe('missing');
    expect(result.error.message).toBe(PROFILE_MESSAGES.missing);
  });

  it('does not attempt a repair when the read was refused', async () => {
    const { supabase, calls } = profileClient({
      readError: { code: '42501', message: 'permission denied for table profiles' },
    });
    const result = await readOwnProfile(supabase, PROFILE.id);
    expect(result.error.kind).toBe('permission');
    expect(calls.rpcs).toBe(0);
  });

  it('reports an undeployed repair function without claiming the profile is missing', async () => {
    const { supabase } = profileClient({
      reads: [null],
      rpc: { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
    });
    const result = await readOwnProfile(supabase, PROFILE.id);
    expect(result.error.kind).toBe('unavailable');
  });

  it('refuses to query without a user id', async () => {
    const { supabase } = profileClient();
    const result = await readOwnProfile(supabase, undefined);
    expect(result.error.kind).toBe('no_session');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('ensureOwnProfile', () => {
  it('calls the safe repair function with no arguments', async () => {
    const { supabase } = profileClient({ rpc: { data: PROFILE, error: null } });
    const result = await ensureOwnProfile(supabase);
    expect(supabase.rpc).toHaveBeenCalledWith('ensure_own_profile');
    expect(result.error).toBeNull();
    expect(result.profile).toEqual(PROFILE);
  });
});

describe('dashboard profile lookup', () => {
  it('returns the session user and profile', async () => {
    const { supabase } = profileClient({ reads: [PROFILE] });
    const result = await fetchOwnProfile(supabase);
    expect(result.error).toBeNull();
    expect(result.data.user.id).toBe(PROFILE.id);
    expect(result.data.profile.active_role).toBe('consumer');
  });

  it('keeps a valid session but reports the real failure when the read is refused', async () => {
    const { supabase } = profileClient({
      readError: { code: '42501', message: 'permission denied for table profiles' },
    });
    const result = await fetchOwnProfile(supabase);
    expect(result.data).toBeNull();
    expect(result.error).toBe(PROFILE_MESSAGES.permission);
    expect(result.error).not.toBe('Profile not found. Please contact support.');
  });

  it('reports a session problem rather than a profile problem when signed out', async () => {
    const { supabase } = profileClient({ session: null });
    const result = await fetchOwnProfile(supabase);
    expect(result.error).toBe(PROFILE_MESSAGES.noSession);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('role lookup', () => {
  it('returns the stored role', async () => {
    const { supabase } = profileClient({ reads: [PROFILE] });
    await expect(fetchActiveRole(supabase, PROFILE.id)).resolves.toEqual({
      role: 'consumer',
      error: null,
    });
  });

  it('repairs a missing profile before falling back to a default dashboard', async () => {
    const { supabase, calls } = profileClient({
      reads: [null],
      rpc: { data: { ...PROFILE, active_role: 'collector' }, error: null },
    });
    const result = await fetchActiveRole(supabase, PROFILE.id);
    expect(calls.rpcs).toBe(1);
    expect(result.role).toBe('collector');
  });

  it('reports a read failure instead of silently returning no role', async () => {
    const { supabase } = profileClient({
      readError: { code: '42501', message: 'permission denied for table profiles' },
    });
    const result = await fetchActiveRole(supabase, PROFILE.id);
    expect(result.role).toBeNull();
    expect(result.error).toMatch(/not accessible/i);
  });
});
