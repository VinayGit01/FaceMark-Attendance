import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('fm_token')) return setLoading(false);
    refresh()
      .catch(() => localStorage.removeItem('fm_token'))
      .finally(() => setLoading(false));
  }, [refresh]);

  // Called once the whole sign-in is finished (password + face)
  const startSession = (data) => {
    localStorage.setItem('fm_token', data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('fm_token');
    setUser(null);
  };

  // can('people.manage') is true for any scope of that permission; can('users.manage') for the exact one
  const can = (key) => (user?.permissions || []).some((p) => p === key || p.startsWith(`${key}.`));
  const canAny = (...keys) => keys.some(can);

  return <AuthContext.Provider value={{ user, loading, logout, startSession, refresh, can, canAny }}>{children}</AuthContext.Provider>;
}
