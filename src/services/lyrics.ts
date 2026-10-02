import type { LyricLine } from '../types';

export interface LyricsResult {
  synced: boolean;
  lyrics: string;
  lines: LyricLine[];
  source: string;
}

const cache = new Map<string, LyricsResult | null>();

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

function extractCleanSongTitle(rawTitle: string): string {
  let t = (rawTitle || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&amp;/g, ' ')
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ');

  const pipeParts = t
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (pipeParts.length > 0) {
    t =
      /^(full\s+video|lyrical|video\s+song|official|4k|8k|audio)/i.test(pipeParts[0]) &&
      pipeParts[0].length < 18 &&
      pipeParts[1]
        ? pipeParts[1]
        : pipeParts[0];
  }

  t = t
    .replace(
      /^(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|official\s+music\s+video|official\s+video|official\s+audio|4k\s+video|8k\s+video|audio\s+song|audio)\s*[:\-–—]?\s*/i,
      ''
    )
    .replace(
      /\s+(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|full\s+audio|8k\s+video|4k\s+video|hd\s+video|official\s+video|official\s+audio|video)\b.*$/i,
      ''
    )
    .replace(/\s*[-–—]\s*(?:from|feat|ft|telugu|hindi|tamil|malayalam|kannada)\b.*$/i, '')
    .replace(/feat\..*/gi, '')
    .replace(/ft\..*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (t.includes(' - ')) {
    const dashParts = t.split(' - ').map((s) => s.trim()).filter(Boolean);
    if (dashParts.length >= 2) {
      t = dashParts[0];
    }
  }

  return t || rawTitle.trim();
}

function extractCleanArtist(rawArtist: string): string {
  const first = (rawArtist || '')
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .split(',')[0]
    .split('&')[0]
    .split(/feat\.|ft\./i)[0]
    .trim();

  if (
    /t-series|aditya|sony\s*music|zee\s*music|saregama|think\s*music|lahari|junglee|tips|yrf|mythri|hombale|vevo|wavecraft|unknown|official|channel|records|films|movies/i.test(
      first
    )
  ) {
    return '';
  }
  return first;
}

export async function getLyricsData(
  artist: string,
  title: string,
  duration = 210
): Promise<LyricsResult | null> {
  const cleanTitle = extractCleanSongTitle(title);
  const cleanArtist = extractCleanArtist(artist);
  const cacheKey = `v2__${cleanArtist.toLowerCase()}__${cleanTitle.toLowerCase()}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null;
  }

  // 1. Direct fast browser query to LRCLIB (cleanTitle + cleanArtist, then cleanTitle only)
  const queriesToTry = cleanArtist ? [`${cleanTitle} ${cleanArtist}`, cleanTitle] : [cleanTitle];
  for (const q of queriesToTry) {
    if (!q) continue;
    try {
      const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list) && list.length > 0) {
          const target = cleanTitle.toLowerCase();
          const best =
            list.find(
              (i: any) =>
                i.syncedLyrics &&
                (i.trackName?.toLowerCase().includes(target) ||
                  target.includes(i.trackName?.toLowerCase() || '___'))
            ) ||
            list.find((i: any) => i.syncedLyrics) ||
            list.find(
              (i: any) =>
                i.plainLyrics &&
                (i.trackName?.toLowerCase().includes(target) ||
                  target.includes(i.trackName?.toLowerCase() || '___'))
            ) ||
            list[0];

          const raw = best?.syncedLyrics || best?.plainLyrics;
          if (raw) {
            const parsed: LyricsResult = {
              synced: Boolean(best?.syncedLyrics),
              lyrics: raw,
              lines: parseLyrics(raw, duration),
              source: best?.syncedLyrics ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics'
            };
            cache.set(cacheKey, parsed);
            return parsed;
          }
        }
      }
    } catch {}
  }

  // 2. Fallback to backend /api/music?action=lyrics (Saavn official lyrics + lyrics.ovh)
  try {
    const res = await fetch(
      `/api/music?action=lyrics&title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.lyrics) {
        const parsed: LyricsResult = {
          synced: Boolean(data.synced),
          lyrics: data.lyrics,
          lines: parseLyrics(data.lyrics, duration),
          source: data.source || 'Studio Lyrics'
        };
        cache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Secondary lyrics API fallback failed:', err);
  }

  cache.set(cacheKey, null);
  return null;
}

export async function getLyrics(artist: string, title: string): Promise<string | null> {
  const res = await getLyricsData(artist, title);
  return res?.lyrics || null;
}
