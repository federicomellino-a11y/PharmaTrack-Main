import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { API, BACKEND_URL } from '@/lib/config';
import { ensureArray, ensureObject } from '@/lib/collections';

const SocketContext = createContext(null);
const MAX_RETRIES = 5;
const BASE_DELAY = 2000;
const MAX_BUFFERED_MESSAGES = 100;

const getNotificationPermission = () => (
  typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
);

const isArchivedDeliveryNotification = (notification) => (
  notification?.type === 'delivery' && ['delivered', 'cancelled'].includes(notification?.data?.status)
);

const isPushSupportedInBrowser = () => (
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
);

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};

export const SocketProvider = ({ children, userId, userType, settings = {} }) => {
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [driverLocations, setDriverLocations] = useState({});
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [pushConfig, setPushConfig] = useState({ enabled: false, public_key: null, subject: null });
  const [pushSupported, setPushSupported] = useState(isPushSupportedInBrowser());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const wsRef = useRef(null);
  const retriesRef = useRef(0);
  const timerRef = useRef(null);
  const unmountedRef = useRef(false);

  const notificationsEnabled = settings?.notifications_enabled ?? true;
  const soundEnabled = settings?.sound_enabled ?? true;
  const trackingEnabled = settings?.driver_tracking_enabled ?? false;
  const notificationsEndpoint = userType === 'driver' ? `${API}/driver/notifications` : `${API}/notifications`;
  const pushSubscribeEndpoint = userType === 'driver' ? `${API}/driver/push/subscribe` : `${API}/push/subscribe`;
  const pushUnsubscribeEndpoint = userType === 'driver' ? `${API}/driver/push/subscribe` : `${API}/push/subscribe`;
  const testNotificationEndpoint = userType === 'driver' ? `${API}/driver/notifications/test` : `${API}/notifications/test`;

  const fetchNotifications = useCallback(async () => {
    if (!userId || !userType) return;
    try {
      const response = await axios.get(notificationsEndpoint, { withCredentials: true });
      const items = ensureArray(response.data);
      items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setNotifications(items.slice(0, 50));
    } catch {
      // ignore background sync errors
    }
  }, [notificationsEndpoint, userId, userType]);

  const fetchPushConfig = useCallback(async () => {
    if (!isPushSupportedInBrowser()) {
      setPushSupported(false);
      setPushConfig({ enabled: false, public_key: null, subject: null });
      return { enabled: false, public_key: null, subject: null };
    }

    setPushSupported(true);
    try {
      const response = await axios.get(`${API}/push/config`);
      const nextConfig = {
        enabled: Boolean(response.data?.enabled),
        public_key: response.data?.public_key || null,
        subject: response.data?.subject || null,
      };
      setPushConfig(prev =>
        prev.enabled === nextConfig.enabled && prev.public_key === nextConfig.public_key && prev.subject === nextConfig.subject
          ? prev : nextConfig
      );
      return nextConfig;
    } catch {
      const fallbackConfig = { enabled: false, public_key: null, subject: null };
      setPushConfig(prev =>
        prev.enabled === false && prev.public_key === null ? prev : fallbackConfig
      );
      return fallbackConfig;
    }
  }, []);

  const syncPushSubscriptionState = useCallback(async (configOverride = null) => {
    const effectiveConfig = configOverride || pushConfig;
    if (!isPushSupportedInBrowser() || !effectiveConfig?.enabled) {
      setPushSubscribed(false);
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const active = Boolean(subscription);
      setPushSubscribed(active);
      return active;
    } catch {
      setPushSubscribed(false);
      return false;
    }
  }, [pushConfig]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    fetchPushConfig().then((config) => syncPushSubscriptionState(config));
  }, [fetchPushConfig, syncPushSubscriptionState]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleVisibilityRefresh = () => {
      setNotificationPermission(getNotificationPermission());
      setPushSupported(isPushSupportedInBrowser());
      if (document.visibilityState === 'visible') {
        fetchNotifications();
        syncPushSubscriptionState();
      }
    };

    window.addEventListener('focus', fetchNotifications);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.removeEventListener('focus', fetchNotifications);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [fetchNotifications, syncPushSubscriptionState]);

  useEffect(() => {
    if (!userId || !userType) return undefined;
    const intervalId = setInterval(fetchNotifications, 60000);
    return () => clearInterval(intervalId);
  }, [fetchNotifications, userId, userType]);

  const requestNotificationPermission = useCallback(async () => {
    const currentPermission = getNotificationPermission();
    setNotificationPermission(currentPermission);

    if (!notificationsEnabled || typeof window === 'undefined' || !('Notification' in window)) {
      return currentPermission;
    }

    if (currentPermission === 'default') {
      try {
        const nextPermission = await Notification.requestPermission();
        setNotificationPermission(nextPermission);
        return nextPermission;
      } catch {
        return currentPermission;
      }
    }

    return currentPermission;
  }, [notificationsEnabled]);

  const showBrowserNotification = useCallback((title, body) => {
    if (!notificationsEnabled || typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notification = new Notification(title, {
        body,
        icon: '/logo.png',
      });
      setTimeout(() => notification.close(), 5000);
    } catch {}
  }, [notificationsEnabled]);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'+
        'tvT18AAAAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA');
      audio.volume = 0.25;
      audio.play().catch(() => null);
    } catch {}
  }, [soundEnabled]);

  const pushBufferedMessage = useCallback((message) => {
    if (!message?.message_id) return;
    setMessages((prev) => {
      const safePrev = ensureArray(prev);
      if (safePrev.some((item) => item.message_id === message.message_id)) return safePrev;
      return [...safePrev, message].slice(-MAX_BUFFERED_MESSAGES);
    });
  }, []);

  const mergeNotification = useCallback((incomingNotification) => {
    if (!incomingNotification?.notification_id) return;
    setNotifications((prev) => {
      const safePrev = ensureArray(prev);
      const next = [incomingNotification, ...safePrev.filter((item) => item.notification_id !== incomingNotification.notification_id)];
      next.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return next.slice(0, 50);
    });
  }, []);

  const enablePushNotifications = useCallback(async () => {
    const permission = notificationPermission === 'granted'
      ? 'granted'
      : await requestNotificationPermission();

    if (permission !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }

    const config = await fetchPushConfig();
    if (!config?.enabled || !config?.public_key) {
      return { ok: false, reason: 'push_not_configured' };
    }

    if (!isPushSupportedInBrowser()) {
      setPushSupported(false);
      return { ok: false, reason: 'unsupported' };
    }

    setPushLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.public_key),
        });
      }

      await axios.post(pushSubscribeEndpoint, { subscription: subscription.toJSON() }, { withCredentials: true });
      setPushSubscribed(true);
      return { ok: true };
    } catch (error) {
      setPushSubscribed(false);
      return { ok: false, reason: error?.response?.data?.detail || error?.message || 'subscription_failed' };
    } finally {
      setPushLoading(false);
    }
  }, [fetchPushConfig, notificationPermission, pushSubscribeEndpoint, requestNotificationPermission]);

  const disablePushNotifications = useCallback(async () => {
    if (!isPushSupportedInBrowser()) {
      setPushSubscribed(false);
      return { ok: true };
    }

    setPushLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;

      await axios.delete(pushUnsubscribeEndpoint, {
        withCredentials: true,
        data: endpoint ? { endpoint } : {},
      });

      if (subscription) {
        await subscription.unsubscribe().catch(() => false);
      }

      setPushSubscribed(false);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error?.response?.data?.detail || error?.message || 'unsubscribe_failed' };
    } finally {
      setPushLoading(false);
    }
  }, [pushUnsubscribeEndpoint]);

  const sendServerTestNotification = useCallback(async () => {
    await axios.post(testNotificationEndpoint, {}, { withCredentials: true });
    return true;
  }, [testNotificationEndpoint]);

  const connect = useCallback(() => {
    if (unmountedRef.current || !userId || !userType) return;
    if (retriesRef.current >= MAX_RETRIES) return;

    requestNotificationPermission();

    const wsUrl = `${BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/ws/${userType}/${userId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) {
          ws.close();
          return;
        }
        setConnected(true);
        retriesRef.current = 0;
        fetchNotifications();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'new_message':
              if (data.message) {
                pushBufferedMessage(data.message);
                showBrowserNotification('Nuovo messaggio', data.message.content?.substring(0, 100) || 'Hai ricevuto un nuovo messaggio');
                playNotificationSound();
              }
              break;

            case 'notification':
              if (data.notification) {
                mergeNotification(data.notification);
                showBrowserNotification(data.notification.title || 'Nuova notifica', data.notification.message || 'Hai una nuova notifica');
                playNotificationSound();
              }
              break;

            case 'driver_location':
              if ((trackingEnabled || userType === 'driver') && data.driver_id && data.lat != null && data.lng != null) {
                setDriverLocations((prev) => ({
                  ...ensureObject(prev),
                  [data.driver_id]: { lat: data.lat, lng: data.lng },
                }));
              }
              break;

            case 'delivery_update':
              window.dispatchEvent(new CustomEvent('delivery_update', { detail: data }));
              showBrowserNotification('Aggiornamento consegna', `Stato aggiornato: ${data.status}`);
              playNotificationSound();
              break;

            case 'new_delivery':
              window.dispatchEvent(new CustomEvent('new_delivery', { detail: data }));
              showBrowserNotification('Nuova consegna assegnata', 'Hai una nuova consegna da effettuare');
              playNotificationSound();
              break;

            case 'pong':
            default:
              break;
          }
        } catch {}
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        if (retriesRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retriesRef.current);
          retriesRef.current += 1;
          timerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {}
  }, [fetchNotifications, mergeNotification, playNotificationSound, pushBufferedMessage, requestNotificationPermission, showBrowserNotification, trackingEnabled, userId, userType]);

  useEffect(() => {
    unmountedRef.current = false;
    retriesRef.current = 0;
    timerRef.current = setTimeout(connect, 1500);

    return () => {
      unmountedRef.current = true;
      clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendLocation = useCallback((lat, lng) => {
    sendMessage({ type: 'location', lat, lng });
  }, [sendMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const removeMessages = useCallback((messageIds = []) => {
    if (!messageIds.length) return;
    setMessages((prev) => ensureArray(prev).filter((message) => !messageIds.includes(message.message_id)));
  }, []);

  const markNotificationRead = useCallback(async (id) => {
    setNotifications((prev) => ensureArray(prev).map((notification) => (
      notification.notification_id === id ? { ...notification, is_read: true } : notification
    )));

    const endpoint = userType === 'driver'
      ? `${API}/driver/notifications/${id}/read`
      : `${API}/notifications/${id}/read`;

    try {
      await axios.put(endpoint, {}, { withCredentials: true });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications, userType]);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => ensureArray(prev).map((notification) => ({ ...notification, is_read: true })));

    const endpoint = userType === 'driver'
      ? `${API}/driver/notifications/read-all`
      : `${API}/notifications/read-all`;

    try {
      await axios.put(endpoint, {}, { withCredentials: true });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications, userType]);

  const deleteNotification = useCallback(async (id) => {
    setNotifications((prev) => ensureArray(prev).filter((notification) => notification.notification_id !== id));

    const endpoint = userType === 'driver'
      ? `${API}/driver/notifications/${id}`
      : `${API}/notifications/${id}`;

    try {
      await axios.delete(endpoint, { withCredentials: true });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications, userType]);

  const sendTestNotification = useCallback((title = 'Test PharmaTrack', body = 'Le notifiche browser sono attive correttamente.') => {
    const currentPermission = getNotificationPermission();
    setNotificationPermission(currentPermission);

    if (currentPermission !== 'granted') return false;

    showBrowserNotification(title, body);
    playNotificationSound();
    return true;
  }, [playNotificationSound, showBrowserNotification]);

  return (
    <SocketContext.Provider
      value={{
        connected,
        notifications,
        messages,
        driverLocations,
        sendMessage,
        sendLocation,
        clearMessages,
        removeMessages,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotification,
        refreshNotifications: fetchNotifications,
        notificationPermission,
        requestBrowserNotificationPermission: requestNotificationPermission,
        sendTestNotification,
        sendServerTestNotification,
        pushSupported,
        pushConfigured: pushConfig.enabled,
        pushSubscribed,
        pushLoading,
        enablePushNotifications,
        disablePushNotifications,
        refreshPushSubscriptionState: syncPushSubscriptionState,
        isArchivedDeliveryNotification,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
