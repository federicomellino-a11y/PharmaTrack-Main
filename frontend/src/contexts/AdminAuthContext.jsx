import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';

const AdminAuthContext = createContext(null);

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return context;
};

export const AdminAuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/me`, { withCredentials: true });
      setAdmin(response.data);
      setError(null);
    } catch (err) {
      setAdmin(null);
      if (err.response?.status !== 401) {
        setError(err.response?.data?.detail || 'Errore di connessione admin');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/admin/login`, { email, password }, { withCredentials: true });
    setAdmin(response.data);
    setError(null);
    return response.data;
  };

  const logout = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/admin/logout`, {}, { withCredentials: true, timeout: 10000 });
    } catch (err) {
      // ignore logout errors and force local cleanup
    } finally {
      setAdmin(null);
      setError(null);
      setLoading(false);
      if (typeof window !== 'undefined') {
        const nextRoute = window.location.pathname.startsWith('/console-federico') ? '/console-federico' : '/admin/login';
        window.location.replace(nextRoute);
      }
    }
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, error, login, logout, checkAuth, isAuthenticated: !!admin }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
