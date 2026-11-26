import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';

/**
 * Displayed when a user navigates to a role dashboard that doesn't match their
 * authenticated role. Provides a clear message and automatic redirect to the
 * correct role dashboard.
 */
export default function AccessDeniedPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // After a short delay, redirect to the user's appropriate dashboard
    const delay = setTimeout(() => {
      navigate('/signin', { replace: true });
    }, 3000);

    return () => clearTimeout(delay);
  }, [location, navigate]);

  return (
    <AuthLayout
      title="Access Denied"
      subtitle="You are not authorized to view this dashboard."
    >
      <p className="auth-error" role="alert">
        You do not have access to the requested dashboard.
      </p>
      <p className="form-notice" role="status">
        You are being redirected to your appropriate dashboard.
      </p>
      <button
        type="button"
        className="btn btn-primary full-width"
        onClick={() => navigate('/signin', { replace: true })}
      >
        Sign in again
      </button>
    </AuthLayout>
  );
}