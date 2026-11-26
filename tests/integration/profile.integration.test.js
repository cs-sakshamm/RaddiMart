import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Profile bootstrap + repair against a real LOCAL Supabase instance
// (GoTrue + PostgREST). No mocks.
//
// Required environment variables:
//   INTEGRATION_SUPABASE_URL          e.g. http://127.0.0.1:54321
//   INTEGRATION_SUPABASE_ANON_KEY     local publishable/anon key
//   INTEGRATION_SUPABASE_SERVICE_KEY  local secret/service key (fixture setup only)
//
// These tests create and delete users, so they only ever run against a loopback
// instance and are skipped otherwise. Never point them at production.

const url = process.env.INTEGRATION_SUPABASE_URL;
const anonKey = process.env.INTEGRATION_SUPABASE_ANON_KEY;
const serviceKey = process.env.INTEGRATION_SUPABASE_SERVICE_KEY;
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url || '');
if (url && !isLocal) {
  throw new Error(`Refusing to run destructive integration tests against non-local URL: ${url}`);
}
const configured = Boolean(url && anonKey && serviceKey && isLocal);

if (!configured) {
  console.warn(
    '[integration] Skipping profile integration tests: set INTEGRATION_SUPABASE_URL, ' +
      'INTEGRATION_SUPABASE_ANON_KEY and INTEGRATION_SUPABASE_SERVICE_KEY to run them.',
  );
}

const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const PASSWORD = 'local-test-password-123';

let admin;
const createdUserIds = [];

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function serviceClient() {
  if (!admin) {
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

async function createSignedInUser(label, fullName) {
  const supabase = client();
  const email = `profile-${label}-${run}@test.local`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { full_name: fullName } },
  });
  expect(error, `sign up ${label}`).toBeNull();
  expect(data.session, 'signup returns a session (confirmations disabled)').toBeTruthy();
  createdUserIds.push(data.user.id);
  return { supabase, user: data.user, email };
}

afterAll(async () => {
  const service = serviceClient();
  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id);
  }
});

describe.skipIf(!configured)('Profile bootstrap and repair (local Supabase)', () => {
  it('creates a profile with the auth user id and the consumer role on signup', async () => {
    const { supabase, user, email } = await createSignedInUser('bootstrap', 'Bootstrap User');

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, active_role, is_admin')
      .eq('id', user.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(profile).not.toBeNull();
    expect(profile.id).toBe(user.id);
    expect(profile.active_role).toBe('consumer');
    expect(profile.is_admin).toBe(false);
    expect(profile.full_name).toBe('Bootstrap User');

    // The auth account and the profile are two rows, never more.
    const { data: rows, error: countError } = await serviceClient()
      .from('profiles')
      .select('id')
      .eq('id', user.id);
    expect(countError).toBeNull();
    expect(rows).toHaveLength(1);

    // Sanity: the profile is keyed by the auth id, not the email.
    expect(profile.id).not.toBe(email);
  });

  it('repairs a profile that is genuinely missing', async () => {
    const { supabase, user } = await createSignedInUser('repair', 'Repair User');

    // Simulate an account created while the signup trigger was absent.
    const { error: deleteError } = await serviceClient()
      .from('profiles')
      .delete()
      .eq('id', user.id);
    expect(deleteError).toBeNull();

    const missing = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
    expect(missing.data).toBeNull();

    const { data: repaired, error: rpcError } = await supabase.rpc('ensure_own_profile');
    expect(rpcError).toBeNull();
    expect(repaired.id).toBe(user.id);
    expect(repaired.active_role).toBe('consumer');

    const after = await supabase.from('profiles').select('id, active_role').eq('id', user.id).maybeSingle();
    expect(after.data.id).toBe(user.id);
    expect(after.data.active_role).toBe('consumer');
  });

  it('is idempotent and preserves an existing profile and its role', async () => {
    const { supabase, user } = await createSignedInUser('idempotent', 'Idempotent User');

    const { error: renameError } = await supabase
      .from('profiles')
      .update({ full_name: 'Renamed By Owner' })
      .eq('id', user.id);
    expect(renameError).toBeNull();

    const { data: first, error: firstError } = await supabase.rpc('ensure_own_profile');
    expect(firstError).toBeNull();
    expect(first.full_name).toBe('Renamed By Owner');

    const { data: second, error: secondError } = await supabase.rpc('ensure_own_profile');
    expect(secondError).toBeNull();
    expect(second.full_name).toBe('Renamed By Owner');
    expect(second.active_role).toBe('consumer');

    const { data: rows } = await serviceClient().from('profiles').select('id').eq('id', user.id);
    expect(rows).toHaveLength(1);
  });

  it('refuses the repair call without an authenticated caller', async () => {
    const anon = client();
    const { data, error } = await anon.rpc('ensure_own_profile');
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('does not let a user read another user\'s profile', async () => {
    const { supabase } = await createSignedInUser('reader', 'Reader');
    const other = await createSignedInUser('hidden', 'Hidden User');

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', other.user.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('does not let a user assign themselves a role or the admin flag', async () => {
    const { supabase, user } = await createSignedInUser('escalate', 'Escalate');

    const roleAttempt = await supabase
      .from('profiles')
      .update({ active_role: 'aggregator' })
      .eq('id', user.id);
    expect(roleAttempt.error, 'role change is rejected').not.toBeNull();

    const adminAttempt = await supabase
      .from('profiles')
      .update({ is_admin: true })
      .eq('id', user.id);
    expect(adminAttempt.error, 'admin flag change is rejected').not.toBeNull();

    const { data: profile } = await supabase
      .from('profiles')
      .select('active_role, is_admin')
      .eq('id', user.id)
      .maybeSingle();
    expect(profile.active_role).toBe('consumer');
    expect(profile.is_admin).toBe(false);
  });
});
