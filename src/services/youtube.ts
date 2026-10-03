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
        const ytItems: any[] = data.youtube || [];

        const firstYtId = ytItems[0]?.videoId || '';
        const saavnTracks = saavnItems
          .map((item, idx) => mapSaavnItemToTrack(item, ytItems[idx]?.videoId || firstYtId))
          .filter((t): t is Track => t !== null);

        const ytTracks = ytItems.map(mapYouTubeItemToTrack);

        const seenTitles = new Set(saavnTracks.map((t) => t.title.toLowerCase().slice(0, 18)));
        const uniqueYt = ytTracks.filter((t) => !seenTitles.has(t.title.toLowerCase().slice(0, 18)));

        const combined = [...saavnTracks, ...uniqueYt];
        if (combined.length > 0) {
          setBoundedCache(searchCache, cleanKey, combined, MAX_SEARCH_CACHE_ENTRIES);
        }
        return combined;
      }
    } catch (err) {
      console.warn('Primary /api/music search failed, trying fallback:', err);
    }

    const fallbackItems = await fetchDirectSaavnFallback(query);
    const tracks = fallbackItems
      .map((item) => mapSaavnItemToTrack(item))
      .filter((t): t is Track => t !== null);
    if (tracks.length > 0) {
      setBoundedCache(searchCache, cleanKey, tracks, MAX_SEARCH_CACHE_ENTRIES);
    }
    return tracks;
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
