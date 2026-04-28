import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';


const DriverAuthContext = createContext(null);

export const useDriverAuth = () => {
  const context = useContext(DriverAuthContext);
  if (!context) {
    throw new Error('useDriverAuth must be used within a DriverAuthProvider');
  }
  return context;
};

export const DriverAuthProvider = ({ children }) => {
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/driver/me`, {
        withCredentials: true
      });
      setDriver(response.data);
      setError(null);
    } catch (err) {
      setDriver(null);
      if (err.response?.status !== 401) {
        setError('Errore di connessione');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/driver/login`, 
        { email, password },
        { withCredentials: true }
      );
      setDriver(response.data);
      setError(null);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Credenziali non valide';
      setError(message);
      throw new Error(message);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/driver/logout`, {}, { withCredentials: true, timeout: 10000 });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setDriver(null);
      setError(null);
      setLoading(false);
      if (typeof window !== 'undefined') {
        window.location.replace('/driver/login');
      }
    }
  };

  const updateLocation = async (lat, lng) => {
    try {
      await axios.put(`${API}/driver/location`, { lat, lng }, { withCredentials: true });
    } catch (err) {
      console.error('Location update error:', err);
    }
  };

  return (
    <DriverAuthContext.Provider value={{ 
      driver, 
      setDriver,
      loading, 
      error, 
      login, 
      logout, 
      checkAuth,
      updateLocation,
      isAuthenticated: !!driver 
    }}>
      {children}
    </DriverAuthContext.Provider>
  );
};
