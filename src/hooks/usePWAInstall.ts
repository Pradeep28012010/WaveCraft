import { useState, useEffect, useCallback } from 'react';
import { isAppInstalled } from '../services/apiConfig';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    try {
      localStorage.setItem('wavecraft_installed', 'true');
    } catch {}
    deferredInstallPrompt = null;
    promptListeners.forEach((fn) => fn());
  });
}

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

    const syncPromptState = () => {
      if (isAppInstalled()) {
        setIsInstalled(true);
        setCanInstall(false);
        setShowInstallGuide(false);
      } else {
        setCanInstall(Boolean(deferredInstallPrompt));
      }
    };

    promptListeners.add(syncPromptState);
    syncPromptState();

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
        promptListeners.delete(syncPromptState);
        mediaQuery?.removeEventListener('change', handleDisplayMode);
      };
    } catch {}

    return () => {
      promptListeners.delete(syncPromptState);
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
