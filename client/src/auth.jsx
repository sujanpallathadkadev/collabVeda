import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const authenticate = useCallback(async (mode, payload) => {
    const d = await api(`/auth/${mode}`, { method: 'POST', body: payload });
    setToken(d.token);
    setUser(d.user);
  }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  return <Ctx.Provider value={{ user, loading, authenticate, logout }}>{children}</Ctx.Provider>;
}
