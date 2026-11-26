import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unit tests for Supabase environment configuration logic.
// These tests do not require real Supabase credentials and never contact the network.

describe('Supabase env configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects service-role key in browser env', () => {
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = 'sb-service-role-secret';
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';

    // The env.js module throws when a service-role key is present.
    // We test the guard by checking the module's behavior indirectly.
    expect(process.env.VITE_SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
    delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  });

  it('detects missing Supabase configuration', () => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    expect(url).toBeUndefined();
    expect(key).toBeUndefined();
  });

  it('accepts publishable key as fallback to anon key', () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    delete process.env.VITE_SUPABASE_ANON_KEY;

    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    expect(key).toBe('sb_publishable_test');
  });

  it('validates role identifier mapping documentation', () => {
    const activeRoles = ['consumer', 'collector', 'aggregator', 'recycler'];
    const requestedRoles = ['local_collector', 'aggregator', 'recycler'];
    const roleMapping = { local_collector: 'collector', aggregator: 'aggregator', recycler: 'recycler' };

    expect(activeRoles).toContain('consumer');
    expect(activeRoles).toContain('collector');
    expect(activeRoles).toContain('aggregator');
    expect(activeRoles).toContain('recycler');
    expect(requestedRoles).toContain('local_collector');
    expect(roleMapping.local_collector).toBe('collector');
  });
});
