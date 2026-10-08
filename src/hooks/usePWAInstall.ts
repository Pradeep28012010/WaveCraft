import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState<boolean>(Boolean(deferredInstallPrompt));
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  });
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const onAppInstalled = () => {
      deferredInstallPrompt = null;
      setCanInstall(false);
      setIsInstalled(true);
      setShowInstallGuide(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
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
    canInstall,
    isInstalled,
    showInstallGuide,
    setShowInstallGuide,
    triggerInstall
  };
}
