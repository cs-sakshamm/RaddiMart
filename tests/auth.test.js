import { describe, it, expect, vi } from 'vitest';
import {
  signInRedirectUrl,
  signInWithEmail,
  signUpWithEmail,
} from '../src/lib/authApi.js';
import {
  CONFIRMATION_REQUIRED_SIGNIN_MESSAGE,
  CONFIRMATION_REQUIRED_SIGNUP_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  friendlySignInError,
  friendlySignUpError,
} from '../src/lib/authMessages.js';

const SESSION = { access_token: 'token', user: { id: 'user-1' } };

function supabaseStub(overrides = {}) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' }, session: SESSION }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
      resend: vi.fn().mockResolvedValue({ data: {}, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
      ...overrides,
    },
  };
}

describe('signup', () => {
  it('creates a session on signup when confirmations are disabled', async () => {
    const supabase = supabaseStub();
    const result = await signUpWithEmail(supabase, {
      email: 'new@example.com',
      password: 'long-enough-password',
      fullName: 'New User',
      phone: '',
    });

    // Email confirmation is disabled, so signup returns a session immediately.
    expect(result.status).toBe('signed_in');
    expect(result.session).toBe(SESSION);
    expect(supabase.auth.signUp).toHaveBeenCalledTimes(1);

    const call = supabase.auth.signUp.mock.calls[0][0];
    expect(call.email).toBe('new@example.com');
    expect(call.options.data).toEqual({ full_name: 'New User', phone: null });
  });

  it('returns a session when the project does not require confirmation', async () => {
    const supabase = supabaseStub({
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'u' }, session: SESSION }, error: null }),
    });
    const result = await signUpWithEmail(supabase, {
      email: 'ready@example.com',
      password: 'long-enough-password',
      fullName: 'Ready User',
    });
    expect(result.status).toBe('signed_in');
    expect(result.session).toBe(SESSION);
  });

  it('treats an existing-account error neutrally', async () => {
    const supabase = supabaseStub({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { code: 'user_already_exists', message: 'User already registered' },
      }),
    });
    const result = await signUpWithEmail(supabase, {
      email: 'existing@example.com',
      password: 'long-enough-password',
      fullName: 'Existing User',
    });
    expect(result.status).toBe('error');
    expect(result.message).not.toMatch(/already registered/i);
  });

  it('reports a friendly error for an unknown signup failure', async () => {
    const supabase = supabaseStub({
      signUp: vi.fn().mockResolvedValue({
        data: {},
        error: { code: 'unexpected_failure', message: 'boom' },
      }),
    });
    const result = await signUpWithEmail(supabase, {
      email: 'x@example.com',
      password: 'long-enough-password',
    });
    expect(result.status).toBe('error');
    expect(result.message).toBe('Could not create the account. Please try again.');
  });
});

describe('sign in', () => {
  it('signs in with valid credentials', async () => {
    const supabase = supabaseStub();
    const result = await signInWithEmail(supabase, { email: 'a@b.com', password: 'secret123' });
    expect(result.status).toBe('signed_in');
    expect(result.session).toBe(SESSION);
  });

  it('does not reveal whether the email or the password was wrong', async () => {
    const supabase = supabaseStub({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
      }),
    });
    const result = await signInWithEmail(supabase, { email: 'nobody@example.com', password: 'x' });
    expect(result.status).toBe('invalid_credentials');
    expect(result.message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('returns the session for verified credentials', async () => {
    const supabase = supabaseStub();
    const result = await signInWithEmail(supabase, { email: 'a@b.com', password: 'secret123' });
    expect(result.status).toBe('signed_in');
    expect(result.session).toBe(SESSION);
  });

  it('maps rate limits to a retry message', () => {
    const result = friendlySignInError({ code: 'over_request_rate_limit' });
    expect(result.kind).toBe('rate_limited');
    expect(result.message).toMatch(/wait a few minutes/i);
  });

  it('never echoes raw provider text for an unknown failure', () => {
    const result = friendlySignInError({ code: 'weird', message: 'internal stack trace' });
    expect(result.message).not.toMatch(/internal stack trace/);
  });
});

describe('signup error messages', () => {
  it('does not confirm account existence in the existing-account message', () => {
    const result = friendlySignUpError({ code: 'email_exists' });
    expect(result.kind).toBe('existing_account');
    expect(result.message).not.toMatch(/is registered|already has an account with/i);
  });

  it('builds the sign-in redirect from the current origin', () => {
    expect(signInRedirectUrl()).toBe(`${window.location.origin}/signin`);
    expect(signInRedirectUrl()).not.toMatch(/verify-email/);
  });
});

// Regression: "Account created but session could not be established." This is
// what a project with `mailer_autoconfirm: false` returns, even though the app
// has removed email verification. The failure must be named, not guessed at.
describe('signup while the project still requires email confirmation', () => {
  it('reports the confirmation mismatch instead of a fake success', async () => {
    const supabase = supabaseStub({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', identities: [{ id: 'identity-1' }] }, session: null },
        error: null,
      }),
    });

    const result = await signUpWithEmail(supabase, {
      email: 'new@example.com',
      password: 'long-enough-password',
      fullName: 'New User',
    });

    expect(result.status).toBe('confirmation_required');
    expect(result.session).toBeUndefined();
    expect(result.message).toBe(CONFIRMATION_REQUIRED_SIGNUP_MESSAGE);
    expect(result.message).toMatch(/email confirmation/i);
    // The old screenshot copy must not come back.
    expect(result.message).not.toBe(
      'Account created but session could not be established. Please try signing in.',
    );
    // A missing session must never be reported as an authenticated signup.
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('does not mistake an existing account for a confirmation problem', async () => {
    const supabase = supabaseStub({
      signUp: vi.fn().mockResolvedValue({
        // GoTrue returns an empty identities array for an address that is
        // already registered when confirmations are enabled.
        data: { user: { id: 'user-1', identities: [] }, session: null },
        error: null,
      }),
    });

    const result = await signUpWithEmail(supabase, {
      email: 'existing@example.com',
      password: 'long-enough-password',
    });

    expect(result.status).toBe('existing_account');
    expect(result.message).not.toMatch(/already registered/i);
  });

  it('reports a generic error when no user and no session are returned', async () => {
    const supabase = supabaseStub({
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    });

    const result = await signUpWithEmail(supabase, {
      email: 'x@example.com',
      password: 'long-enough-password',
    });

    expect(result.status).toBe('error');
    expect(result.message).toBe('Could not create the account. Please try again.');
  });
});

// Regression: "Could not sign you in. Please try again." for an account that
// exists but is unconfirmed. That is a configuration block, not bad credentials.
describe('sign in with an unconfirmed account', () => {
  it('reports the confirmation block instead of the generic error', async () => {
    const supabase = supabaseStub({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
      }),
    });

    const result = await signInWithEmail(supabase, {
      email: 'new@example.com',
      password: 'long-enough-password',
    });

    expect(result.status).toBe('email_unconfirmed');
    expect(result.message).toBe(CONFIRMATION_REQUIRED_SIGNIN_MESSAGE);
    expect(result.message).not.toBe('Could not sign you in. Please try again.');
    // Must not be reported as a wrong password.
    expect(result.message).not.toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('classifies the block from the message when no code is present', () => {
    const result = friendlySignInError({ message: 'Email not confirmed' });
    expect(result.kind).toBe('email_unconfirmed');
  });
});
