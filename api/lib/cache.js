/**
 * Cache, rate limiting, and network security utilities for the WaveCraft API gateway.
 */

export const responseCache = new Map();
export const MAX_CACHE_ENTRIES = 250;

// Rate limiting: 100 requests per minute sliding window per IP
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const MAX_REQUESTS_PER_WINDOW = 100;
export const ipRequestCounts = new Map();

export function checkRateLimit(ip) {
  if (!ip || ip === 'unknown') return true;
  const now = Date.now();
  const record = ipRequestCounts.get(ip);
  if (!record || now > record.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  record.count++;
  return true;
}

// Allowed upstream CDN domains for audio proxying (prevents SSRF attacks)
export const ALLOWED_AUDIO_DOMAINS = [
  'googlevideo.com',
  'youtube.com',
  'saavn.com',
  'jiosaavn.com',
  'saavncdn.com',
  'apple.com',
  'mzstatic.com',
  'itunes.apple.com',
  'ytimg.com'
];

export function isAllowedAudioProxyUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    // Deny loopback, private, and local metadata IP ranges
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }
    return ALLOWED_AUDIO_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(key, data, ttlMs = 300_000) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
