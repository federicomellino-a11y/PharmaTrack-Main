import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

const FEATURES = {
  free: { pod: false, notifications: false, analytics: false, winfarm: false, multi_pharmacy: false },
  pro: { pod: true, notifications: true, analytics: true, winfarm: true, multi_pharmacy: false },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, { withCredentials: true });
      const me = response.data;
      // Fetch billing/subscription info to expose plan/features to the UI (best-effort)
      try {
        const subRes = await axios.get(`${API}/billing/subscription`, { withCredentials: true });
        const sub = subRes.data || { status: 'none', plan: null };
        const plan = sub.plan || (sub.status && sub.status !== 'none' ? sub.plan : 'free');
        const active = ['active', 'trialing'].includes(sub.status);
        const effectivePlan = active && plan === 'pro' ? 'pro' : 'free';
        me.subscription = sub;
        me.plan = effectivePlan;
        me.features_enabled = FEATURES[effectivePlan];
      } catch (billingErr) {
        // best-effort: if billing endpoint fails, default to free
        me.subscription = { status: 'none', plan: null };
        me.plan = 'free';
        me.features_enabled = FEATURES.free;
      }
      setUser(me);
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
    // refresh auth state
    await checkAuth();
    return response.data;
  };

  const register = async (email, password, name, pharmacyName, pharmacyAddress, pharmacyPhone, pharmacyLat = null, pharmacyLng = null) => {
    const response = await axios.post(`${API}/auth/register`, { email, password, name, pharmacy_name: pharmacyName, pharmacy_address: pharmacyAddress, pharmacy_phone: pharmacyPhone, pharmacy_lat: pharmacyLat, pharmacy_lng: pharmacyLng }, { withCredentials: true });
    await checkAuth();
    return response.data;
  };

  const loginWithGoogle = async (credential) => {
    const response = await axios.post(`${API}/auth/google`, { credential }, { withCredentials: true });
    await checkAuth();
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
    // try to refresh billing info as well
    try {
      const subRes = await axios.get(`${API}/billing/subscription`, { withCredentials: true });
      const sub = subRes.data || { status: 'none', plan: null };
      const plan = sub.plan || (sub.status && sub.status !== 'none' ? sub.plan : 'free');
      const active = ['active', 'trialing'].includes(sub.status);
      const effectivePlan = active && plan === 'pro' ? 'pro' : 'free';
      nextUser.subscription = sub;
      nextUser.plan = effectivePlan;
      nextUser.features_enabled = FEATURES[effectivePlan];
    } catch (_) {
      nextUser.subscription = { status: 'none', plan: null };
      nextUser.plan = 'free';
      nextUser.features_enabled = FEATURES.free;
    }
    setUser(nextUser);
    return nextUser;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, error, login, register, loginWithGoogle, logout, checkAuth, updateProfile, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};
