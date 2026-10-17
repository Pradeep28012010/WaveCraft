import { Capacitor } from '@capacitor/core';

export const PROD_API_ORIGIN = 'https://wavecraft-alpha.vercel.app';

/**
 * Returns true if running inside Android Capacitor APK or Android WebView localhost without dev server.
 */
export function isAndroidNative(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() === 'android' ||
    window.location.protocol === 'capacitor:' ||
    typeof (window as unknown as { AndroidAudioBridge?: unknown }).AndroidAudioBridge !== 'undefined' ||
    (window.location.hostname === 'localhost' && !['3000', '5173', '4173'].includes(window.location.port))
  );
}

/**
 * Returns true if running inside Windows Electron desktop application.
 */
export function isElectronApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    Boolean((window as unknown as { electronAPI?: unknown }).electronAPI) ||
    window.location.protocol === 'file:' ||
    /Electron/i.test(navigator.userAgent)
  );
}

/**
 * Returns true if running as an installed standalone PWA on Windows, Android, or iOS.
 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isStandaloneMQ =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;
    const isIosStandalone = Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
    const isAndroidAppReferrer =
      typeof document !== 'undefined' && Boolean(document.referrer && document.referrer.includes('android-app://'));
    const isMarkedInstalled = localStorage.getItem('wavecraft_installed') === 'true';
    return isStandaloneMQ || isIosStandalone || isAndroidAppReferrer || isMarkedInstalled;
  } catch {
    return false;
  }
}

/**
 * Returns true if the app is already installed and running as a native app or standalone PWA
 * on Windows or Android.
 */
export function isAppInstalled(): boolean {
  return isAndroidNative() || isElectronApp() || isStandalonePWA();
}

/**
 * Returns the base API URL:
 * - In Android Native APK & Windows Desktop App: 'https://wavecraft-alpha.vercel.app'
 * - In local dev (localhost:3000) or Web: '' (relative)
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return PROD_API_ORIGIN;
  if (isAndroidNative() || isElectronApp()) {
    return PROD_API_ORIGIN;
  }
  return '';
}

/**
 * Helper to produce full URL for any API endpoint.
 * Automatically prepends the production API origin when running in Android native APK.
 */
export function apiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${clean}`;
}

/**
 * Returns the public web base URL for sharing tracks, links, and wavecards.
 * Never returns 'http://localhost' or 'https://localhost' or 'capacitor://localhost'.
 */
export function getShareBaseUrl(): string {
  if (typeof window === 'undefined') return PROD_API_ORIGIN;
  const origin = window.location.origin;
  if (
    isAndroidNative() ||
    isElectronApp() ||
    !origin ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.startsWith('capacitor:') ||
    origin.startsWith('file:')
  ) {
    return PROD_API_ORIGIN;
  }
  return origin;
}
