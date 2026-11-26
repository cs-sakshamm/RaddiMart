import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import AuthLayout from './AuthLayout';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendReset = async (event) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Password recovery is unavailable because the application is not configured.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError('Could not send the reset link right now. Please try again shortly.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Could not send the reset link right now. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your account email and we will send a reset link."
    >
      {sent && (
        <p className="form-notice" role="status">
          If that email is registered, a password reset link has been sent. The link expires
          after a short time, so use it soon.
        </p>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!sent && (
        <form onSubmit={handleSendReset} className="auth-form">
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <button type="submit" className="btn btn-primary full-width" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      {sent && (
        <Link to="/signin" className="btn btn-secondary full-width">Back to sign in</Link>
      )}
      <p className="auth-links">
        <span>Remembered your password?</span>
        <Link to="/signin">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
