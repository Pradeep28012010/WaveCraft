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

/**
 * Normalize a track title for fuzzy comparison:
 * strips parenthetical suffixes, pipe segments, common prefixes, and lowercases.
 */
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
 * Find the best-matching YouTube video for a given track by comparing
 * normalized title + artist text similarity instead of array position.
 */
function findBestYouTubeMatch(
  trackTitle: string,
  trackArtist: string,
  trackDuration: number,
  ytItems: any[]
): string {
  if (ytItems.length === 0) return '';

  const normTitle = normalizeForMatch(trackTitle);
  const normArtist = normalizeForMatch(trackArtist);
  const titleTokens = normTitle.split(/\s+/).filter((t) => t.length > 1);

  const isTargetInstrumental = /\b(instrumental|karaoke|backing|piano|flute|guitar|bgm)\b/i.test(trackTitle);

  let bestId = '';
  let bestScore = -Infinity;

  for (const yt of ytItems) {
    const ytNormTitle = normalizeForMatch(yt.title || '');
    const ytNormAuthor = normalizeForMatch(yt.author || '');
    const ytCombined = `${ytNormTitle} ${ytNormAuthor}`;

    // Reject instrumental / karaoke videos when searching for vocal tracks
    const isYtInstrumental = /\b(instrumental|karaoke|backing\s*track|piano\s*(?:cover|version)|flute|guitar\s*cover|violin|cover\s*version|minus\s*one|no\s*vocal|ringtone|bgm)\b/i.test(
      ytCombined
    );
    if (!isTargetInstrumental && isYtInstrumental) {
      continue;
    }

    let score = 0;

    // Exact normalized title match
    if (ytNormTitle === normTitle) score += 500;
    else if (ytNormTitle.startsWith(normTitle) || normTitle.startsWith(ytNormTitle)) score += 350;
    else if (ytNormTitle.includes(normTitle) || normTitle.includes(ytNormTitle)) score += 250;

    // Token overlap scoring
    const matchedTokens = titleTokens.filter((tok) => ytCombined.includes(tok));
    score += matchedTokens.length * 70;
    if (titleTokens.length > 0 && matchedTokens.length === titleTokens.length) score += 200;

    // Artist match
    if (normArtist && ytCombined.includes(normArtist)) score += 180;

    // Duration proximity bonus (closer duration = better match)
    const ytDur = Number(yt.lengthSeconds) || 0;
    if (ytDur > 0 && trackDuration > 0) {
      const diff = Math.abs(ytDur - trackDuration);
      if (diff <= 5) score += 150;
      else if (diff <= 15) score += 80;
      else if (diff <= 30) score += 30;
      else if (diff > 60) score -= 120;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = yt.videoId;
    }
  }

  // Strictly require high-confidence score (>= 220). Never fallback to random ytItems[0]!
  return bestScore >= 220 ? bestId : '';
}

/**
 * Find the best-matching Saavn audioUrl for a given iTunes track by comparing
 * normalized title + artist text similarity instead of array position.
 */
function findBestSaavnAudioMatch(
  trackTitle: string,
  trackArtist: string,
  trackDuration: number,
  saavnTracks: Track[]
): string {
  if (saavnTracks.length === 0) return '';

  const normTitle = normalizeForMatch(trackTitle);
  const normArtist = normalizeForMatch(trackArtist);
  const titleTokens = normTitle.split(/\s+/).filter((t) => t.length > 1);

  const isTargetInstrumental = /\b(instrumental|karaoke|backing|piano|flute|guitar|bgm)\b/i.test(trackTitle);

  let bestUrl = '';
  let bestScore = -Infinity;

  for (const st of saavnTracks) {
    if (!st.audioUrl) continue;

    const stNormTitle = normalizeForMatch(st.title);
    const stNormArtist = normalizeForMatch(st.artist);
    const stCombined = `${stNormTitle} ${stNormArtist}`;

    const isSaavnInstrumental = /\b(instrumental|karaoke|backing|piano|flute|guitar|bgm|minus\s*one)\b/i.test(stCombined);
    if (!isTargetInstrumental && isSaavnInstrumental) {
      continue;
    }

    let score = 0;

    if (stNormTitle === normTitle) score += 500;
    else if (stNormTitle.startsWith(normTitle) || normTitle.startsWith(stNormTitle)) score += 350;
    else if (stNormTitle.includes(normTitle) || normTitle.includes(stNormTitle)) score += 250;

    const matchedTokens = titleTokens.filter((tok) => stCombined.includes(tok));
    score += matchedTokens.length * 70;
    if (titleTokens.length > 0 && matchedTokens.length === titleTokens.length) score += 200;

    if (normArtist && stCombined.includes(normArtist)) score += 180;

    const diff = Math.abs((st.duration || 0) - trackDuration);
    if (diff <= 5) score += 120;
    else if (diff <= 15) score += 60;
    else if (diff > 60) score -= 100;

    if (score > bestScore) {
      bestScore = score;
      bestUrl = st.audioUrl;
    }
  }

  // Require high-confidence score (>= 220). Never guess randomly!
  return bestScore >= 220 ? bestUrl : '';
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
  const isTargetInstrumental = /\b(instrumental|karaoke|bgm|piano|flute|guitar)\b/i.test(targetTitle);

  let bestMatch: Track | null = null;
  let bestScore = -Infinity;

  for (const cand of candidates) {
    const candTitle = normalizeForMatch(cand.title);
    const candArtist = normalizeForMatch(cand.artist);
    const candCombined = `${candTitle} ${candArtist}`;
    const isCandInstrumental = /\b(instrumental|karaoke|bgm|piano|flute|guitar|cover)\b/i.test(cand.title);

    // Reject instrumental if target is vocal
    if (!isTargetInstrumental && isCandInstrumental) {
      continue;
    }

    let score = 0;

    // Exact title match
    if (candTitle === normTargetTitle) score += 600;
    else if (candTitle.startsWith(normTargetTitle) || normTargetTitle.startsWith(candTitle)) score += 350;
    else if (candTitle.includes(normTargetTitle) || normTargetTitle.includes(candTitle)) score += 200;

    // Token matching
    const matchedTokens = targetTokens.filter((tok) => candCombined.includes(tok));
    score += matchedTokens.length * 70;
    if (targetTokens.length > 0 && matchedTokens.length === targetTokens.length) score += 200;

    // Artist matching
    if (normTargetArtist && candCombined.includes(normTargetArtist)) score += 150;

    // Duration match
    if (targetDuration > 0 && cand.duration > 0) {
      const diff = Math.abs(cand.duration - targetDuration);
      if (diff <= 5) score += 150;
      else if (diff <= 15) score += 80;
      else if (diff <= 35) score += 30;
      else if (diff > 60) score -= 120;
    }

    // Has playable stream bonus
    if (cand.audioUrl) score += 60;
    if (cand.youtubeId) score += 30;

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

  // Detect if the user explicitly wants instrumental/karaoke/cover/remix
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

    // 7. Audio stream quality bonus (has direct 320k playable audio)
    if (track.audioUrl) score += 100;
    if (track.youtubeId) score += 40;

    // 8. Sensible track duration (between 1.5 and 7 minutes)
    if (track.duration && track.duration >= 90 && track.duration <= 450) {
      score += 40;
    }

    // 9. Comprehensive instrumental / non-vocal content filter
    // Heavily penalize instrumental/karaoke/covers/sound effects/ringtones UNLESS user explicitly asked
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

    // 10. Hard penalty for ringtones, sound effects, ASMR, and junk
    if (
      /\b(ringtone|sound\s*effect|sfx|notification|alarm|asmr|status|whatsapp\s*status|short\s*audio)\b/i.test(
        combined
      )
    ) {
      score -= 1200;
    }
    // Very short tracks (< 60s) are likely ringtones/previews
    if (track.duration && track.duration < 60) {
      score -= 400;
    }
    // Very long tracks (> 15 min) are likely compilations/mixes
    if (track.duration && track.duration > 900) {
      score -= 200;
    }

    return score;
  };

  return [...tracks].sort((a, b) => getScore(b) - getScore(a));
}

function deduplicateAndEnrichTracks(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>();

  for (const track of tracks) {
    const normTitle = normalizeForMatch(track.title);
    const normArtist = normalizeForMatch((track.artist || '').split(',')[0]);
    const isInst = /\b(instrumental|karaoke|bgm|piano|flute|guitar|remix|lofi)\b/i.test(track.title);
    const key = `${normTitle}__${normArtist}__${isInst ? 'inst' : 'vocal'}`;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...track });
    } else {
      // Do not merge if durations differ drastically (> 35s) — they are different versions!
      if (existing.duration && track.duration && Math.abs(existing.duration - track.duration) > 35) {
        seen.set(`${key}_${Math.round(track.duration / 30)}`, { ...track });
        continue;
      }

      // Merge best attributes: keep direct audioUrl from whoever has it
      if (!existing.audioUrl && track.audioUrl) {
        existing.audioUrl = track.audioUrl;
      }

      // If existing had an unverified youtubeId, but track is a direct YouTube result, take genuine ID
      if (track.id.startsWith('yt_') && track.youtubeId) {
        existing.youtubeId = track.youtubeId;
      } else if (!existing.youtubeId && track.youtubeId) {
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

        // Map Saavn tracks: find the best-matching YouTube video for each by title/artist similarity
        const saavnTracks = saavnItems
          .map((item) => {
            const title = decodeHtmlEntities(item.title || '');
            const primaryArtists = item?.more_info?.artistMap?.primary_artists
              ?.map((a: any) => a.name)
              .filter(Boolean)
              .join(', ') || '';
            const duration = Number(item?.more_info?.duration) || 210;
            const matchedYtId = findBestYouTubeMatch(title, primaryArtists, duration, ytItems);
            return mapSaavnItemToTrack(item, matchedYtId);
          })
          .filter((t): t is Track => t !== null);

        // Map iTunes tracks: find the best-matching Saavn audioUrl AND YouTube video for each
        const itunesTracks = itunesItems.map((item) => {
          const title = item.trackName || '';
          const artist = item.artistName || '';
          const duration = Math.round((Number(item.trackTimeMillis) || 210000) / 1000);
          const matchedAudioUrl = findBestSaavnAudioMatch(title, artist, duration, saavnTracks);
          const matchedYtId = findBestYouTubeMatch(title, artist, duration, ytItems);
          return mapItunesItemToTrack(item, matchedAudioUrl, matchedYtId);
        });

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
