import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(response.data);
      setError(null);
    } catch (err) {
      setUser(null);
      if (err.response?.status !== 401) setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password }, { withCredentials: true });
    setUser(response.data);
    return response.data;
  };

  const register = async (email, password, name, pharmacyName, pharmacyAddress, pharmacyPhone, pharmacyLat = null, pharmacyLng = null) => {
    const response = await axios.post(`${API}/auth/register`, { email, password, name, pharmacy_name: pharmacyName, pharmacy_address: pharmacyAddress, pharmacy_phone: pharmacyPhone, pharmacy_lat: pharmacyLat, pharmacy_lng: pharmacyLng }, { withCredentials: true });
    setUser(response.data);
    return response.data;
  };

  const loginWithGoogle = async (credential) => {
    const response = await axios.post(`${API}/auth/google`, { credential }, { withCredentials: true });
    setUser(response.data);
    return response.data;
  };

  const logout = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true, timeout: 10000 });
    } catch (err) {
      // best effort logout: clear local session state even if backend is temporarily unreachable
    } finally {
      setUser(null);
      setError(null);
      setLoading(false);
      if (typeof window !== 'undefined') {
        window.location.replace('/');
      }
    }
  };

  const updateProfile = async (data) => {
    const response = await axios.put(`${API}/auth/profile`, data, { withCredentials: true });
    const nextUser = response?.data && typeof response.data === 'object'
      ? response.data
      : { ...user, ...data, settings: { ...(user?.settings || {}), ...(data?.settings || {}) } };
    setUser(nextUser);
    return nextUser;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, error, login, register, loginWithGoogle, logout, checkAuth, updateProfile, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

