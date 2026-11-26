import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { fetchActiveRole, signUpWithEmail } from '../lib/authApi';
import {
  MIN_PASSWORD_LENGTH,
  hasErrors,
  normalizeEmail,
  validateSignUp,
} from '../lib/authValidation';
import AuthLayout from './AuthLayout';

export default function SignUpPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const navigate = useNavigate();

  const clearFieldError = (field) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSignUp = async (event) => {
    event.preventDefault();
    // Guard against a double click firing two registration requests.
    if (submitting.current) return;

    const errors = validateSignUp({
      fullName,
      email,
      password,
      confirmPassword,
      termsAccepted,
    });
    if (hasErrors(errors)) {
      setFieldErrors(errors);
      setError('');
      return;
    }
    setFieldErrors({});

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Registration is unavailable because the application is not configured.');
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await signUpWithEmail(supabase, {
        email: normalizeEmail(email),
        password,
        fullName: fullName.trim(),
        phone: phone.trim(),
      });

      // Email confirmation is disabled for this project, so a successful
      // registration always returns a session. Anything else is reported with
      // its real cause instead of a generic failure or a fake success.
      if (result.status !== 'signed_in') {
        setError(
          result.message ||
            'Something went wrong while creating the account. Please try again.',
        );
        return;
      }

      // A session exists: open the dashboard that matches the stored role. The
      // profile row is created by the handle_new_user() trigger as part of the
      // same auth.users insert, so it is already readable here.
      const { role } = await fetchActiveRole(supabase, result.session.user.id);
      navigate(`/dashboard/${role || 'consumer'}`, { replace: true });
    } catch {
      setError('Something went wrong while creating the account. Please try again.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="List scrap, request a pickup, or join as a collector, aggregator or recycler."
    >
      {error && <p className="auth-error" role="alert">{error}</p>}
      <form onSubmit={handleSignUp} className="auth-form" noValidate>
        <div className="form-group">
          <label htmlFor="fullname">Full name</label>
          <input
            id="fullname"
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              clearFieldError('fullName');
            }}
            required
            autoComplete="name"
            placeholder="Your full name"
            aria-invalid={fieldErrors.fullName ? 'true' : undefined}
            aria-describedby={fieldErrors.fullName ? 'fullname-error' : undefined}
          />
          {fieldErrors.fullName && (
            <p className="hint hint-error" id="fullname-error">{fieldErrors.fullName}</p>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError('email');
            }}
            required
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={fieldErrors.email ? 'true' : undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : 'email-hint'}
          />
          {fieldErrors.email ? (
            <p className="hint hint-error" id="email-error">{fieldErrors.email}</p>
          ) : (
            <p className="hint" id="email-hint">A confirmation email will not be sent.</p>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="phone">Phone number (optional)</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            placeholder="Your phone number"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearFieldError('password');
              clearFieldError('confirmPassword');
            }}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            aria-invalid={fieldErrors.password ? 'true' : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          />
          {fieldErrors.password && (
            <p className="hint hint-error" id="password-error">{fieldErrors.password}</p>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              clearFieldError('confirmPassword');
            }}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            placeholder="Repeat your password"
            aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
            aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
          />
          {fieldErrors.confirmPassword ? (
            <p className="hint hint-error" id="confirm-password-error">
              {fieldErrors.confirmPassword}
            </p>
          ) : (
            confirmPassword && password !== confirmPassword && (
              <p className="hint hint-error">The passwords do not match yet.</p>
            )
          )}
        </div>
        <div className="form-group form-check">
          <input
            type="checkbox"
            id="terms"
            checked={termsAccepted}
            onChange={(event) => {
              setTermsAccepted(event.target.checked);
              clearFieldError('terms');
            }}
            required
            aria-invalid={fieldErrors.terms ? 'true' : undefined}
            aria-describedby={fieldErrors.terms ? 'terms-error' : undefined}
          />
          <label htmlFor="terms">I accept the RADDIMART terms of service.</label>
        </div>
        {fieldErrors.terms && (
          <p className="hint hint-error" id="terms-error">{fieldErrors.terms}</p>
        )}
        <button type="submit" className="btn btn-primary full-width" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="auth-links">
        <span>Already have an account?</span>
        <Link to="/signin">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
