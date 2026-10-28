import { decryptSaavnUrl } from '../utils/saavnDecrypt';
import { apiUrl, PROD_API_ORIGIN } from './apiConfig';
import { fetchAndroidNativeUrl } from './nativeAndroid';

const streamCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 350;

function getCacheKey(title: string, artist: string): string {
  return `${(artist || '').toLowerCase().trim()}:::${(title || '').toLowerCase().trim()}`;
}

const LABEL_CHANNEL_REGEX =
  /(?:t-series|aditya|sony|zee|saregama|think|lahari|junglee|tips|yrf|mythri|hombale|vevo|speed|white\s*hill|records|films|movies|music|media|studios|entertainment|international|audio|series|channel|official|ap\s*international)/i;

export interface CleanQueryDetails {
  cleanTitle: string;
  cleanArtist: string;
  songName: string;
  detectedArtist: string;
  movieContext?: string;
  candidateQueries: string[];
}

export function cleanTrackQuery(title: string, artist: string): CleanQueryDetails {
  const raw = (title || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

  const pipeParts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const movieContext = pipeParts.length >= 2 ? pipeParts[1].replace(/[-–—].*$/, '').trim() : undefined;

  let cleanTitle = raw
    .replace(/\s*[\(\[][^)\]]*?(?:4k|8k|hd|ultra\s*hd|video|audio|visualizer|remaster|lyrics|soundtrack|teaser|promo|trailer|edition|feat|ft\.|with|prod|bonus|anniversary|from)[^)\]]*?[\)\]]/gi, ' ')
    .replace(/\s+(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|full\s+audio|8k\s+video|4k\s+video|hd\s+video|official\s+video|official\s+audio|second\s+single|first\s+single|promo\s+song|video)\b.*$/i, '')
    .replace(/\|\s*.*$/g, '')
    .replace(/[-–—]\s*(?:video|lyric|audio|full|song|original\s*(?:motion\s*picture\s*)?soundtrack|expanded\s*edition|deluxe\s*edition).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  let cleanArtist = (artist || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(?:vevo|records|entertainment|music|official|channel|series|films)\b.*$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const dashParts = cleanTitle.split(/\s*[-–—]\s*/).map((s) => s.trim()).filter(Boolean);
  let songName = cleanTitle;
  let detectedArtist = cleanArtist;
  if (dashParts.length >= 2) {
    const part0 = dashParts[0];
    const part1 = dashParts[1];
    const cleanArtLow = (cleanArtist || '').toLowerCase();
    if (cleanArtLow && (part1.toLowerCase().includes(cleanArtLow) || cleanArtLow.includes(part1.toLowerCase()))) {
      songName = part0;
      detectedArtist = part1;
    } else if (cleanArtLow && (part0.toLowerCase().includes(cleanArtLow) || cleanArtLow.includes(part0.toLowerCase()))) {
      songName = part1;
      detectedArtist = part0;
    } else if (LABEL_CHANNEL_REGEX.test(part0)) {
      songName = part1;
      detectedArtist = part0;
    } else {
      songName = part0;
      detectedArtist = part1;
    }
  }

  // Strip artist name if repeated inside title (e.g. "Top Lugai (Official) Pardeep Boora" -> "Top Lugai")
  if (cleanArtist && cleanArtist.length > 2) {
    const escapedArtist = cleanArtist.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const artistRegexEnd = new RegExp(`\\s*[-–—:]?\\s*${escapedArtist}\\s*$`, 'i');
    const artistRegexStart = new RegExp(`^\\s*${escapedArtist}\\s*[-–—:]?\\s*`, 'i');
    if (artistRegexEnd.test(songName)) {
      songName = songName.replace(artistRegexEnd, '').trim();
    } else if (artistRegexStart.test(songName)) {
      songName = songName.replace(artistRegexStart, '').trim();
    }
  }

  // Strip parenthetical featured artists / tags from songName
  const cleanSongCore = songName
    .replace(/\s*[\(\[](?:feat\.|ft\.|with|prod\.|produced\s*by|remix|version|slowed|reverb).*?[\)\]]/gi, '')
    .trim();

  const querySet = new Set<string>();
  if (detectedArtist && songName && !LABEL_CHANNEL_REGEX.test(detectedArtist)) {
    querySet.add(`${songName} ${detectedArtist}`.trim());
    if (cleanSongCore && cleanSongCore !== songName) {
      querySet.add(`${cleanSongCore} ${detectedArtist}`.trim());
    }
  }
  if (dashParts.length >= 2) {
    // Both [Song - Artist] and [Artist - Song] interpretations
    querySet.add(`${dashParts[0]} ${dashParts[1]}`.trim());
    querySet.add(`${dashParts[1]} ${dashParts[0]}`.trim());
    querySet.add(dashParts[0]);
    querySet.add(dashParts[1]);
    if (cleanArtist) {
      querySet.add(`${dashParts[0]} ${cleanArtist}`.trim());
      querySet.add(`${dashParts[1]} ${cleanArtist}`.trim());
    }
  }
  if (movieContext && songName) {
    querySet.add(`${songName} ${movieContext}`.trim());
  }
  if (cleanArtist && songName && cleanArtist !== detectedArtist && !LABEL_CHANNEL_REGEX.test(cleanArtist)) {
    querySet.add(`${songName} ${cleanArtist}`.trim());
    if (cleanSongCore && cleanSongCore !== songName) {
      querySet.add(`${cleanSongCore} ${cleanArtist}`.trim());
    }
  }
  if (cleanSongCore) querySet.add(cleanSongCore);
  if (songName) querySet.add(songName);
  if (cleanTitle) querySet.add(cleanTitle);
  if (cleanArtist && cleanTitle && !LABEL_CHANNEL_REGEX.test(cleanArtist)) {
    querySet.add(`${cleanTitle} ${cleanArtist}`.trim());
  }

  // Phonetic transliteration expansion (e.g. "Chalray" <-> "Chalre", "Aa" <-> "A")
  const phoneticQueries: string[] = [];
  for (const q of querySet) {
    if (/\bay\b/i.test(q) || /ray\b/i.test(q) || /nay\b/i.test(q)) {
      phoneticQueries.push(q.replace(/ray\b/gi, 're').replace(/nay\b/gi, 'ne').replace(/\bay\b/gi, 'e'));
    }
  }
  phoneticQueries.forEach((pq) => querySet.add(pq));

  return {
    cleanTitle,
    cleanArtist,
    songName,
    detectedArtist,
    movieContext,
    candidateQueries: Array.from(querySet).filter((q) => q.length > 1)
  };
}

const BGM_REGEX =
  /\b(instrumental|karaoke|minus\s*one|backing\s*track|bgm)\b/i;

export function isStrictSaavnMatch(
  targetTitle: string,
  targetArtist?: string,
  candTitle?: string,
  candSubtitle?: string,
  rawTargetTitle?: string
): boolean {
  if (!candTitle || !targetTitle) return false;

  const normTarget = targetTitle.toLowerCase().trim();
  const normCand = candTitle.toLowerCase().trim();
  const candFull = `${normCand} ${(candSubtitle || '').toLowerCase()}`.trim();

  // If user searched for a vocal track, reject candidate if candidate title is instrumental / BGM / karaoke
  const isTargetInst = BGM_REGEX.test(normTarget);
  const isCandInst = BGM_REGEX.test(normCand);
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

  const cleanRawTarget = (rawTargetTitle || targetTitle || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normVowels = (s: string) =>
    (s || '').replace(/aa+/g, 'a').replace(/ee+/g, 'i').replace(/oo+/g, 'u').replace(/ii+/g, 'i');

  // Validate artist if specified: prevent wrong song by different artist with identical title
  const isGenericPlaceholder =
    !targetArtist ||
    /^(wavecraft|youtube\s*music|various\s*artists|unknown\s*artist|official\s*audio|top\s*hits|music|artist)$/i.test(
      targetArtist.trim()
    );

  const isLabelOrChannel = Boolean(targetArtist && LABEL_CHANNEL_REGEX.test(targetArtist));

  let artistMatches = true;
  let artistMismatch = false;

  if (!isGenericPlaceholder && !isLabelOrChannel && targetArtist && targetArtist.trim().length > 1) {
    const cleanTargetArtist = targetArtist
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(?:vevo|records|entertainment|music|official|channel|series|films)\b.*$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const artistTokens = cleanTargetArtist.split(/\s+/).filter((t) => t.length > 2);
    if (artistTokens.length > 0) {
      artistMatches = artistTokens.some((tok) => candFull.includes(tok));
      if (!artistMatches) {
        artistMismatch = true;
      }
    }
  }

  const rawParts = (rawTargetTitle || '').split(/\s*[-–—]\s*/).map((s) => s.trim()).filter(Boolean);
  const targetVariants = [
    cleanTarget,
    (rawTargetTitle || '')
      .toLowerCase()
      .replace(/\s*[\(\[][^)\]]*?[\)\]]/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    rawParts.length > 0
      ? rawParts[0]
          .toLowerCase()
          .replace(/\s*[\(\[][^)\]]*?[\)\]]/g, ' ')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : null,
    rawParts.length > 1
      ? rawParts[1]
          .toLowerCase()
          .replace(/\s*[\(\[][^)\]]*?[\)\]]/g, ' ')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : null
  ].filter((v): v is string => Boolean(v && v.length > 1));

  const isExactTitle = targetVariants.some(
    (v) => v === cleanCand || normVowels(v) === normVowels(cleanCand)
  );
  const isStrongPrefix = targetVariants.some(
    (v) => (cleanCand.startsWith(v) || v.startsWith(cleanCand)) && Math.abs(cleanCand.length - v.length) <= 10
  );

  // Subtitle contains tokens of raw title (e.g. film name, composer, co-singer)
  const candSubTokens = (candSubtitle || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const subMatchesRawTitle = candSubTokens.some((tok) => cleanRawTarget.includes(tok));

  // Reject wrong artist only if title is NOT an exact match and artist was genuinely mismatched
  // (prevents rejecting exact song matches where targetArtist is a YouTube channel/label name)
  if (artistMismatch && !isExactTitle && !isStrongPrefix && !subMatchesRawTitle) {
    return false;
  }

  // 1. Exact or vowel-normalized title match
  if (isExactTitle || isStrongPrefix) {
    return true;
  }
  if (
    cleanCand.startsWith(cleanTarget) ||
    cleanTarget.startsWith(cleanCand) ||
    normVowels(cleanCand).startsWith(normVowels(cleanTarget)) ||
    normVowels(cleanTarget).startsWith(normVowels(cleanCand))
  ) {
    return true;
  }

  // 2. Token matching across candidate full text
  const targetTokens = cleanTarget.split(/\s+/).filter((t) => t.length > 1);
  const candTokens = cleanCand.split(/\s+/).filter((t) => t.length > 1);
  const candFullTokens = candFull.split(/\s+/).filter((t) => t.length > 1);

  if (targetTokens.length === 0) return false;

  const matchedCandTokens = targetTokens.filter((t) => candTokens.includes(t));
  const matchedFullTokens = targetTokens.filter((t) => candFullTokens.includes(t));

  const targetVowelTokens = targetTokens.map(normVowels);
  const candVowelTokens = candTokens.map(normVowels);
  const matchedVowelTokens = targetVowelTokens.filter((t) => candVowelTokens.includes(t));

  const ratioCand = matchedCandTokens.length / targetTokens.length;
  const ratioFull = matchedFullTokens.length / targetTokens.length;
  const ratioVowel = matchedVowelTokens.length / targetTokens.length;

  if (targetTokens.length === 1) {
    return (
      candTokens.includes(targetTokens[0]) ||
      candVowelTokens.includes(normVowels(targetTokens[0])) ||
      (subMatchesRawTitle && candFullTokens.includes(targetTokens[0]))
    );
  }

  return (
    ratioCand >= 0.6 ||
    (ratioVowel >= 0.5 && (artistMatches || subMatchesRawTitle)) ||
    (ratioFull >= 0.75 && (artistMatches || subMatchesRawTitle))
  );
}

/**
 * Returns true if an audio URL is a valid, high-fidelity playable direct stream
 * that can be safely loaded into HTML5 Audio without encountering 403 Forbidden or 30-second previews.
 */
export function isPlayableAudioStreamUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (
    trimmed.includes('p.scdn.co') ||
    trimmed.includes('mzstatic.com') ||
    trimmed.includes('itunes.apple.com') ||
    trimmed.includes('preview')
  ) {
    return false;
  }
  // Dedicated serverless proxy stream is always reliable and safe to stream directly
  if (
    trimmed.includes('action=proxy-stream') ||
    trimmed.includes('/api/music') ||
    trimmed.startsWith('blob:') ||
    trimmed.includes('saavncdn')
  ) {
    return true;
  }
  // Direct raw unproxied googlevideo streams get 403 Forbidden without proxy headers
  if (trimmed.includes('googlevideo.com')) {
    return false;
  }
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

/**
 * Resolves a crystal-clear 320kbps CORS-enabled direct audio stream URL.
 * Employs a multi-tier resolution waterfall:
 * 1. Android Native network bridge (bypasses browser CORS with zero latency)
 * 2. Serverless backend stream resolver (/api/music?action=resolve-stream)
 * 3. Backend stream proxy (/api/music?action=proxy-stream)
 * 4. Client-side direct fetch
 */
export async function resolveDirectAudio(
  title: string,
  artist: string,
  _duration?: number,
  videoId?: string
): Promise<string | null> {
  if (!title && !videoId) return null;
  const queryDetails = cleanTrackQuery(title, artist);
  const { cleanTitle, cleanArtist, songName, detectedArtist, candidateQueries } = queryDetails;
  const cacheKey = videoId ? `vid:${videoId}` : getCacheKey(cleanTitle, cleanArtist);

  if (streamCache.has(cacheKey)) {
    return streamCache.get(cacheKey)!;
  }

  const topQueries = candidateQueries.slice(0, 4);

  // 1. Android Native Network Bridge (Instant zero-CORS resolution directly on mobile)
  for (const q of topQueries) {
    try {
      const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&p=1&n=5&q=${encodeURIComponent(q)}`;
      const rawJson = fetchAndroidNativeUrl(saavnUrl);
      if (rawJson) {
        const data = JSON.parse(rawJson);
        const results = data?.results || [];
        if (Array.isArray(results) && results.length > 0) {
          for (const item of results) {
            if (!isStrictSaavnMatch(songName, detectedArtist || cleanArtist, item.title, item.subtitle, title)) {
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

  // 2. Serverless backend resolver (/api/music?action=resolve-stream)
  try {
    const apiQuery = new URLSearchParams({
      action: 'resolve-stream',
      title: cleanTitle,
      artist: cleanArtist
    });
    if (videoId) apiQuery.set('videoId', videoId);

    const primaryEndpoint = apiUrl(`/api/music?${apiQuery.toString()}`);
    let res: Response | null = await fetch(primaryEndpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    }).catch(() => null);

    // Fallback to direct PROD_API_ORIGIN if relative endpoint failed on native/Capacitor
    if (!res?.ok && !primaryEndpoint.startsWith('http')) {
      res = await fetch(`${PROD_API_ORIGIN}/api/music?${apiQuery.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);
    }

    if (res && res.ok) {
      const data = await res.json();
      if (
        data?.audioUrl &&
        typeof data.audioUrl === 'string' &&
        isPlayableAudioStreamUrl(data.audioUrl)
      ) {
        const fullUrl = data.audioUrl.startsWith('/') ? apiUrl(data.audioUrl) : data.audioUrl;
        if (fullUrl.startsWith('http')) {
          if (streamCache.size >= MAX_CACHE_ENTRIES) {
            const first = streamCache.keys().next().value;
            if (first) streamCache.delete(first);
          }
          streamCache.set(cacheKey, fullUrl);
          return fullUrl;
        }
      }
    }
  } catch {}

  // 3. Backend Proxy Fallback (/api/music?action=proxy-stream) for top query
  if (topQueries.length > 0) {
    try {
      const q = topQueries[0];
      const saavnTarget = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&p=1&n=5&q=${encodeURIComponent(q)}`;
      const proxyEndpoint = apiUrl(`/api/music?action=proxy-stream&url=${encodeURIComponent(saavnTarget)}`);
      let res = await fetch(proxyEndpoint, {
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (!res?.ok && !proxyEndpoint.startsWith('http')) {
        res = await fetch(`${PROD_API_ORIGIN}/api/music?action=proxy-stream&url=${encodeURIComponent(saavnTarget)}`, {
          signal: AbortSignal.timeout(8000)
        }).catch(() => null);
      }

      if (res && res.ok) {
        const data = await res.json();
        const results = data?.results || [];
        if (Array.isArray(results) && results.length > 0) {
          for (const item of results) {
            if (!isStrictSaavnMatch(songName, detectedArtist || cleanArtist, item.title, item.subtitle, title)) {
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

  // 4. Client-side direct fetch fallback
  if (topQueries.length > 0) {
    try {
      const q = topQueries[0];
      const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&p=1&n=5&q=${encodeURIComponent(q)}`;
      const res = await fetch(saavnUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(1800)
      }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        const results = data?.results || [];
        if (Array.isArray(results) && results.length > 0) {
          for (const item of results) {
            if (!isStrictSaavnMatch(songName, detectedArtist || cleanArtist, item.title, item.subtitle, title)) {
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

  return null;
}
