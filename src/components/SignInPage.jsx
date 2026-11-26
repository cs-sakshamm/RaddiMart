import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { fetchActiveRole, signInWithEmail } from '../lib/authApi';
import {
  hasErrors,
  normalizeEmail,
  safeRedirectTarget,
  validateSignIn,
} from '../lib/authValidation';
import AuthLayout from './AuthLayout';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const notice = location.state?.notice;
  // Set by ProtectedRoute when a signed-out visitor was sent here. Only an
  // in-app path is accepted; anything else falls back to the dashboard.
  const redirectTo = safeRedirectTarget(location.state?.from);

  const clearFieldError = (field) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSignIn = async (event) => {
    event.preventDefault();
    // A second click while the first request is in flight must not log in twice.
    if (submitting.current) return;

    const errors = validateSignIn({ email, password });
    if (hasErrors(errors)) {
      setFieldErrors(errors);
      setError(null);
      return;
    }
    setFieldErrors({});

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError({
        kind: 'config',
        message: 'Sign in is unavailable because the application is not configured.',
      });
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithEmail(supabase, {
        email: normalizeEmail(email),
        password,
      });

      if (result.status !== 'signed_in') {
        setError({ kind: result.status, message: result.message });
        return;
      }

      if (redirectTo) {
        navigate(redirectTo, { replace: true });
        return;
      }

      const { role } = await fetchActiveRole(supabase, result.session.user.id);
      navigate(role ? `/dashboard/${role}` : '/dashboard/consumer', { replace: true });
    } catch {
      setError({
        kind: 'unexpected',
        message: 'Something went wrong while signing in. Please try again.',
      });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Continue to your listings, pickups and material records."
    >
      {notice && !error && (
        <p className="form-notice" role="status">{notice}</p>
      )}
      {error && (
        <p className="auth-error" role="alert">{error.message}</p>
      )}

      <form onSubmit={handleSignIn} className="auth-form" noValidate>
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email</label>
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
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          />
          {fieldErrors.email && (
            <p className="hint hint-error" id="email-error">{fieldErrors.email}</p>
          )}
        </div>
        <div className="form-group">
          <div className="form-label-row">
            <label htmlFor="password" className="form-label">Password</label>
            <Link to="/forgot-password" className="form-label-link">Forgot password?</Link>
          </div>
          <div className="form-control">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError('password');
              }}
              required
              autoComplete="current-password"
              placeholder="Your password"
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            />
            <button
              type="button"
              className="toggle-password-btn"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="hint hint-error" id="password-error">{fieldErrors.password}</p>
          )}
        </div>
        <button type="submit" className="btn btn-primary full-width" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="auth-links">
        <span>New to RADDIMART?</span>
        <Link to="/signup">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
