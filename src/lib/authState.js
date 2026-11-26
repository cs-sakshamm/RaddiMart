import { createContext, useContext } from 'react';

// The whole authentication state model: the stored session has not been read
// yet, a session exists, or there is no session.
export const AUTH_STATUS = {
  initializing: 'initializing',
  authenticated: 'authenticated',
  unauthenticated: 'unauthenticated',
};

export const INITIAL_AUTH_STATE = {
  status: AUTH_STATUS.initializing,
  session: null,
  user: null,
};

export const AuthContext = createContext(INITIAL_AUTH_STATE);

export function useAuth() {
  return useContext(AuthContext);
}
