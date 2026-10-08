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
    (window.location.hostname === 'localhost' && !['3000', '5173', '4173'].includes(window.location.port))
  );
}

/**
 * Returns true if running inside Windows Electron desktop application.
 */
export function isElectronApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.electronAPI) || window.location.protocol === 'file:';
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
