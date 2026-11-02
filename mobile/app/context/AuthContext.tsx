import { AuthState } from '@/types';
import React, { createContext, useCallback, useContext, useState } from 'react';

interface AuthContextType {
  authState: AuthState;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
  });

  const login = useCallback((username: string, password: string) => {
    // Default admin credentials
    if (username === 'Admin' && password === 'Admin') {
      setAuthState({
        isLoggedIn: true,
        user: {
          role: 'admin',
          name: 'Admin User',
        },
      });
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setAuthState({
      isLoggedIn: false,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ authState, login, logout }}>
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
