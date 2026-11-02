import { AuthState } from '@/types';
import { api, clearToken, loadToken, setToken, setUnauthorizedHandler } from '@/services/api';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface LoginResult {
  ok: boolean;
  error?: string;
}

interface AuthContextType {
  authState: AuthState;
  isBootstrapping: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ isLoggedIn: false });
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setAuthState({ isLoggedIn: false });
  }, []);

  // A 401 anywhere forces a clean logout.
  useEffect(() => {
    setUnauthorizedHandler(() => setAuthState({ isLoggedIn: false }));
  }, []);

  // On launch, restore a saved session by validating the stored token.
  useEffect(() => {
    (async () => {
      try {
        const token = await loadToken();
        if (token) {
          const me = await api.auth.me();
          setAuthState({
            isLoggedIn: true,
            user: { role: me.role, name: me.displayName || me.username },
          });
        }
      } catch {
        await clearToken();
        setAuthState({ isLoggedIn: false });
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      const res = await api.auth.login(username, password);
      await setToken(res.token);
      const user = res.user || {};
      setAuthState({
        isLoggedIn: true,
        user: { role: user.role, name: user.displayName || user.username || username },
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Login failed' };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ authState, isBootstrapping, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
