'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      await Promise.resolve();

      try {
        const stored = localStorage.getItem('user');
        const token = localStorage.getItem('accessToken');

        if (!stored || !token) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        const parsedUser = JSON.parse(stored);

        if (!cancelled) {
          setUser(parsedUser);
        }

        api.getProfile()
          .then((profile) => {
            if (cancelled) return;
            setUser(profile);
            localStorage.setItem('user', JSON.stringify(profile));
          })
          .catch(() => {
            if (cancelled) return;
            api.clearTokens();
            setUser(null);
          })
          .finally(() => {
            if (!cancelled) {
              setLoading(false);
            }
          });
      } catch {
        api.clearTokens();
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await api.login({ email, password });
    setUser(result.user);
    return result;
  }, []);

  const register = useCallback(async (data) => {
    const result = await api.register(data);
    if (result.user) {
      setUser(result.user);
    }
    return result;
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  const updateUser = useCallback((data) => {
    setUser((prev) => {
      const nextUser = { ...(prev || {}), ...data };
      localStorage.setItem('user', JSON.stringify(nextUser));
      return nextUser;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
