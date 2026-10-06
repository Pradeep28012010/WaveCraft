import { Capacitor } from '@capacitor/core';

export const PROD_API_ORIGIN = 'https://wavecraft-alpha.vercel.app';

/**
 * Returns true if running inside Android Capacitor APK or Android WebView localhost without dev server.
 */
export function isAndroidNative(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    Capacitor.isNativePlatform() ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && window.location.port !== '3000')
  );
}

/**
 * Returns the base API URL:
 * - In Android Native APK: 'https://wavecraft-alpha.vercel.app'
 * - In local dev (localhost:3000) or Web: '' (relative)
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return PROD_API_ORIGIN;
  if (isAndroidNative()) {
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
