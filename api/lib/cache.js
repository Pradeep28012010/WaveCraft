/**
 * Cache, rate limiting, and network security utilities for the WaveCraft API gateway.
 */

export const responseCache = new Map();
export const MAX_CACHE_ENTRIES = 250;

// Rate limiting: 400 requests per minute sliding window per IP
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const MAX_REQUESTS_PER_WINDOW = 400;
export const MAX_RATE_LIMIT_ENTRIES = 2000;
export const ipRequestCounts = new Map();

export function checkRateLimit(ip, cost = 1) {
  const bucketKey = typeof ip === 'string' && ip.trim() ? ip.trim() : 'unknown';
  const weight = Number.isFinite(cost) && cost > 0 ? cost : 1;
  const now = Date.now();

  // Prune expired or oldest IP records when the map grows large to prevent memory leaks
  if (ipRequestCounts.size >= MAX_RATE_LIMIT_ENTRIES) {
    for (const [key, rec] of ipRequestCounts.entries()) {
      if (now > rec.resetAt) {
        ipRequestCounts.delete(key);
      }
    }
    while (ipRequestCounts.size >= MAX_RATE_LIMIT_ENTRIES) {
      const oldestKey = ipRequestCounts.keys().next().value;
      if (!oldestKey) break;
      ipRequestCounts.delete(oldestKey);
    }
  }

  const record = ipRequestCounts.get(bucketKey);
  if (!record || now > record.resetAt) {
    ipRequestCounts.set(bucketKey, { count: weight, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count + weight > MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  record.count += weight;
  return true;
}

// Allowed upstream CDN domains for audio proxying (prevents SSRF attacks).
// Avoid broad web apex domains (e.g. youtube.com, apple.com) that serve arbitrary HTML.
export const ALLOWED_AUDIO_DOMAINS = [
  'googlevideo.com',
  'saavncdn.com',
  'mzstatic.com',
  'itunes.apple.com',
  'ytimg.com',
  'yt.chocolatemoo53.com',
  'invidious.jing.rocks',
  'invidious.privacydev.net',
  'iv.ggtyler.dev',
  'inv.nadeko.net',
  'invidious.nerdvpn.de',
  'invidious.io'
];

export function isAllowedAudioProxyUrl(targetUrl) {
  if (typeof targetUrl !== 'string' || !targetUrl.trim() || targetUrl.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(targetUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    if (!hostname) return false;

    // Deny IP literals (IPv4, IPv6, hex/octal/decimal), loopback, metadata, and private suffixes
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.includes(':') ||
      hostname.startsWith('[') ||
      /^[\d.]+$/.test(hostname) ||
      /^0x[0-9a-f]+$/i.test(hostname) ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
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
