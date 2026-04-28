import { useCallback, useEffect, useState } from 'react';

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator?.standalone === true;
};

export const usePWAInstall = () => {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(isStandaloneDisplay());
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    setIsSupported('serviceWorker' in navigator);
    setIsInstalled(isStandaloneDisplay());

    const mediaQuery = window.matchMedia('(display-mode: standalone)');

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    const handleDisplayModeChange = () => {
      setIsInstalled(isStandaloneDisplay());
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    mediaQuery.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      mediaQuery.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return { outcome: 'unavailable' };

    installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));

    if (choice?.outcome === 'accepted') {
      setIsInstalled(true);
    }

    setInstallPrompt(null);
    return choice;
  }, [installPrompt]);

  return {
    isSupported,
    isInstalled,
    isInstallable: Boolean(installPrompt) && !isInstalled,
    install,
  };
};

export default usePWAInstall;
