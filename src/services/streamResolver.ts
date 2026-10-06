import { decryptSaavnUrl } from '../utils/saavnDecrypt';
import { apiUrl } from './apiConfig';

const streamCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 250;

function getCacheKey(title: string, artist: string): string {
  return `${(artist || '').toLowerCase().trim()}:::${(title || '').toLowerCase().trim()}`;
}

export function cleanTrackQuery(title: string, artist: string): { cleanTitle: string; cleanArtist: string } {
  const cleanTitle = (title || '')
    .replace(/\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*video|lyrical\s*song|video\s*song|full\s*song|4k|8k|hd|audio\s*song|audio|visualizer|remastered|lyrics|prod\s*\..*?|dir\s*\..*?)[\)\]]\s*/gi, ' ')
    .replace(/\s+(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|full\s+audio|8k\s+video|4k\s+video|hd\s+video|official\s+video|official\s+audio)\b.*$/i, '')
    .replace(/\|\s*.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanArtist = (artist || '')
    .replace(/ - Topic$/i, '')
    .replace(/\s*,\s*.*$/, '')
    .replace(/\s+feat\..*$/i, '')
    .replace(/\s+ft\..*$/i, '')
    .trim();

  return { cleanTitle, cleanArtist };
}

/**
 * Resolves a crystal-clear 320kbps CORS-enabled direct audio stream URL.
 * Enables the complete Web Audio DSP suite:
 * - 360° True 8D Binaural Orbit (Left/Right headphone panning)
 * - True Stadium Live Concert Convolution Reverb
 * - 10-Band Graphic Equalizer
 * - Dynamic Sub-Bass Boost (54Hz Shelf) & Treble Air (11kHz Shelf)
 */
export async function resolveDirectAudio(
  title: string,
  artist: string,
  _duration?: number
): Promise<string | null> {
  if (!title) return null;
  const { cleanTitle, cleanArtist } = cleanTrackQuery(title, artist);
  const cacheKey = getCacheKey(cleanTitle, cleanArtist);

  if (streamCache.has(cacheKey)) {
    return streamCache.get(cacheKey)!;
  }

  // 1. Try our serverless proxy endpoint (/api/music?action=resolve-stream)
  try {
    const apiQuery = new URLSearchParams({
      action: 'resolve-stream',
      title: cleanTitle,
      artist: cleanArtist
    });
    const res = await fetch(apiUrl(`/api/music?${apiQuery.toString()}`), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.audioUrl && typeof data.audioUrl === 'string' && data.audioUrl.startsWith('https://')) {
        if (streamCache.size >= MAX_CACHE_ENTRIES) {
          const first = streamCache.keys().next().value;
          if (first) streamCache.delete(first);
        }
        streamCache.set(cacheKey, data.audioUrl);
        return data.audioUrl;
      }
    }
  } catch {}

  // 2. Client-side direct resolution fallback via high-speed Saavn CDN
  try {
    const searchTerms = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
    const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&p=1&n=5&q=${encodeURIComponent(searchTerms)}`;

    const res = await fetch(saavnUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const data = await res.json();
      const results = data?.results || [];
      if (Array.isArray(results) && results.length > 0) {
        for (const item of results) {
          const enc = item?.more_info?.encrypted_media_url;
          if (enc) {
            const directUrl = decryptSaavnUrl(enc);
            if (directUrl && directUrl.startsWith('https://')) {
              if (streamCache.size >= MAX_CACHE_ENTRIES) {
                const first = streamCache.keys().next().value;
                if (first) streamCache.delete(first);
              }
              streamCache.set(cacheKey, directUrl);
              return directUrl;
            }
          }
        }
      }
    }
  } catch {}

  return null;
}
