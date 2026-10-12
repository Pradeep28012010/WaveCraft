import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

const isNativeOrDesktopApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isElectron =
    Boolean((window as unknown as { electronAPI?: unknown }).electronAPI) ||
    /Electron/i.test(navigator.userAgent);
  const isCapacitor = Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  );
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return isElectron || isCapacitor || isStandalone;
};

export function usePWAInstall() {
  const isNative = isNativeOrDesktopApp();
  const [canInstall, setCanInstall] = useState<boolean>(() => !isNative && Boolean(deferredInstallPrompt));
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isNative);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    if (isNative) {
      setCanInstall(false);
      setIsInstalled(true);
      return;
    }

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
  }, [isNative]);

  const triggerInstall = useCallback(async () => {
    if (isNative) return;
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
  }, [isNative]);

  return {
    canInstall: isNative ? false : canInstall,
    isInstalled: isNative ? true : isInstalled,
    showInstallGuide: isNative ? false : showInstallGuide,
    setShowInstallGuide,
    triggerInstall
  };
}
