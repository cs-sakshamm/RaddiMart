import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { AUTH_STATUS, AuthContext, INITIAL_AUTH_STATE } from '../lib/authState';

// One source of truth for the signed-in state.
//
// Before this existed every guard read `getSession()` once on mount and never
// listened for changes, so a token refresh, a sign-out in another tab or an
// expired session left the UI showing stale state.
export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() =>
    getSupabaseClient()
      ? INITIAL_AUTH_STATE
      : // Without configuration there is no provider to ask: report signed out
        // instead of leaving the app stuck in "initializing" forever.
        { status: AUTH_STATUS.unauthenticated, session: null },
  );

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    let active = true;

    const apply = (session) => {
      if (!active) return;
      setAuth({
        status: session ? AUTH_STATUS.authenticated : AUTH_STATUS.unauthenticated,
        session: session ?? null,
      });
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data?.session))
      .catch(() => apply(null));

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });

    return () => {
      active = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      status: auth.status,
      session: auth.session,
      user: auth.session?.user ?? null,
    }),
    [auth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
