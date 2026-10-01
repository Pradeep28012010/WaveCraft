import type { LyricLine } from '../types';

export interface LyricsResult {
  synced: boolean;
  lyrics: string;
  lines: LyricLine[];
  source: string;
  verified?: boolean;
}

const MAX_CACHE_SIZE = 150;
const cache = new Map<string, LyricsResult | null>();

function setBoundedCache(key: string, value: LyricsResult | null) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, value);
}

export function parseLyrics(rawLyrics: string, totalDuration = 210): LyricLine[] {
  if (!rawLyrics) return [];

  const rawLines = rawLyrics.split('\n');
  const result: LyricLine[] = [];
  let hasTimestamps = false;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\[(ar|ti|al|au|length|by|re|ve):.*\]$/i.test(trimmed)) continue;

    const timestampMatch = trimmed.match(/^\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\](.*)/);
    if (timestampMatch) {
      hasTimestamps = true;
      const minutes = parseInt(timestampMatch[1], 10);
      const seconds = parseFloat(timestampMatch[2]);
      const text = timestampMatch[3].trim();
      if (text) {
        result.push({
          time: minutes * 60 + seconds,
          text
        });
      }
    } else {
      result.push({
        time: -1,
        text: trimmed
      });
    }
  }

  // If plain lyrics without timestamps, distribute estimated times across song duration
  if (!hasTimestamps && result.length > 0) {
    const step = Math.max(3, (totalDuration * 0.88) / result.length);
    return result.map((item, idx) => ({
      time: idx * step,
      text: item.text
    }));
  }

  return result;
}

/**
 * Intelligent music title and artist metadata extractor
 * Handles YouTube "Artist - Title", movie tags, labels, VEVO channels, etc.
 */
export function parseTrackMetadata(rawTitle: string, rawArtist: string): {
  cleanTitle: string;
  cleanArtist: string;
  primaryArtist: string;
} {
  let title = (rawTitle || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

  let artist = (rawArtist || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

  // Strip generic label channels from artist
  const isLabelChannel =
    /^(?:t-series|aditya\s*music|sony\s*music|zee\s*music|saregama|think\s*music|lahari\s*music|junglee\s*music|tips\s*official|yrf|mythri|hombale|wavecraft|unknown\s*artist|official\s*channel|records|films|movies)\b/i.test(
      artist
    );
  if (isLabelChannel) {
    artist = '';
  }

  // Remove common YouTube video fluff in parentheses/brackets
  title = title
    .replace(
      /\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*video|video\s*song|full\s*song|4k|8k|hd|audio|visualizer|remastered|lyrics)[\)\]]\s*/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  // If title has pipes: e.g., "Song | Movie | Artist"
  if (title.includes('|')) {
    const pipeParts = title.split('|').map((p) => p.trim()).filter(Boolean);
    title = pipeParts[0] || title;
  }

  // Check for "Artist - Title" or "Title - Artist" with space-padded dash (protects hyphenated names like Jay-Z, Spider-Man)
  if (/\s+[-–—]\s+/.test(title)) {
    const parts = title.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const part0 = parts[0];
      const part1 = parts.slice(1).join(' - ');

      const normArtist = artist.toLowerCase().replace(/vevo|official/gi, '').trim();
      const norm0 = part0.toLowerCase();
      const norm1 = part1.toLowerCase();

      if (normArtist && (norm0.includes(normArtist) || normArtist.includes(norm0))) {
        artist = part0;
        title = part1;
      } else if (normArtist && (norm1.includes(normArtist) || normArtist.includes(norm1))) {
        artist = part1;
        title = part0;
      } else {
        // Standard YouTube convention is "Artist - Title"
        artist = part0;
        title = part1;
      }
    }
  }

  // Clean title: remove movie tags, "(From ...)", feat, etc.
  let cleanTitle = title
    .replace(/\s*[\(\[](?:from\s+.*?|feat\..*?|ft\..*?)[\)\]]/gi, '')
    .replace(/\s*[-–—]\s*(?:from|feat|ft|telugu|hindi|tamil|malayalam|kannada)\b.*$/i, '')
    .replace(/\s+feat\..*$/i, '')
    .replace(/\s+ft\..*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  cleanTitle = cleanTitle.replace(/^["']|["']$/g, '').trim();

  let cleanArtist = (artist || '')
    .replace(/vevo$/i, '')
    .replace(/official$/i, '')
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const primaryArtist = cleanArtist
    .split(/[,&/]|(?:\s+feat\.?\s+)|\s+ft\.?\s+/i)[0]
    .trim();

  return { cleanTitle: cleanTitle || title, cleanArtist, primaryArtist };
}

function normalizeForMatch(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strict similarity scoring algorithm
 * Prevents returning lyrics from a different track or artist.
 */
export function calculateMatchScore(
  queryTitle: string,
  queryArtist: string,
  candidateTitle: string,
  candidateArtist: string,
  candidateDuration = 0,
  targetDuration = 0
): number {
  const normQTitle = normalizeForMatch(queryTitle);
  const normCTitle = normalizeForMatch(candidateTitle);
  const normQArtist = normalizeForMatch(queryArtist);
  const normCArtist = normalizeForMatch(candidateArtist);

  if (!normQTitle || !normCTitle) return 0;

  // Title match scoring
  let titleScore = 0;
  if (normQTitle === normCTitle) {
    titleScore = 1.0;
  } else if (normCTitle.startsWith(normQTitle) || normQTitle.startsWith(normCTitle)) {
    titleScore = 0.88;
  } else {
    const qTokens = normQTitle.split(' ').filter((t) => t.length > 1);
    const cTokens = new Set(normCTitle.split(' ').filter((t) => t.length > 1));
    const matched = qTokens.filter((t) => cTokens.has(t));
    if (qTokens.length > 0 && matched.length === qTokens.length) {
      titleScore = 0.82;
    } else if (qTokens.length > 0 && matched.length / qTokens.length >= 0.7) {
      titleScore = 0.65;
    } else {
      return 0; // Strict rejection on title mismatch
    }
  }

  // Artist match scoring
  let artistScore = 0;
  if (!normQArtist) {
    // If no artist info available, require exact title match
    artistScore = titleScore === 1.0 ? 0.6 : 0;
  } else if (normCArtist === normQArtist) {
    artistScore = 1.0;
  } else if (normCArtist.includes(normQArtist) || normQArtist.includes(normCArtist)) {
    artistScore = 0.92;
  } else {
    const qArtistTokens = normQArtist.split(' ').filter((t) => t.length > 2);
    const cArtistTokens = new Set(normCArtist.split(' ').filter((t) => t.length > 2));
    const matchedArtists = qArtistTokens.filter((t) => cArtistTokens.has(t));
    if (qArtistTokens.length > 0 && matchedArtists.length >= Math.min(2, qArtistTokens.length)) {
      artistScore = 0.82;
    } else {
      return 0; // Strict rejection on artist mismatch
    }
  }

  // Duration verification
  let durationBonus = 0;
  if (candidateDuration && targetDuration && targetDuration > 30) {
    const diff = Math.abs(candidateDuration - targetDuration);
    if (diff <= 5) durationBonus = 0.2;
    else if (diff <= 15) durationBonus = 0.1;
    else if (diff > 45) return 0; // Live, extended remix, or completely different cut
  }

  return titleScore * 0.6 + artistScore * 0.4 + durationBonus;
}

export async function getLyricsData(
  artist: string,
  title: string,
  duration = 210
): Promise<LyricsResult | null> {
  const { cleanTitle, cleanArtist, primaryArtist } = parseTrackMetadata(title, artist);
  if (!cleanTitle) return null;

  const cacheKey = `v3__${cleanArtist.toLowerCase()}__${cleanTitle.toLowerCase()}__${Math.round(duration)}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null;
  }

  // 1. Exact LRCLIB lookup endpoint (/api/get)
  if (primaryArtist && cleanTitle) {
    try {
      const getParams = new URLSearchParams({
        track_name: cleanTitle,
        artist_name: primaryArtist
      });
      if (duration && duration > 30) {
        getParams.set('duration', Math.round(duration).toString());
      }
      const r = await fetch(`https://lrclib.net/api/get?${getParams.toString()}`);
      if (r.ok) {
        const item = await r.json();
        const raw = item.syncedLyrics || item.plainLyrics;
        if (raw) {
          const result: LyricsResult = {
            synced: Boolean(item.syncedLyrics),
            lyrics: raw,
            lines: parseLyrics(raw, duration),
            source: item.syncedLyrics ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics',
            verified: true
          };
          setBoundedCache(cacheKey, result);
          return result;
        }
      }
    } catch {}
  }

  // 2. Targeted LRCLIB search (/api/search?track_name=...&artist_name=...)
  try {
    const searchUrl = primaryArtist
      ? `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`
      : `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`;

    const r = await fetch(searchUrl);
    if (r.ok) {
      const list = await r.json();
      if (Array.isArray(list) && list.length > 0) {
        const scored = list
          .map((item: any) => ({
            item,
            score: calculateMatchScore(
              cleanTitle,
              primaryArtist || cleanArtist,
              item.trackName,
              item.artistName,
              item.duration,
              duration
            )
          }))
          .filter((c) => c.score >= 0.70)
          .sort((a, b) => {
            if (Boolean(b.item.syncedLyrics) !== Boolean(a.item.syncedLyrics)) {
              return b.item.syncedLyrics ? 1 : -1;
            }
            return b.score - a.score;
          });

        if (scored.length > 0) {
          const best = scored[0].item;
          const raw = best.syncedLyrics || best.plainLyrics;
          if (raw) {
            const result: LyricsResult = {
              synced: Boolean(best.syncedLyrics),
              lyrics: raw,
              lines: parseLyrics(raw, duration),
              source: best.syncedLyrics ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics',
              verified: true
            };
            setBoundedCache(cacheKey, result);
            return result;
          }
        }
      }
    }
  } catch {}

  // 3. Backend Fallback (/api/music?action=lyrics: JioSaavn Official Lyrics + LRCLIB + Lyrics.ovh)
  try {
    const backendUrl = `/api/music?action=lyrics&title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(primaryArtist || cleanArtist)}&duration=${Math.round(duration)}`;
    const res = await fetch(backendUrl);
    if (res.ok) {
      const data = await res.json();
      if (data?.lyrics) {
        const result: LyricsResult = {
          synced: Boolean(data.synced),
          lyrics: data.lyrics,
          lines: parseLyrics(data.lyrics, duration),
          source: data.source || 'Studio Lyrics',
          verified: true
        };
        setBoundedCache(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('Backend lyrics fallback failed:', err);
  }

  // 4. Strict Rejection: Never return unverified lyrics from unrelated songs
  setBoundedCache(cacheKey, null);
  return null;
}

export async function getLyrics(artist: string, title: string): Promise<string | null> {
  const res = await getLyricsData(artist, title);
  return res?.lyrics || null;
}
