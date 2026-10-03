import type { Track } from '../types';

export function decodeHtmlEntities(str?: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function cleanYouTubeTitle(raw: string): string {
  let t = decodeHtmlEntities(raw)
    .replace(
      /\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*video|lyrical\s*song|video\s*song|full\s*song|4k|8k|hd|audio\s*song|audio|visualizer|remastered|lyrics|prod\s*\..*?|dir\s*\..*?)[\)\]]\s*/gi,
      ' '
    )
    .replace(
      /\s*(?:latest\s*(?:punjabi|hindi|telugu|tamil|bhojpuri|english)?\s*songs?\s*(?:202\d)?|new\s*(?:hindi|punjabi|telugu|tamil|english)?\s*songs?\s*(?:202\d)?)\s*/gi,
      ' '
    );

  const pipeParts = t.split('|').map((s) => s.trim()).filter(Boolean);
  if (pipeParts.length > 0) {
    if (/new\s*songs?|latest\s*songs?/i.test(pipeParts[0]) && pipeParts[1]) {
      t = pipeParts[1];
    } else {
      t =
        /^(full\s+video|lyrical|video\s+song|official|4k|8k|audio)/i.test(pipeParts[0]) &&
        pipeParts[0].length < 18 &&
        pipeParts[1]
          ? pipeParts[1]
          : pipeParts[0];
    }
  }

  return t
    .replace(
      /^(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|official\s+music\s+video|official\s+video|official\s+audio|4k\s+video|8k\s+video|audio\s+song|audio)\s*[:\-–—]?\s*/i,
      ''
    )
    .replace(
      /\s+(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|full\s+audio|8k\s+video|4k\s+video|hd\s+video|official\s+video|official\s+audio)\b.*$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapYouTubeItemToTrack(v: any): Track {
  const rawTitle = decodeHtmlEntities(v.title || 'Unknown Title');
  const pipeParts = rawTitle.split('|').map((s) => s.trim()).filter(Boolean);
  const cleaned = cleanYouTubeTitle(rawTitle);
  const dashParts = cleaned.split(/\s+[-–—]\s+/);
  const title = dashParts.length > 1 ? cleanYouTubeTitle(dashParts.slice(1).join(' - ')) : cleaned;

  const channelAuthor = decodeHtmlEntities(v.author || 'WaveCraft Artist').replace(' - Topic', '');
  const isLabelChannel =
    /t-series|aditya|sony\s*music|zee\s*music|saregama|think\s*music|lahari|junglee|tips|yrf|mythri|hombale|vevo|speed\s*records|white\s*hill|records|films|movies/i.test(
      channelAuthor
    );

  let artist = dashParts.length > 1 ? dashParts[0].trim() : channelAuthor;
  if (isLabelChannel && pipeParts.length >= 2) {
    artist = pipeParts[1].trim();
  }

  const thumb = v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
  const thumbLarge = v.thumbnailLarge || `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`;

  return {
    id: `yt_${v.videoId}`,
    title: title || cleaned || rawTitle,
    artist: artist || 'YouTube Music',
    album: 'WaveCraft Cloud',
    duration: Number(v.lengthSeconds) || Number(v.duration) || 210,
    thumbnail: thumb,
    thumbnailLarge: thumbLarge,
    thumbnailUrl: thumb,
    youtubeId: v.videoId,
    quality: 'Studio Stream'
  };
}

const MAX_SEARCH_CACHE_ENTRIES = 120;
const MAX_SUGGESTIONS_CACHE_ENTRIES = 150;

const searchCache = new Map<string, Track[]>();
const inFlightSearch = new Map<string, Promise<Track[]>>();
const suggestionsCache = new Map<string, string[]>();
let cachedTrending: Track[] | null = null;

function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number) {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, value);
}

export function getCachedTrending(): Track[] | null {
  return cachedTrending;
}

export function getCachedSearch(query: string): Track[] | null {
  const cleanKey = query.trim().toLowerCase();
  const hit = searchCache.get(cleanKey);
  if (!hit) return null;
  searchCache.delete(cleanKey);
  searchCache.set(cleanKey, hit);
  return hit;
}

function normalizeForMatch(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .replace(/\|.*$/, '')
    .replace(
      /^(?:full\s+video\s+song|full\s+video|video\s+song|lyrical|official|audio)\s*[:\-–—]?\s*/i,
      ''
    )
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strict verification helper to resolve audio for on-the-fly tracks
 * (e.g. from albums or unlinked queue items) without picking the wrong song.
 */
export function findStrictTrackMatch(
  targetTitle: string,
  targetArtist: string,
  candidates: Track[],
  targetDuration = 0
): Track | null {
  if (!candidates || candidates.length === 0) return null;

  const normTargetTitle = normalizeForMatch(targetTitle);
  const normTargetArtist = normalizeForMatch(targetArtist);
  const targetTokens = normTargetTitle.split(/\s+/).filter((t) => t.length > 1);
  const artistTokens = normTargetArtist.split(/\s+/).filter((t) => t.length > 2);
  const isTargetInstrumental = /\b(instrumental|karaoke|bgm|piano|flute|guitar)\b/i.test(targetTitle);
  const isTargetCover = /\b(cover|tribute|rendition)\b/i.test(targetTitle);

  let bestMatch: Track | null = null;
  let bestScore = -Infinity;

  for (const cand of candidates) {
    const candTitle = normalizeForMatch(cand.title);
    const candArtist = normalizeForMatch(cand.artist);
    const candCombined = `${candTitle} ${candArtist}`;
    const isCandInstrumental = /\b(instrumental|karaoke|bgm|piano|flute|guitar)\b/i.test(cand.title);
    const isCandCover = /\b(cover|tribute|rendition)\b/i.test(cand.title);

    // Reject instrumental if target is vocal
    if (!isTargetInstrumental && isCandInstrumental) {
      continue;
    }

    // Heavy penalty for fan/amateur covers when looking for original song
    if (!isTargetCover && isCandCover) {
      continue;
    }

    let score = 0;

    // Exact title match
    if (candTitle === normTargetTitle) score += 600;
    else if (candTitle.startsWith(normTargetTitle) || normTargetTitle.startsWith(candTitle)) score += 350;
    else if (candTitle.includes(normTargetTitle) || normTargetTitle.includes(candTitle)) score += 200;

    // Token matching for title
    const matchedTokens = targetTokens.filter((tok) => candCombined.includes(tok));
    score += matchedTokens.length * 80;
    if (targetTokens.length > 0 && matchedTokens.length === targetTokens.length) score += 220;

    // Token matching for artist
    const matchedArtistTokens = artistTokens.filter((tok) => candCombined.includes(tok));
    score += matchedArtistTokens.length * 60;
    if (normTargetArtist && candCombined.includes(normTargetArtist)) score += 160;

    // Penalty if no title tokens match at all
    if (targetTokens.length > 0 && matchedTokens.length === 0) {
      score -= 600;
    }

    // Duration match
    if (targetDuration > 0 && cand.duration > 0) {
      const diff = Math.abs(cand.duration - targetDuration);
      if (diff <= 5) score += 150;
      else if (diff <= 15) score += 80;
      else if (diff <= 35) score += 30;
      else if (diff > 60) score -= 120;
    }

    if (cand.youtubeId) score += 50;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cand;
    }
  }

  return bestScore >= 200 ? bestMatch : null;
}

function rankTracksByRelevance(tracks: Track[], rawQuery: string): Track[] {
  const q = rawQuery.toLowerCase().trim();
  const qTokens = q.split(/\s+/).filter(Boolean);

  const wantsInstrumental = /\b(instrumental|karaoke|backing\s*track|piano|flute|guitar|bgm|violin|sax)\b/i.test(q);
  const wantsCover = /\bcover\b/i.test(q);
  const wantsRemix = /\b(remix|mashup)\b/i.test(q);
  const wantsLofi = /\b(lofi|lo-fi|slowed|reverb|8d)\b/i.test(q);

  const getScore = (track: Track): number => {
    let score = 0;
    const title = (track.title || '').toLowerCase().trim();
    const artist = (track.artist || '').toLowerCase().trim();
    const combined = `${title} ${artist}`;
    const cleanTitle = title.replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').trim();

    // 1. Exact match on title
    if (cleanTitle === q) score += 1200;
    else if (title === q) score += 1000;
    // 2. Starts with query
    else if (cleanTitle.startsWith(q)) score += 600;
    else if (title.startsWith(q)) score += 500;
    // 3. Whole query contained in title
    else if (cleanTitle.includes(q)) score += 350;
    else if (title.includes(q)) score += 300;

    // 4. Exact artist match or starts with
    if (artist === q) score += 800;
    else if (artist.startsWith(q)) score += 400;
    else if (artist.includes(q)) score += 250;

    // 5. Query contains artist name
    if (q.includes(artist) && artist.length > 2) score += 300;

    // 6. Token matching: every token matched in title or artist
    const matchedTokens = qTokens.filter((tok) => cleanTitle.includes(tok) || artist.includes(tok));
    score += matchedTokens.length * 80;
    if (matchedTokens.length === qTokens.length) score += 250;

    // 7. Sensible track duration (between 1.5 and 7 minutes)
    if (track.duration && track.duration >= 90 && track.duration <= 450) {
      score += 40;
    }

    // 8. Instrumental / non-vocal content filter
    if (!wantsInstrumental) {
      if (
        /\b(instrumental|karaoke|backing\s*track|minus\s*one|no\s*vocals?|vocal\s*cut|piano\s*(?:cover|version)|flute\s*(?:cover|version)|guitar\s*(?:cover|version)|violin\s*(?:cover|version)|sax\s*(?:cover|version)|bgm|theme\s*music|background\s*score|shehnai|sitar|veena|bansuri)\b/i.test(
          title
        )
      ) {
        score -= 900;
      }
    }
    if (!wantsCover) {
      if (/\b(tribute|cover\s+by|covered\s+by|cover\s+version)\b/i.test(title)) {
        score -= 500;
      }
      if (/\bcover\b/i.test(title) && !/\bcover\s*art|discover|uncover/i.test(title)) {
        score -= 300;
      }
    }
    if (!wantsRemix) {
      if (/\b(remix|mashup|bootleg)\b/i.test(title)) {
        score -= 250;
      }
    }
    if (!wantsLofi) {
      if (/\b(lofi|lo-fi|slowed|reverb|8d\s*audio|sped\s*up|nightcore|daycore)\b/i.test(title)) {
        score -= 400;
      }
    }

    // 9. Hard penalty for ringtones, sound effects, ASMR, and junk
    if (
      /\b(ringtone|sound\s*effect|sfx|notification|alarm|asmr|status|whatsapp\s*status|short\s*audio)\b/i.test(
        combined
      )
    ) {
      score -= 1200;
    }
    if (track.duration && track.duration < 60) {
      score -= 400;
    }
    if (track.duration && track.duration > 900) {
      score -= 200;
    }

    return score;
  };

  return [...tracks].sort((a, b) => getScore(b) - getScore(a));
}

function deduplicateTracks(tracks: Track[]): Track[] {
  const seenIds = new Set<string>();
  const result: Track[] = [];

  for (const track of tracks) {
    const key = track.youtubeId || track.id;
    if (!key || seenIds.has(key)) continue;
    seenIds.add(key);
    result.push(track);
  }

  return result;
}

export async function searchTracks(query: string, _page = 1): Promise<Track[]> {
  const cleanKey = query.trim().toLowerCase();
  if (!cleanKey) return [];

  const cachedHit = getCachedSearch(cleanKey);
  if (cachedHit) {
    return cachedHit;
  }
  if (inFlightSearch.has(cleanKey)) {
    return inFlightSearch.get(cleanKey)!;
  }

  const requestPromise = (async () => {
    try {
      const res = await fetch(`/api/music?action=search&q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const rawTracks: Track[] = data.tracks || data.youtube || [];
        const deduped = deduplicateTracks(rawTracks);
        const ranked = rankTracksByRelevance(deduped, query);

        if (ranked.length > 0) {
          setBoundedCache(searchCache, cleanKey, ranked, MAX_SEARCH_CACHE_ENTRIES);
          return ranked;
        }
      }
    } catch (err) {
      console.warn('API /api/music search failed, falling back to direct YouTube search:', err);
    }

    // Client-side direct YouTube fallback if /api/music endpoint fails
    try {
      const ytQuery = /song|remix|official|audio|music|album/i.test(query) ? query : `${query} official audio`;
      const directRes = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' }
          },
          query: ytQuery
        })
      });
      if (directRes.ok) {
        const data = await directRes.json();
        const sections =
          data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
        const rawItems: any[] = [];
        for (const sec of sections) {
          const items = sec?.itemSectionRenderer?.contents || [];
          for (const item of items) {
            const v = item.videoRenderer;
            if (v && v.videoId) {
              const lengthText = v.lengthText?.simpleText || '';
              const parts = lengthText.split(':').map(Number);
              let seconds = 0;
              if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
              else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
              rawItems.push({
                videoId: v.videoId,
                title: v.title?.runs?.[0]?.text || '',
                author: v.ownerText?.runs?.[0]?.text || '',
                lengthSeconds: seconds || 210
              });
            }
          }
        }
        const mapped = rawItems.map(mapYouTubeItemToTrack);
        const deduped = deduplicateTracks(mapped);
        const ranked = rankTracksByRelevance(deduped, query);
        if (ranked.length > 0) {
          setBoundedCache(searchCache, cleanKey, ranked, MAX_SEARCH_CACHE_ENTRIES);
          return ranked;
        }
      }
    } catch {}

    return [];
  })();

  inFlightSearch.set(cleanKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightSearch.delete(cleanKey);
  }
}

export interface SpotifyCategory {
  key: string;
  name: string;
  genre: string;
  icon: string;
}

export const SPOTIFY_TRENDING_CATEGORIES: SpotifyCategory[] = [
  { key: 'global', name: 'Today’s Top Hits', genre: 'Global Pop', icon: '🌍' },
  { key: 'top-50-global', name: 'Top 50 Global', genre: 'Global Charts', icon: '🔥' },
  { key: 'india', name: 'Top 50 India', genre: 'All-India Charts', icon: '🇮🇳' },
  { key: 'hindi', name: 'Hot Hits Hindi', genre: 'Bollywood & Hindi', icon: '✨' },
  { key: 'hiphop', name: 'RapCaviar', genre: 'Hip-Hop & Trap', icon: '🎤' },
  { key: 'pop', name: 'Pop Rising', genre: 'Viral & Pop', icon: '⚡' },
  { key: 'kpop', name: 'K-Pop ON!', genre: 'K-Pop', icon: '🇰🇷' },
  { key: 'latin', name: 'Viva Latino', genre: 'Latin & Reggaeton', icon: '💃' },
  { key: 'dance', name: 'mint (EDM)', genre: 'Dance & EDM', icon: '🎧' },
  { key: 'rock', name: 'Rock Classics', genre: 'Rock Anthems', icon: '🎸' },
  { key: 'indie', name: 'Ultimate Indie', genre: 'Indie & Alt', icon: '🌿' },
  { key: 'country', name: 'Hot Country', genre: 'Country Hits', icon: '🤠' },
  { key: 'usa', name: 'Top 50 USA', genre: 'USA Charts', icon: '🇺🇸' },
  { key: 'uk', name: 'Top 50 UK', genre: 'UK Charts', icon: '🇬🇧' },
  { key: 'mood', name: 'Mood Booster', genre: 'Feel Good', icon: '☀️' }
];

const trendingCategoryCache = new Map<string, Track[]>();

export async function getTrending(category = 'global'): Promise<Track[]> {
  const cached = trendingCategoryCache.get(category);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const res = await fetch(`/api/music?action=trending&category=${encodeURIComponent(category)}`);
    if (res.ok) {
      const data = await res.json();
      const tracks: Track[] = data.tracks || data.youtube || [];
      if (tracks.length > 0) {
        trendingCategoryCache.set(category, tracks);
        if (category === 'global') cachedTrending = tracks;
        return tracks;
      }
    }
  } catch (err) {
    console.warn('Trending fetch error, falling back to search:', err);
  }

  const fallback = await searchTracks('top global hits 2025');
  if (fallback.length > 0) {
    trendingCategoryCache.set(category, fallback);
  }
  return fallback;
}

export async function getVideoDetails(videoId: string): Promise<Track | null> {
  const results = await searchTracks(videoId);
  return results[0] || null;
}

export async function getRelatedVideos(videoId: string): Promise<Track[]> {
  return searchTracks(videoId);
}

export async function searchSuggestions(query: string): Promise<string[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  if (suggestionsCache.has(key)) {
    const hit = suggestionsCache.get(key)!;
    suggestionsCache.delete(key);
    suggestionsCache.set(key, hit);
    return hit;
  }

  try {
    const res = await fetch(`/api/music?action=suggestions&q=${encodeURIComponent(query.trim())}`);
    if (res.ok) {
      const data = await res.json();
      const sugs: string[] = data.suggestions || [];
      setBoundedCache(suggestionsCache, key, sugs, MAX_SUGGESTIONS_CACHE_ENTRIES);
      return sugs;
    }
  } catch {
    // client-side direct suggest fallback
    try {
      const fallbackRes = await fetch(
        `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query.trim())}`
      );
      if (fallbackRes.ok) {
        const d = await fallbackRes.json();
        const sugs = Array.isArray(d?.[1]) ? (d[1] as string[]).slice(0, 10) : [];
        setBoundedCache(suggestionsCache, key, sugs, MAX_SUGGESTIONS_CACHE_ENTRIES);
        return sugs;
      }
    } catch {}
  }
  return [];
}
