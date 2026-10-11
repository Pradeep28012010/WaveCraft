/**
 * WaveCraft Synchronized & Plain Lyrics Resolution Service.
 * Queries multi-tier providers (LRCLIB exact match, fuzzy search, lyrics.ovh)
 * with fuzzy scoring and duration verification.
 */

import { fetchWithTimeout } from './cache.js';

export function parseTrackMetadata(rawTitle, rawArtist) {
  let title = (rawTitle || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  let artist = (rawArtist || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/ - Topic$/i, '')
    .trim();

  // Strip generic label channels from artist
  const isLabelChannel =
    /^(?:t-series|aditya\s*music|sony\s*music|zee\s*music|saregama|think\s*music|lahari\s*music|junglee\s*music|tips\s*official|yrf|mythri|hombale|speed\s*records|white\s*hill|wavecraft|unknown\s*artist|official\s*channel|records|films|movies)\b/i.test(
      artist
    );
  if (isLabelChannel) {
    artist = '';
  }

  // Remove common YouTube video fluff in parentheses/brackets
  title = title
    .replace(
      /\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*video|lyrical\s*song|video\s*song|full\s*song|4k|8k|hd|audio\s*song|audio|visualizer|remastered|lyrics|prod\s*\..*?|dir\s*\..*?)[\)\]]\s*/gi,
      ' '
    )
    .replace(
      /\s*(?:latest\s*(?:punjabi|hindi|telugu|tamil|bhojpuri|english)?\s*songs?\s*(?:202\d)?|new\s*(?:hindi|punjabi|telugu|tamil|english)?\s*songs?\s*(?:202\d)?)\s*/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  // If title has pipes: e.g., "Song | Movie | Artist" or "New Song | Title | Artist"
  if (title.includes('|')) {
    const pipeParts = title.split('|').map((p) => p.trim()).filter(Boolean);
    if (/new\s*songs?|latest\s*songs?/i.test(pipeParts[0]) && pipeParts[1]) {
      title = pipeParts[1];
      if (!artist && pipeParts[2]) artist = pipeParts[2];
    } else {
      title = pipeParts[0] || title;
      if (!artist && pipeParts.length >= 2) {
        artist = pipeParts[1];
      }
    }
  }

  // Check for "Artist - Title" or "Title - Artist" with space-padded dash
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
        // Standard "Artist - Title" format
        artist = part0;
        title = part1;
      }
    }
  }

  // Clean title: remove "(From ...)", feat, etc.
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

  return { cleanTitle: cleanTitle || title, cleanArtist: cleanArtist || 'YouTube Music', primaryArtist };
}

export function normalizeForMatch(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateMatchScore(queryTitle, queryArtist, candidateTitle, candidateArtist, candidateDuration = 0, targetDuration = 0) {
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
    else if (diff > 45) return 0;
  }

  return titleScore * 0.6 + artistScore * 0.4 + durationBonus;
}

export async function fetchMultiSourceLyrics(rawTitle, rawArtist, duration = 0) {
  const { cleanTitle, cleanArtist, primaryArtist } = parseTrackMetadata(rawTitle, rawArtist);
  if (!cleanTitle) return { synced: false, lyrics: null, source: null };

  // 1. Try LRCLIB exact match (/api/get)
  if (primaryArtist && cleanTitle) {
    try {
      const getParams = new URLSearchParams({
        track_name: cleanTitle,
        artist_name: primaryArtist
      });
      if (duration && duration > 30) {
        getParams.set('duration', Math.round(duration).toString());
      }
      const r1 = await fetchWithTimeout(
        `https://lrclib.net/api/get?${getParams.toString()}`,
        { headers: { 'User-Agent': 'WaveCraft/2.0 (https://wavecraft.app)' } },
        2500
      );
      if (r1.ok) {
        const item = await r1.json();
        const raw = item.syncedLyrics || item.plainLyrics;
        if (raw) {
          return {
            synced: Boolean(item.syncedLyrics),
            lyrics: raw,
            source: item.syncedLyrics ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics',
            verified: true
          };
        }
      }
    } catch {}
  }

  // 2. Try LRCLIB targeted search (/api/search?track_name=...&artist_name=...)
  try {
    const searchUrl = primaryArtist
      ? `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`
      : `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`;

    const r2 = await fetchWithTimeout(
      searchUrl,
      { headers: { 'User-Agent': 'WaveCraft/2.0 (https://wavecraft.app)' } },
      2500
    );
    if (r2.ok) {
      const list = await r2.json();
      if (Array.isArray(list) && list.length > 0) {
        const scored = list
          .map((item) => ({
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
            return {
              synced: Boolean(best.syncedLyrics),
              lyrics: raw,
              source: best.syncedLyrics ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics',
              verified: true
            };
          }
        }
      }
    }
  } catch {}

  // 3. Try plain lyrics lookup (lyrics.ovh) with primaryArtist and cleanTitle
  if (primaryArtist && cleanTitle) {
    try {
      const ovhRes = await fetchWithTimeout(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`,
        {},
        2000
      );
      if (ovhRes.ok) {
        const ovhData = await ovhRes.json();
        if (ovhData?.lyrics && ovhData.lyrics.trim().length > 40) {
          return {
            synced: false,
            lyrics: ovhData.lyrics.trim(),
            source: 'Studio Lyrics',
            verified: true
          };
        }
      }
    } catch {}
  }

  return { synced: false, lyrics: null, source: null };
}
