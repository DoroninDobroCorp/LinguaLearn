import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuth = async () => {
    try {
      let res = await fetch('/english/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok && (res.status === 404 || res.status === 502)) {
        res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      }
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to check auth:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      let res = await fetch('/english/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok && res.status === 404) {
        res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, password }),
        });
      }
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        return { success: true, user: data.user };
      } else {
        const msg = data.error || 'Login failed';
        setError(msg);
        return { success: false, error: msg };
      }
    } catch (err) {
      const msg = err.message || 'Network error during login';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const signup = async (email, password, inviteCode) => {
    setError(null);
    try {
      let res = await fetch('/english/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password, invite_code: inviteCode }),
      });
      if (!res.ok && res.status === 404) {
        res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, password, invite_code: inviteCode }),
        });
      }
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        return { success: true, user: data.user };
      } else {
        const msg = data.error || 'Signup failed';
        setError(msg);
        return { success: false, error: msg };
      }
    } catch (err) {
      const msg = err.message || 'Network error during signup';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      await fetch('/english/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {
      // ignore
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, setError, login, signup, logout, checkAuth }}>
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
