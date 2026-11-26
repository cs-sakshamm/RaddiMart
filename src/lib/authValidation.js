// Pure validation for the sign-up and sign-in forms, kept free of React so the
// rules can be unit tested. Supabase remains the authority on password strength:
// these checks only reject input that is certainly invalid before a request is
// made (empty values, an obviously malformed email, a short or mismatched
// password).

export const MIN_PASSWORD_LENGTH = 8;

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return 'Enter your email address.';
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address, for example you@example.com.';
  }
  return '';
}

export function validateSignIn({ email, password } = {}) {
  const errors = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (!String(password ?? '')) errors.password = 'Enter your password.';
  return errors;
}

export function validateSignUp({
  fullName,
  email,
  password,
  confirmPassword,
  termsAccepted,
} = {}) {
  const errors = {};

  if (!String(fullName ?? '').trim()) errors.fullName = 'Enter your full name.';

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;

  const secret = String(password ?? '');
  if (!secret) {
    errors.password = 'Choose a password.';
  } else if (secret.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }

  if (!String(confirmPassword ?? '')) {
    errors.confirmPassword = 'Repeat your password.';
  } else if (secret !== confirmPassword) {
    errors.confirmPassword = 'The passwords do not match.';
  }

  if (!termsAccepted) errors.terms = 'Accept the terms of service to continue.';

  return errors;
}

export function hasErrors(errors) {
  return Boolean(errors) && Object.keys(errors).length > 0;
}

// Only an in-app path is accepted after sign-in. Absolute URLs, protocol
// relative URLs ("//evil.example") and their escaped variants are rejected so
// the redirect cannot be turned into an open redirect.
export function safeRedirectTarget(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const target = value.trim();
  if (!target.startsWith('/')) return fallback;
  if (target.startsWith('//')) return fallback;
  if (target.includes('\\')) return fallback;
  return target;
}
