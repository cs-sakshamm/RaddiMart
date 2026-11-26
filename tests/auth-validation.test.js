import { describe, it, expect, vi } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  hasErrors,
  normalizeEmail,
  safeRedirectTarget,
  validateEmail,
  validateSignIn,
  validateSignUp,
} from '../src/lib/authValidation.js';
import { fetchActiveRole } from '../src/lib/authApi.js';
import { friendlySignInError, friendlySignUpError } from '../src/lib/authMessages.js';

const VALID_SIGNUP = {
  fullName: 'New User',
  email: 'new@example.com',
  password: 'long-enough-password',
  confirmPassword: 'long-enough-password',
  termsAccepted: true,
};

describe('email validation', () => {
  it('rejects empty and malformed addresses', () => {
    expect(validateEmail('')).toMatch(/enter your email/i);
    expect(validateEmail('   ')).toMatch(/enter your email/i);
    expect(validateEmail('not-an-email')).toMatch(/valid email/i);
    expect(validateEmail('missing@domain')).toMatch(/valid email/i);
    expect(validateEmail('spaces in@example.com')).toMatch(/valid email/i);
  });

  it('accepts a normal address and normalises case and padding', () => {
    expect(validateEmail('  User@Example.COM ')).toBe('');
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });
});

describe('sign-up validation', () => {
  it('accepts a complete form', () => {
    expect(validateSignUp(VALID_SIGNUP)).toEqual({});
    expect(hasErrors(validateSignUp(VALID_SIGNUP))).toBe(false);
  });

  it('rejects every missing required field', () => {
    const errors = validateSignUp({
      fullName: '   ',
      email: '',
      password: '',
      confirmPassword: '',
      termsAccepted: false,
    });
    expect(errors.fullName).toMatch(/full name/i);
    expect(errors.email).toMatch(/enter your email/i);
    expect(errors.password).toMatch(/choose a password/i);
    expect(errors.confirmPassword).toMatch(/repeat your password/i);
    expect(errors.terms).toMatch(/terms of service/i);
  });

  it('rejects a short password', () => {
    const errors = validateSignUp({
      ...VALID_SIGNUP,
      password: 'short',
      confirmPassword: 'short',
    });
    expect(errors.password).toContain(String(MIN_PASSWORD_LENGTH));
    expect(errors.confirmPassword).toBeUndefined();
  });

  it('rejects a password confirmation mismatch', () => {
    const errors = validateSignUp({ ...VALID_SIGNUP, confirmPassword: 'different-password' });
    expect(errors.confirmPassword).toMatch(/do not match/i);
  });

  it('rejects an invalid email without touching the password rule', () => {
    const errors = validateSignUp({ ...VALID_SIGNUP, email: 'nope' });
    expect(errors.email).toMatch(/valid email/i);
    expect(errors.password).toBeUndefined();
  });

  it('requires the terms checkbox', () => {
    const errors = validateSignUp({ ...VALID_SIGNUP, termsAccepted: false });
    expect(Object.keys(errors)).toEqual(['terms']);
  });
});

describe('sign-in validation', () => {
  it('accepts complete credentials', () => {
    expect(validateSignIn({ email: 'user@example.com', password: 'secret' })).toEqual({});
  });

  it('rejects empty fields before any network call', () => {
    const errors = validateSignIn({ email: '', password: '' });
    expect(errors.email).toMatch(/enter your email/i);
    expect(errors.password).toMatch(/enter your password/i);
  });

  it('rejects a malformed email and accepts a password with spaces', () => {
    expect(validateSignIn({ email: 'user@', password: 'x' }).email).toMatch(/valid email/i);
    expect(validateSignIn({ email: 'user@example.com', password: ' has space ' })).toEqual({});
  });
});

describe('post sign-in redirect safety', () => {
  it('accepts in-app paths', () => {
    expect(safeRedirectTarget('/profile')).toBe('/profile');
    expect(safeRedirectTarget('/listing/abc?tab=details')).toBe('/listing/abc?tab=details');
  });

  it('rejects absolute, protocol-relative and escaped destinations', () => {
    expect(safeRedirectTarget('https://evil.example/steal')).toBe('');
    expect(safeRedirectTarget('//evil.example')).toBe('');
    expect(safeRedirectTarget('/\\evil.example')).toBe('');
    expect(safeRedirectTarget('javascript:alert(1)')).toBe('');
    expect(safeRedirectTarget(undefined)).toBe('');
  });

  it('uses the fallback when the destination is not an in-app path', () => {
    expect(safeRedirectTarget('https://evil.example', '/signin')).toBe('/signin');
  });
});

describe('network failures', () => {
  // supabase-js reports a failed fetch as AuthRetryableFetchError. Its message is
  // browser specific (WebKit says "Load failed"), so it must be classified by
  // name/status rather than by text.
  const retryable = { name: 'AuthRetryableFetchError', message: 'Load failed', status: 0, code: '' };

  it('classifies a WebKit fetch failure as a network problem on sign in', () => {
    const result = friendlySignInError(retryable);
    expect(result.kind).toBe('network');
    expect(result.message).toMatch(/could not reach the sign-in service/i);
  });

  it('classifies the same failure on sign up', () => {
    const result = friendlySignUpError(retryable);
    expect(result.kind).toBe('network');
    expect(result.message).toMatch(/could not reach the registration service/i);
  });

  it('does not call a 5xx answer a connectivity problem', () => {
    const serverError = { name: 'AuthRetryableFetchError', message: 'boom', status: 500 };
    expect(friendlySignInError(serverError).kind).toBe('server_error');
    expect(friendlySignUpError(serverError).message).toMatch(/temporarily unavailable/i);
  });
});

describe('fetchActiveRole', () => {
  function supabaseReturning(result, rpc = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    return {
      from: vi.fn().mockReturnValue({ select }),
      rpc: vi.fn().mockResolvedValue(rpc),
    };
  }

  it('returns the stored active role', async () => {
    const supabase = supabaseReturning({ data: { active_role: 'collector' }, error: null });
    await expect(fetchActiveRole(supabase, 'user-1')).resolves.toEqual({
      role: 'collector',
      error: null,
    });
  });

  it('reports an undeployed repair function when the profile is missing instead of throwing', async () => {
    const supabase = supabaseReturning({ data: null, error: null });
    const result = await fetchActiveRole(supabase, 'user-1');
    expect(result.role).toBeNull();
    expect(result.error).toMatch(/not available yet/i);
  });

  it('reports a readable profile when the missing row is repaired', async () => {
    const supabase = supabaseReturning(
      { data: null, error: null },
      { data: { id: 'user-1', active_role: 'collector' }, error: null },
    );
    await expect(fetchActiveRole(supabase, 'user-1')).resolves.toEqual({
      role: 'collector',
      error: null,
    });
  });

  it('reports a profile read failure without leaking provider text', async () => {
    const supabase = supabaseReturning({ data: null, error: { code: '42501', message: 'permission denied for table profiles' } });
    const result = await fetchActiveRole(supabase, 'user-1');
    expect(result.role).toBeNull();
    expect(result.error).toMatch(/not accessible/i);
    expect(result.error).not.toMatch(/permission denied/);
  });

  it('never queries without a session', async () => {
    const supabase = supabaseReturning({ data: null, error: null });
    const result = await fetchActiveRole(supabase, undefined);
    expect(result.role).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
