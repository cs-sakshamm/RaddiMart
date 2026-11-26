import { Navigate, useLocation } from 'react-router-dom';
import { AUTH_STATUS, useAuth } from '../lib/authState';

// The single guard for every signed-in screen.
//
// It never renders protected content while the stored session is still being
// read, so a refresh can no longer flash a page or bounce a signed-in user to
// the sign-in form. It also never redirects a signed-in user away from the page
// they asked for: the only redirect it performs is an unauthenticated visitor
// to /signin, remembering where they were headed.
export default function ProtectedRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === AUTH_STATUS.initializing) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        Checking your session…
      </div>
    );
  }

  if (status !== AUTH_STATUS.authenticated) {
    return (
      <Navigate
        to="/signin"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children;
}
