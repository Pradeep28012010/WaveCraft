import { useState, useEffect, useCallback } from 'react';
import { isAppInstalled } from '../services/apiConfig';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

export function usePWAInstall() {
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isAppInstalled());
  const [canInstall, setCanInstall] = useState<boolean>(() => !isAppInstalled() && Boolean(deferredInstallPrompt));
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    if (isAppInstalled()) {
      setIsInstalled(true);
      setCanInstall(false);
      return;
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const onAppInstalled = () => {
      try {
        localStorage.setItem('wavecraft_installed', 'true');
      } catch {}
      deferredInstallPrompt = null;
      setCanInstall(false);
      setIsInstalled(true);
      setShowInstallGuide(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    let mediaQuery: MediaQueryList | null = null;
    try {
      mediaQuery = window.matchMedia('(display-mode: standalone)');
      const handleDisplayMode = (e: MediaQueryListEvent) => {
        if (e.matches) {
          try {
            localStorage.setItem('wavecraft_installed', 'true');
          } catch {}
          setIsInstalled(true);
          setCanInstall(false);
        }
      };
      mediaQuery.addEventListener('change', handleDisplayMode);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        window.removeEventListener('appinstalled', onAppInstalled);
        mediaQuery?.removeEventListener('change', handleDisplayMode);
      };
    } catch {}

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (isAppInstalled()) return;
    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          try {
            localStorage.setItem('wavecraft_installed', 'true');
          } catch {}
          deferredInstallPrompt = null;
          setCanInstall(false);
          setIsInstalled(true);
        }
      } catch {
        setShowInstallGuide(true);
      }
    } else {
      setShowInstallGuide(true);
    }
  }, []);

  return {
    canInstall: isInstalled ? false : canInstall,
    isInstalled,
    showInstallGuide: isInstalled ? false : showInstallGuide,
    setShowInstallGuide,
    triggerInstall
  };
}
