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

export async function getLyricsData(
  artist: string,
  title: string,
  duration = 210
): Promise<LyricsResult | null> {
  const cacheKey = `${artist.toLowerCase()}__${title.toLowerCase()}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null;
  }

  try {
    const res = await fetch(
      `/api/music?action=lyrics&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.lyrics) {
        const parsed: LyricsResult = {
          synced: Boolean(data.synced),
          lyrics: data.lyrics,
          lines: parseLyrics(data.lyrics, duration),
          source: data.source || 'Synced Lyrics'
        };
        cache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Primary lyrics API failed, trying direct LRCLIB fallback:', err);
  }

  // Direct client-side fallback to LRCLIB
  try {
    const cleanTitle = title.replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').trim();
    const primaryArtist = artist.split(',')[0].trim();
    const r = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${primaryArtist}`)}`
    );
    if (r.ok) {
      const list = await r.json();
      if (Array.isArray(list) && list.length > 0) {
        const best = list.find((i: any) => i.syncedLyrics) || list[0];
        const raw = best?.syncedLyrics || best?.plainLyrics;
        if (raw) {
          const parsed: LyricsResult = {
            synced: Boolean(best?.syncedLyrics),
            lyrics: raw,
            lines: parseLyrics(raw, duration),
            source: 'WaveSync Lyrics'
          };
          cache.set(cacheKey, parsed);
          return parsed;
        }
      }
    }
  } catch {}

  cache.set(cacheKey, null);
  return null;
}

export async function getLyrics(artist: string, title: string): Promise<string | null> {
  const res = await getLyricsData(artist, title);
  return res?.lyrics || null;
}
