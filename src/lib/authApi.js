// Authentication operations, kept free of React so the signup and sign-in
// journeys can be tested deterministically.
//
// Email confirmation is disabled by product decision: signup must return an
// authenticated session immediately, so no verification screen exists.
//
// However, that only holds when the Supabase project also has
// `mailer_autoconfirm: true` (dashboard: Authentication -> Providers -> Email ->
// "Confirm email" off). When the project still requires confirmation, GoTrue
// creates the user but returns `session: null`, and password sign-in fails with
// `email_not_confirmed`. Both cases are reported explicitly here instead of
// being mistaken for a wrong password or a successful signup.

import {
  CONFIRMATION_REQUIRED_SIGNUP_MESSAGE,
  friendlySignInError,
  friendlySignUpError,
} from './authMessages.js';
import { readOwnProfile } from './profileApi.js';

// Safe diagnostics only: the operation, an outcome label and a short error
// code. Never credentials, tokens or full auth URLs.
function logAuthDiagnostic(operation, outcome, code) {
  const isDev = Boolean(import.meta.env && import.meta.env.DEV);
  if (!isDev) return;
  console.warn(`[auth] ${operation} -> ${outcome}${code ? ` (${code})` : ''}`);
}

export function signInRedirectUrl() {
  return `${window.location.origin}/signin`;
}

// Reads the role used to choose a dashboard. The read goes through the same
// helper as the dashboard, so a profile that is genuinely missing is repaired
// once instead of silently becoming a null role.
export async function fetchActiveRole(supabase, userId) {
  if (!supabase || !userId) return { role: null, error: 'No active session.' };
  const { profile, error } = await readOwnProfile(supabase, userId);
  if (error) {
    return { role: null, error: error.message || 'Could not load your account role.' };
  }
  return { role: profile?.active_role || null, error: null };
}

export async function signUpWithEmail(
  supabase,
  { email, password, fullName, phone, redirectTo },
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo || signInRedirectUrl(),
      data: {
        full_name: fullName,
        phone: phone || null,
      },
    },
  });

  if (error) {
    logAuthDiagnostic('signup', 'error', error.code || error.error_code);
    const friendly = friendlySignUpError(error);
    return { status: 'error', message: friendly.message, email };
  }

  // Email confirmation disabled: a session is always returned on signup.
  if (data?.session) {
    return { status: 'signed_in', session: data.session };
  }

  if (data?.user) {
    // GoTrue returns an existing-account signup with an empty identities array
    // (and no session) rather than an error, so it must not be reported as a
    // confirmation problem.
    const identities = data.user.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      logAuthDiagnostic('signup', 'existing_account');
      return {
        status: 'existing_account',
        message: friendlySignUpError({ code: 'user_already_exists' }).message,
        email,
      };
    }

    // A user was created but no session came back: the project still requires
    // email confirmation. Never fake a session; report the real cause.
    logAuthDiagnostic('signup', 'confirmation_required', 'mailer_autoconfirm=false');
    return {
      status: 'confirmation_required',
      message: CONFIRMATION_REQUIRED_SIGNUP_MESSAGE,
      email,
    };
  }

  logAuthDiagnostic('signup', 'no_user');
  return {
    status: 'error',
    message: 'Could not create the account. Please try again.',
    email,
  };
}

export async function signInWithEmail(supabase, { email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logAuthDiagnostic('signin', 'error', error.code || error.error_code);
    const friendly = friendlySignInError(error);
    return { status: friendly.kind, message: friendly.message };
  }
  if (!data?.session) {
    logAuthDiagnostic('signin', 'no_session');
    return {
      status: 'unknown',
      message: 'Could not start a session. Please try signing in again.',
    };
  }
  return { status: 'signed_in', session: data.session };
}
