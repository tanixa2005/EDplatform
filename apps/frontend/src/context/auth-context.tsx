'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SafeUser, LoginInput, RegisterInput } from '@edplatform/shared';

interface AuthContextType {
  user: SafeUser | null;
  isLoading: boolean;
  error: string | null;
  login: (data: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentUser = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.user) {
          setUser(json.data.user);
          setError(null);
          return;
        }
      }
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (data: LoginInput): Promise<void> => {
    setError(null);
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      const message = json.error?.message || 'Login failed. Please check your credentials.';
      setError(message);
      throw new Error(message);
    }

    setUser(json.data.user);
    setError(null);
  };

  const register = async (data: RegisterInput): Promise<void> => {
    setError(null);
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      const message = json.error?.message || 'Registration failed. Please check your inputs.';
      setError(message);
      throw new Error(message);
    }

    setUser(json.data.user);
    setError(null);
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } finally {
      setUser(null);
      setError(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        login,
        register,
        logout,
        refreshUser: fetchCurrentUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
