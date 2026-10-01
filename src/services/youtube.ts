import type { Track } from '../types';
import { decryptSaavnUrl, decodeHtmlEntities } from '../utils/saavnDecrypt';
import { DEFAULT_THUMBNAIL } from '../utils/constants';

function mapSaavnItemToTrack(item: any, fallbackYoutubeId = ''): Track | null {
  const enc = item?.more_info?.encrypted_media_url;
  const audioUrl = decryptSaavnUrl(enc);
  if (!audioUrl && !fallbackYoutubeId) return null;

  const rawImage = item.image || DEFAULT_THUMBNAIL;
  const hiResImage = rawImage.replace('150x150', '500x500').replace('50x50', '500x500');

  const primaryArtists = item?.more_info?.artistMap?.primary_artists
    ?.map((a: any) => a.name)
    .filter(Boolean)
    .join(', ');

  const subtitleArtist = item.subtitle ? item.subtitle.split(' - ')[0] : '';
  const artist = decodeHtmlEntities(primaryArtists || subtitleArtist || 'Unknown Artist');
  const title = decodeHtmlEntities(item.title || 'Unknown Track');
  const album = decodeHtmlEntities(item?.more_info?.album || 'Single');
  const duration = Number(item?.more_info?.duration) || 210;

  return {
    id: `saavn_${item.id}`,
    title,
    artist,
    album,
    duration,
    thumbnail: hiResImage,
    thumbnailLarge: hiResImage,
    thumbnailUrl: hiResImage,
    youtubeId: fallbackYoutubeId,
    audioUrl,
    encryptedMediaUrl: enc,
    year: item.year ? Number(item.year) : undefined,
    quality: '320kbps Studio AAC'
  };
}

function cleanYouTubeTitle(raw: string): string {
  let t = decodeHtmlEntities(raw)
    .replace(/\s*[\(\[].*?(official|video|audio|lyric|lyrics|hd|4k|8k|hq|visualizer|full\s*song|from).*?[\)\]]\s*/gi, ' ');

  const pipeParts = t.split('|').map((s) => s.trim()).filter(Boolean);
  if (pipeParts.length > 0) {
    t =
      /^(full\s+video|lyrical|video\s+song|official|4k|8k|audio)/i.test(pipeParts[0]) &&
      pipeParts[0].length < 18 &&
      pipeParts[1]
        ? pipeParts[1]
        : pipeParts[0];
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

function mapYouTubeItemToTrack(v: any): Track {
  const rawTitle = decodeHtmlEntities(v.title || 'Unknown Title');
  const pipeParts = rawTitle.split('|').map((s) => s.trim()).filter(Boolean);
  const cleaned = cleanYouTubeTitle(rawTitle);
  const dashParts = cleaned.split(' - ');
  const title = dashParts.length > 1 ? cleanYouTubeTitle(dashParts.slice(1).join(' - ')) : cleaned;

  const channelAuthor = decodeHtmlEntities(v.author || 'WaveCraft Artist').replace(' - Topic', '');
  const isLabelChannel =
    /t-series|aditya|sony\s*music|zee\s*music|saregama|think\s*music|lahari|junglee|tips|yrf|mythri|hombale|vevo|records|films|movies/i.test(
      channelAuthor
    );

  let artist = dashParts.length > 1 ? dashParts[0].trim() : channelAuthor;
  if (isLabelChannel && pipeParts.length >= 3) {
    artist = pipeParts.slice(1, 3).join(', ');
  }

  const thumb = v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
  const thumbLarge = v.thumbnailLarge || `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`;

  return {
    id: `yt_${v.videoId}`,
    title: title || cleaned || rawTitle,
    artist,
    album: 'WaveCraft Cloud',
    duration: Number(v.lengthSeconds) || 210,
    thumbnail: thumb,
    thumbnailLarge: thumbLarge,
    thumbnailUrl: thumb,
    youtubeId: v.videoId,
    quality: 'Studio Stream'
  };
}

async function fetchDirectSaavnFallback(query: string): Promise<any[]> {
  const target = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=20&p=1&q=${encodeURIComponent(query)}`;
  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?${encodeURIComponent(target)}`
  ];
  for (const url of proxies) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.results)) {
          return data.results.filter(
            (r: unknown): r is Record<string, unknown> =>
              Boolean(r && typeof r === 'object' && 'id' in r && 'title' in r)
          );
        }
      }
    } catch {
      // try next proxy
    }
  }
  return [];
}

const MAX_SEARCH_CACHE_ENTRIES = 120;
const MAX_SUGGESTIONS_CACHE_ENTRIES = 150;

const searchCache = new Map<string, Track[]>();
const inFlightSearch = new Map<string, Promise<Track[]>>();
const suggestionsCache = new Map<string, string[]>();
let cachedTrending: Track[] | null = null;
let inFlightTrending: Promise<Track[]> | null = null;

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
  // Promote in LRU order
  searchCache.delete(cleanKey);
  searchCache.set(cleanKey, hit);
  return hit;
}

function mapItunesItemToTrack(item: any, fallbackAudioUrl = '', fallbackYtId = ''): Track {
  const art = item.artworkUrl100
    ? item.artworkUrl100.replace('100x100bb', '600x600bb').replace('100x100', '600x600')
    : DEFAULT_THUMBNAIL;
  return {
    id: `itunes_${item.trackId}`,
    title: decodeHtmlEntities(item.trackName || 'Unknown Title'),
    artist: decodeHtmlEntities(item.artistName || 'Unknown Artist'),
    album: decodeHtmlEntities(item.collectionName || 'Single'),
    duration: Math.round((Number(item.trackTimeMillis) || 210000) / 1000),
    thumbnail: art,
    thumbnailLarge: art,
    thumbnailUrl: art,
    audioUrl: fallbackAudioUrl || item.previewUrl || '',
    youtubeId: fallbackYtId,
    year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
    quality: '320kbps Studio AAC'
  };
}

async function fetchDirectItunesFallback(query: string): Promise<Track[]> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&entity=song&limit=25&media=music`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.results)) return [];
    return data.results.map((item: any) => mapItunesItemToTrack(item));
  } catch {
    return [];
  }
}

function rankTracksByRelevance(tracks: Track[], rawQuery: string): Track[] {
  const q = rawQuery.toLowerCase().trim();
  const qTokens = q.split(/\s+/).filter(Boolean);

  const getScore = (track: Track): number => {
    let score = 0;
    const title = (track.title || '').toLowerCase().trim();
    const artist = (track.artist || '').toLowerCase().trim();
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

    // 7. Audio stream quality bonus (has direct 320k playable audio)
    if (track.audioUrl) score += 100;
    if (track.youtubeId) score += 40;

    // 8. Sensible track duration (between 1.5 and 7 minutes)
    if (track.duration && track.duration >= 90 && track.duration <= 450) {
      score += 40;
    }

    // 9. Negative penalty for karaoke/covers/sound effects unless specifically asked for
    if (!/cover|karaoke|instrumental|remix/i.test(q)) {
      if (/karaoke|tribute|cover|backing\s*track|instrumental\s*version/i.test(title)) {
        score -= 300;
      }
    }

    return score;
  };

  return [...tracks].sort((a, b) => getScore(b) - getScore(a));
}

function deduplicateAndEnrichTracks(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>();

  for (const track of tracks) {
    const normTitle = track.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18);
    const normArtist = (track.artist || '').split(',')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    const key = `${normTitle}__${normArtist}`;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...track });
    } else {
      // Merge best attributes: keep direct audioUrl from whoever has it
      if (!existing.audioUrl && track.audioUrl) {
        existing.audioUrl = track.audioUrl;
      }
      if (!existing.youtubeId && track.youtubeId) {
        existing.youtubeId = track.youtubeId;
      }
      if ((!existing.thumbnailLarge || existing.thumbnailLarge.includes('hqdefault')) && track.thumbnailLarge) {
        existing.thumbnail = track.thumbnail;
        existing.thumbnailLarge = track.thumbnailLarge;
      }
    }
  }

  return Array.from(seen.values());
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
        const saavnItems: any[] = data.saavn || [];
        const itunesItems: any[] = data.itunes || [];
        const ytItems: any[] = data.youtube || [];

        const firstYtId = ytItems[0]?.videoId || '';
        const saavnTracks = saavnItems
          .map((item, idx) => mapSaavnItemToTrack(item, ytItems[idx]?.videoId || firstYtId))
          .filter((t): t is Track => t !== null);

        const firstSaavnAudio = saavnTracks[0]?.audioUrl || '';
        const itunesTracks = itunesItems.map((item, idx) =>
          mapItunesItemToTrack(item, saavnTracks[idx]?.audioUrl || firstSaavnAudio, ytItems[idx]?.videoId || firstYtId)
        );

        const ytTracks = ytItems.map(mapYouTubeItemToTrack);

        // Combine all 3 high-grade sources: iTunes + JioSaavn + YouTube
        const combined = [...itunesTracks, ...saavnTracks, ...ytTracks];
        const enriched = deduplicateAndEnrichTracks(combined);
        const ranked = rankTracksByRelevance(enriched, query);

        if (ranked.length > 0) {
          setBoundedCache(searchCache, cleanKey, ranked, MAX_SEARCH_CACHE_ENTRIES);
          return ranked;
        }
      }
    } catch (err) {
      console.warn('Primary /api/music search failed, trying multi-source client fallback:', err);
    }

    // Multi-source direct fallback in the browser
    const [itunesFallback, saavnFallback] = await Promise.allSettled([
      fetchDirectItunesFallback(query),
      fetchDirectSaavnFallback(query)
    ]);

    const itunesList = itunesFallback.status === 'fulfilled' ? itunesFallback.value : [];
    const saavnRaw = saavnFallback.status === 'fulfilled' ? saavnFallback.value : [];
    const saavnList = saavnRaw
      .map((item) => mapSaavnItemToTrack(item))
      .filter((t): t is Track => t !== null);

    const fallbackCombined = [...itunesList, ...saavnList];
    const enrichedFallback = deduplicateAndEnrichTracks(fallbackCombined);
    const rankedFallback = rankTracksByRelevance(enrichedFallback, query);

    if (rankedFallback.length > 0) {
      setBoundedCache(searchCache, cleanKey, rankedFallback, MAX_SEARCH_CACHE_ENTRIES);
    }
    return rankedFallback;
  })();

  inFlightSearch.set(cleanKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightSearch.delete(cleanKey);
  }
}

export async function getTrending(_region = 'US'): Promise<Track[]> {
  if (cachedTrending && cachedTrending.length > 0) {
    return cachedTrending;
  }
  if (inFlightTrending) {
    return inFlightTrending;
  }

  inFlightTrending = (async () => {
    try {
      const res = await fetch('/api/music?action=trending');
      if (res.ok) {
        const data = await res.json();
        const saavnItems: any[] = data.saavn || [];
        const tracks = saavnItems
          .map((item) => mapSaavnItemToTrack(item))
          .filter((t): t is Track => t !== null);
        if (tracks.length > 0) {
          cachedTrending = tracks;
          return tracks;
        }
      }
    } catch (err) {
      console.warn('Trending fetch error, falling back to search:', err);
    }

    const fallback = await searchTracks('top global hits 2025');
    if (fallback.length > 0) cachedTrending = fallback;
    return fallback;
  })();

  try {
    return await inFlightTrending;
  } finally {
    inFlightTrending = null;
  }
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
      const sugs = data.suggestions || [];
      setBoundedCache(suggestionsCache, key, sugs, MAX_SUGGESTIONS_CACHE_ENTRIES);
      return sugs;
    }
  } catch {
    // ignore
  }
  return [];
}
