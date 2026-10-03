import type { LyricLine } from '../types';

export interface LyricsCandidate {
  id: string | number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  synced: boolean;
  lyrics: string;
  lines: LyricLine[];
  scriptType: 'Devanagari' | 'Latin' | 'Native';
  durationDiff: number;
  source: string;
  score: number;
}

export interface LyricsResult {
  synced: boolean;
  lyrics: string;
  lines: LyricLine[];
  source: string;
  candidates?: LyricsCandidate[];
  activeCandidateId?: string | number;
}

const cache = new Map<string, LyricsResult | null>();

export function getLyricsOffsetKey(artist: string, title: string): string {
  const cleanTitle = extractCleanSongTitle(title).toLowerCase();
  const cleanArtist = extractCleanArtist(artist).toLowerCase();
  return `wavecraft_lrc_offset_${cleanArtist}__${cleanTitle}`;
}

export function getSavedLyricsOffset(artist: string, title: string): number {
  try {
    const key = getLyricsOffsetKey(artist, title);
    const val = localStorage.getItem(key);
    if (val !== null) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && isFinite(parsed)) return parsed;
    }
  } catch {}
  return 0;
}

export function saveLyricsOffset(artist: string, title: string, offset: number): void {
  try {
    const key = getLyricsOffsetKey(artist, title);
    if (Math.abs(offset) < 0.05) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, offset.toFixed(2));
    }
  } catch {}
}

export function detectScriptType(text: string): 'Devanagari' | 'Latin' | 'Native' {
  if (/[\u0900-\u097F]/.test(text)) return 'Devanagari';
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return 'Native';
  if (/[\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(text)) return 'Native';
  if (/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(text)) return 'Native';
  return 'Latin';
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

export function extractCleanSongTitle(rawTitle: string): string {
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

export function extractCleanArtist(rawArtist: string): string {
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
  const cacheKey = `v3__${cleanArtist.toLowerCase()}__${cleanTitle.toLowerCase()}__${Math.round(duration)}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null;
  }

  // 1. Direct fast browser query to LRCLIB (cleanTitle + cleanArtist, then cleanTitle only)
  const queriesToTry = cleanArtist ? [`${cleanTitle} ${cleanArtist}`, cleanTitle] : [cleanTitle];
  const allCandidates: LyricsCandidate[] = [];

  for (const q of queriesToTry) {
    if (!q) continue;
    try {
      const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list) && list.length > 0) {
          const target = cleanTitle.toLowerCase();
          for (const item of list) {
            const raw = item.syncedLyrics || item.plainLyrics;
            if (!raw || typeof raw !== 'string') continue;
            if (allCandidates.some((c) => String(c.id) === String(item.id))) continue;

            let score = 0;
            const isSynced = Boolean(item.syncedLyrics);
            if (isSynced) score += 600;

            const tName = (item.trackName || '').toLowerCase();
            const aName = (item.artistName || '').toLowerCase();

            if (tName === target) score += 350;
            else if (tName.includes(target) || target.includes(tName)) score += 180;

            if (cleanArtist && aName.includes(cleanArtist.toLowerCase())) score += 120;

            // Penalize remixes, mashups, instrumental unless query explicitly mentions them
            if (
              /remix|mashup|sped up|slowed|lofi|acoustic|live|cover/i.test(tName) &&
              !/remix|mashup|sped|slowed|lofi|acoustic|live|cover/i.test(target)
            ) {
              score -= 260;
            }
            if (/\(future bass\)|\(trap\)/i.test(tName)) score -= 150;
            if (/pagalworld|mr-jatt|dj/i.test(tName + ' ' + aName)) score -= 50;

            // Duration match scoring (punish video intro offsets that differ from audio duration)
            const itemDur = item.duration ? Number(item.duration) : 0;
            let durDiff = 0;
            if (itemDur > 0 && duration > 0) {
              durDiff = Math.abs(itemDur - duration);
              score += Math.max(-250, 220 - durDiff * 9);
            }

            const parsedLines = parseLyrics(raw, duration);
            const script = detectScriptType(raw);

            allCandidates.push({
              id: item.id,
              trackName: item.trackName || cleanTitle,
              artistName: item.artistName || cleanArtist,
              albumName: item.albumName,
              duration: itemDur,
              synced: isSynced,
              lyrics: raw,
              lines: parsedLines,
              scriptType: script,
              durationDiff: durDiff,
              source: isSynced ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics',
              score
            });
          }
        }
      }
    } catch {}
  }

  if (allCandidates.length > 0) {
    allCandidates.sort((a, b) => b.score - a.score);
    const best = allCandidates[0];
    const parsed: LyricsResult = {
      synced: best.synced,
      lyrics: best.lyrics,
      lines: best.lines,
      source: best.source,
      candidates: allCandidates.slice(0, 8),
      activeCandidateId: best.id
    };
    cache.set(cacheKey, parsed);
    return parsed;
  }

  // 2. Fallback to backend /api/music?action=lyrics (LRCLIB targeted + lyrics.ovh)
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
          source: data.source || 'Studio Lyrics',
          candidates: [],
          activeCandidateId: 'backend-fallback'
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
