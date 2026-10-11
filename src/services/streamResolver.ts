import { decryptSaavnUrl } from '../utils/saavnDecrypt';
import { apiUrl } from './apiConfig';

const streamCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 350;

function getCacheKey(title: string, artist: string): string {
  return `${(artist || '').toLowerCase().trim()}:::${(title || '').toLowerCase().trim()}`;
}

export function cleanTrackQuery(title: string, artist: string): { cleanTitle: string; cleanArtist: string } {
  let cleanTitle = (title || '')
    .replace(/\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*video|lyrical\s*song|video\s*song|full\s*song|4k|8k|hd|audio\s*song|audio|visualizer|remastered|lyrics|prod\s*\..*?|dir\s*\..*?|second\s*single|first\s*single|third\s*single|promo|teaser|trailer|original\s*(?:motion\s*picture\s*)?soundtrack|soundtrack|ost|expanded(?:\s*edition)?|deluxe(?:\s*edition)?|special\s*edition|anniversary(?:\s*edition)?|score|bonus\s*track(?:s)?|from\s*["'].*?["'])[\)\]]\s*/gi, ' ')
    .replace(/\s+(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|full\s+audio|8k\s+video|4k\s+video|hd\s+video|official\s+video|official\s+audio|second\s+single|first\s+single|promo\s+song|video)\b.*$/i, '')
    .replace(/\|\s*.*$/g, '')
    .replace(/[-–—]\s*(?:video|lyric|audio|full|song|original\s*(?:motion\s*picture\s*)?soundtrack|expanded\s*edition|deluxe\s*edition).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  let cleanArtist = (artist || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*(?:VEVO|Records|Entertainment|Music|Official|Channel|Series|Films)\b.*$/i, '')
    .replace(/\s*,\s*.*$/, '')
    .replace(/\s+(?:feat\.|ft\.|second\s*single|first\s*single).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { cleanTitle, cleanArtist };
}

const BGM_REGEX =
  /\b(instrumental|karaoke|minus\s*one|backing\s*track|bgm|theme\s*(?:music|song|track)?|background\s*score|score|soundtrack)\b/i;

export function isStrictSaavnMatch(
  targetTitle: string,
  _targetArtist: string,
  candTitle?: string,
  candSubtitle?: string
): boolean {
  if (!candTitle || !targetTitle) return false;

  const normTarget = targetTitle.toLowerCase().trim();
  const normCand = candTitle.toLowerCase().trim();
  const candFull = `${normCand} ${(candSubtitle || '').toLowerCase()}`.trim();

  // If user searched for a vocal track, reject candidate if candidate is instrumental / BGM / karaoke
  const isTargetInst = BGM_REGEX.test(normTarget);
  const isCandInst = BGM_REGEX.test(candFull);
  if (!isTargetInst && isCandInst) {
    return false;
  }

  const cleanTarget = normTarget
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanCand = normCand
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanTarget === cleanCand) return true;
  if (cleanCand.startsWith(cleanTarget) || cleanTarget.startsWith(cleanCand)) return true;

  const targetTokens = cleanTarget.split(/\s+/).filter((t) => t.length > 1);
  const candTokens = cleanCand.split(/\s+/).filter((t) => t.length > 1);

  if (targetTokens.length === 0) return false;

  const matchedTokens = targetTokens.filter((t) => candTokens.includes(t));
  const ratio = matchedTokens.length / targetTokens.length;

  if (targetTokens.length === 1) {
    return candTokens.includes(targetTokens[0]);
  }

  return ratio >= 0.6;
}

/**
 * Resolves a crystal-clear 320kbps CORS-enabled direct audio stream URL.
 * Employs a multi-tier resolution waterfall:
 * 1. Serverless backend stream resolver
 * 2. High-speed JioSaavn 320kbps CDN with progressive query fallback
 * 3. Apple Music / iTunes high-fidelity AAC audio stream
 */
export async function resolveDirectAudio(
  title: string,
  artist: string,
  _duration?: number,
  videoId?: string
): Promise<string | null> {
  if (!title && !videoId) return null;
  const { cleanTitle, cleanArtist } = cleanTrackQuery(title, artist);
  const cacheKey = videoId ? `vid:${videoId}` : getCacheKey(cleanTitle, cleanArtist);

  if (streamCache.has(cacheKey)) {
    return streamCache.get(cacheKey)!;
  }

  // 1. Try serverless backend resolver (/api/music?action=resolve-stream)
  try {
    const apiQuery = new URLSearchParams({
      action: 'resolve-stream',
      title: cleanTitle,
      artist: cleanArtist
    });
    if (videoId) apiQuery.set('videoId', videoId);

    let res: Response | null = null;
    try {
      res = await fetch(apiUrl(`/api/music?${apiQuery.toString()}`), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4500)
      });
    } catch {}

    // Fallback to direct PROD_API_ORIGIN if local fetch failed
    if (!res || !res.ok) {
      try {
        res = await fetch(`https://wavecraft-alpha.vercel.app/api/music?${apiQuery.toString()}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(4500)
        });
      } catch {}
    }

    if (res && res.ok) {
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

  // 2. Client-side direct resolution waterfall via high-speed JioSaavn CDN
  const candidateQueries = [
    cleanArtist ? `${cleanTitle} ${cleanArtist}`.trim() : cleanTitle,
    cleanTitle,
    title.split(/[-–—]/)[0]?.trim()
  ].filter((q, idx, arr): q is string => Boolean(q) && q.length > 1 && arr.indexOf(q) === idx);

  for (const q of candidateQueries) {
    try {
      const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&p=1&n=5&q=${encodeURIComponent(q)}`;
      const res = await fetch(saavnUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        const results = data?.results || [];
        if (Array.isArray(results) && results.length > 0) {
          for (const item of results) {
            if (!isStrictSaavnMatch(cleanTitle, cleanArtist, item.title, item.subtitle)) {
              continue;
            }
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
  }

  // 3. Apple Music / iTunes high-fidelity audio stream fallback (global coverage for Western, Soundtracks & International)
  const itunesCandidates = [
    cleanArtist ? `${cleanTitle} ${cleanArtist}`.trim() : cleanTitle,
    cleanTitle,
    title.split(/[-–—]/)[0]?.trim()
  ].filter((q, idx, arr): q is string => Boolean(q) && q.length > 1 && arr.indexOf(q) === idx);

  for (const q of itunesCandidates) {
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=5`;
      const res = await fetch(itunesUrl, {
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        const results = data?.results || [];
        if (Array.isArray(results) && results.length > 0) {
          for (const item of results) {
            const preview = item?.previewUrl;
            if (preview && typeof preview === 'string' && preview.startsWith('https://')) {
              if (streamCache.size >= MAX_CACHE_ENTRIES) {
                const first = streamCache.keys().next().value;
                if (first) streamCache.delete(first);
              }
              streamCache.set(cacheKey, preview);
              return preview;
            }
          }
        }
      }
    } catch {}
  }

  // 4. Invidious direct audio stream extraction fallback (when videoId exists)
  if (videoId) {
    const invidiousMirrors = [
      `https://inv.nadeko.net/api/v1/videos/${videoId}`,
      `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
      `https://vid.puffyan.us/api/v1/videos/${videoId}`
    ];
    for (const mirrorUrl of invidiousMirrors) {
      try {
        const res = await fetch(mirrorUrl, {
          signal: AbortSignal.timeout(3500)
        });
        if (res.ok) {
          const data = await res.json();
          const adaptive = data?.adaptiveFormats || [];
          const audioFormats = adaptive.filter(
            (f: any) => f?.type && f.type.startsWith('audio/') && f.url && typeof f.url === 'string'
          );
          if (audioFormats.length > 0) {
            audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate || '0', 10) || 0) - (parseInt(a.bitrate || '0', 10) || 0));
            const bestAudio = audioFormats[0].url;
            if (bestAudio && typeof bestAudio === 'string' && bestAudio.startsWith('https://')) {
              if (streamCache.size >= MAX_CACHE_ENTRIES) {
                const first = streamCache.keys().next().value;
                if (first) streamCache.delete(first);
              }
              streamCache.set(cacheKey, bestAudio);
              return bestAudio;
            }
          }
        }
      } catch {}
    }
  }

  return null;
}
