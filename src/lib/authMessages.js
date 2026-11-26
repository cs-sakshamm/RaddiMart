// User-facing authentication messages.
//
// Supabase/GoTrue error text is not shown directly: it is inconsistent between
// versions and can be more specific than a public sign-in form should be. These
// helpers classify the documented error codes and return one clear sentence.
// Email verification has been disabled; all messages reflect the new flow.

function codeOf(error) {
  return String(error?.code || error?.error_code || '').toLowerCase();
}

function messageOf(error) {
  return String(error?.message || error?.msg || '').toLowerCase();
}

function isExistingAccountError(error) {
  const code = codeOf(error);
  const message = messageOf(error);
  return (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    message.includes('already registered') ||
    message.includes('already exists')
  );
}

function isRateLimitError(error) {
  const code = codeOf(error);
  const message = messageOf(error);
  return (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

// The project still requires confirmation (`mailer_autoconfirm: false` on the
// Supabase project). Signup then creates a user but withholds the session, and
// password sign-in is rejected. Both are surfaced explicitly instead of being
// collapsed into a generic failure.
function isEmailNotConfirmedError(error) {
  const code = codeOf(error);
  return (
    code === 'email_not_confirmed' ||
    code === 'email_not_verified' ||
    messageOf(error).includes('email not confirmed') ||
    messageOf(error).includes('not confirmed')
  );
}

function statusOf(error) {
  const status = Number(error?.status);
  return Number.isFinite(status) ? status : null;
}

// supabase-js wraps a failed fetch in an AuthRetryableFetchError. Its message
// differs per browser ("Failed to fetch", "Load failed", …), so the stable
// signal is the error name and the status, not the text. A retryable error that
// carries a 5xx status means the service answered and failed, which is a server
// problem rather than a connectivity one.
function isNetworkError(error) {
  const status = statusOf(error);
  const isRetryable = String(error?.name || '') === 'AuthRetryableFetchError';
  if (isRetryable) return status === null || status === 0;
  return (
    status === 0 ||
    error instanceof TypeError ||
    messageOf(error).includes('failed to fetch') ||
    messageOf(error).includes('load failed') ||
    messageOf(error).includes('network')
  );
}

function isServerError(error) {
  const status = statusOf(error);
  return status !== null && status >= 500;
}

// A single message for both a wrong email and a wrong password: the sign-in
// form must not reveal whether an address has an account.
export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.';

// Shown when the backend withheld a session on signup. This is a configuration
// mismatch, not a user mistake, so the message names the real cause and the
// action that clears it rather than asking the user to retry blindly.
export const CONFIRMATION_REQUIRED_SIGNUP_MESSAGE =
  'Your account was created, but the authentication service still requires email confirmation, so no session could be started. Email confirmation is disabled in RADDIMART, so an administrator must turn off "Confirm email" in the Supabase project before this account can sign in.';

export const CONFIRMATION_REQUIRED_SIGNIN_MESSAGE =
  'This account is blocked by an email confirmation requirement that RADDIMART does not use. An administrator must turn off "Confirm email" in the Supabase project, then sign in again.';

export function friendlySignInError(error) {
  const code = codeOf(error);
  // Checked before invalid_credentials: an unconfirmed account is a different
  // failure and must not be reported as a wrong password.
  if (isEmailNotConfirmedError(error)) {
    return { kind: 'email_unconfirmed', message: CONFIRMATION_REQUIRED_SIGNIN_MESSAGE };
  }
  if (
    code === 'invalid_credentials' ||
    code === 'invalid_grant' ||
    messageOf(error).includes('invalid login credentials')
  ) {
    return { kind: 'invalid_credentials', message: INVALID_CREDENTIALS_MESSAGE };
  }
  if (isRateLimitError(error)) {
    return {
      kind: 'rate_limited',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    };
  }
  if (isNetworkError(error)) {
    return {
      kind: 'network',
      message: 'Could not reach the sign-in service. Check your connection and try again.',
    };
  }
  if (isServerError(error)) {
    return {
      kind: 'server_error',
      message: 'The sign-in service is temporarily unavailable. Please try again shortly.',
    };
  }
  return { kind: 'unknown', message: 'Could not sign you in. Please try again.' };
}

export function friendlySignUpError(error) {
  if (isExistingAccountError(error)) {
    // Neutral wording: it does not confirm that the address is registered.
    return {
      kind: 'existing_account',
      message:
        'If this email already has an account, please sign in with your credentials.',
    };
  }
  if (isRateLimitError(error)) {
    return {
      kind: 'rate_limited',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    };
  }
  const code = codeOf(error);
  if (code === 'weak_password') {
    return {
      kind: 'weak_password',
      message: 'Choose a stronger password with at least 8 characters.',
    };
  }
  if (code === 'email_address_invalid' || messageOf(error).includes('invalid email')) {
    return { kind: 'invalid_email', message: 'Enter a valid email address.' };
  }
  if (isNetworkError(error)) {
    return {
      kind: 'network',
      message: 'Could not reach the registration service. Check your connection and try again.',
    };
  }
  if (isServerError(error)) {
    return {
      kind: 'server_error',
      message: 'The registration service is temporarily unavailable. Please try again shortly.',
    };
  }
  return {
    kind: 'unknown',
    message: 'Could not create the account. Please try again.',
  };
}
