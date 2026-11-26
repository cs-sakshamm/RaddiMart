import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import AuthLayout from './AuthLayout';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  // Wait for Supabase to process the recovery token in the URL and establish a
  // session. We must NOT redirect away here: doing so used to cancel the
  // password-recovery flow before the user could set a new password.
  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    if (!supabase) {
      Promise.resolve().then(() => {
        if (!active) return;
        setError('Supabase is not configured.');
        setChecking(false);
      });
      return () => {
        active = false;
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session) {
        setSessionReady(true);
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) setSessionReady(true);
      setChecking(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!sessionReady) {
      setError('This password reset link is invalid or has expired. Please request a new one.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError('Password reset failed. The link may have expired. Please request a new one.');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Choose a new password for your account."
    >
      <div aria-label="Reset Password page">
        {success ? (
          <p className="auth-success">
            Your password has been reset. You can now sign in with your new password.
          </p>
        ) : null}
        {error && <p className="auth-error">{error}</p>}
        {!success && !checking && !sessionReady && (
          <p className="auth-error" role="alert">
            This reset link is invalid or has expired. <Link to="/forgot-password">Request a new link</Link>.
          </p>
        )}
        {!success && !checking && sessionReady && (
          <form onSubmit={e => { e.preventDefault(); handleReset(); }} className="auth-form">
            <div className="form-group">
              <label htmlFor="new-password" className="form-label">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="choose a new password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-new-password" className="form-label">
                Confirm New Password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="confirm your new password"
              />
            </div>
            <button type="submit" className="btn btn-primary full-width" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}
        {success && (
          <button
            type="button"
            className="btn btn-primary full-width"
            onClick={() => navigate('/signin')}
          >
            Go to sign in
          </button>
        )}
        </div>
    </AuthLayout>
  );
}