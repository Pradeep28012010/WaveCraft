/**
 * Music Search and Trending Engine.
 * Fetches search results and charts from YouTube, YouTubei, and Spotify with
 * acoustic filtering, duplicate reduction, and parallel video ID pre-resolution.
 */

import { fetchWithTimeout } from './cache.js';
import { parseTrackMetadata } from './lyrics.js';

export const SPOTIFY_TRENDING_PLAYLISTS = {
  'global': {
    id: '37i9dQZF1DXcBWIGoYBM5M',
    name: 'Today’s Top Hits',
    genre: 'Global Pop',
    icon: '🌍'
  },
  'top-50-global': {
    id: '37i9dQZEVXbMDoHDwVN2tF',
    name: 'Top 50 Global',
    genre: 'Global Charts',
    icon: '🔥'
  },
  'india': {
    id: '37i9dQZEVXbLZ52XmnySJg',
    name: 'Top 50 India',
    genre: 'All-India Charts',
    icon: '🇮🇳'
  },
  'hindi': {
    id: '37i9dQZF1DX0XUfTFmNBRM',
    name: 'Hot Hits Hindi',
    genre: 'Bollywood & Hindi',
    icon: '✨'
  },
  'hiphop': {
    id: '37i9dQZF1DX0XUsuxWHRQd',
    name: 'RapCaviar',
    genre: 'Hip-Hop & Trap',
    icon: '🎤'
  },
  'pop': {
    id: '37i9dQZF1DWUa8ZRTfalHk',
    name: 'Pop Rising',
    genre: 'Viral & Pop',
    icon: '⚡'
  },
  'kpop': {
    id: '37i9dQZF1DX9tPFwDMOaN1',
    name: 'K-Pop ON! (온)',
    genre: 'K-Pop',
    icon: '🇰🇷'
  },
  'latin': {
    id: '37i9dQZF1DX10zKzsJ2jva',
    name: 'Viva Latino',
    genre: 'Latin & Reggaeton',
    icon: '💃'
  },
  'dance': {
    id: '37i9dQZF1DX4dyzvuaRJ0n',
    name: 'mint (EDM)',
    genre: 'Dance & EDM',
    icon: '🎧'
  },
  'rock': {
    id: '37i9dQZF1DWXRqgorJj26U',
    name: 'Rock Classics',
    genre: 'Rock Anthems',
    icon: '🎸'
  },
  'indie': {
    id: '37i9dQZF1DX2Nc3B70tvx0',
    name: 'Ultimate Indie',
    genre: 'Indie & Alt',
    icon: '🌿'
  },
  'country': {
    id: '37i9dQZF1DX1lVhptIYRda',
    name: 'Hot Country',
    genre: 'Country Hits',
    icon: '🤠'
  },
  'usa': {
    id: '37i9dQZEVXbLRQDuF5jeBp',
    name: 'Top 50 USA',
    genre: 'USA Charts',
    icon: '🇺🇸'
  },
  'uk': {
    id: '37i9dQZEVXbLnolsZ8PSNw',
    name: 'Top 50 UK',
    genre: 'UK Charts',
    icon: '🇬🇧'
  },
  'mood': {
    id: '37i9dQZF1DX3rxVfibe1L0',
    name: 'Mood Booster',
    genre: 'Feel Good Pop',
    icon: '☀️'
  }
};

export const TOP_GLOBAL_TRENDING_SEEDS = [
  'Lady Gaga Bruno Mars Die With A Smile',
  'The Weeknd Playboi Carti Timeless',
  'Billie Eilish Birds of a Feather',
  'Sabrina Carpenter Espresso',
  'Rose Bruno Mars Apt',
  'Kendrick Lamar Not Like Us',
  'Taylor Swift Cruel Summer',
  'Sabrina Carpenter Taste',
  'The Weeknd Blinding Lights',
  'Post Malone Morgan Wallen I Had Some Help',
  'Benson Boone Beautiful Things',
  'Coldplay feelslikeimfallinginlove',
  'Dua Lipa Levitating',
  'Hozier Too Sweet',
  'SZA Snooze',
  'Teddy Swims Lose Control',
  'Tauba Tauba Bad Newz',
  'Chuttamalle Devara',
  'Aaj Ki Raat Stree 2',
  'Arijit Singh Chaleya',
  'Anirudh Hukum Jailer',
  'Dua Lipa Houdini'
];

export async function fetchYouTubeSearch(query, limit = 25) {
  if (!query) return [];
  const clean = query.trim();
  const hasMusicIndicator = /\b(song|songs|remix|official|audio|music|album|track|lyric|lyrics|video|soundtrack|ost)\b/i.test(clean);
  const ytQuery = hasMusicIndicator
    ? clean
    : `${clean} song`;

  const wantsInstrumental = /\b(instrumental|karaoke|backing|piano|flute|guitar|bgm|violin|ringtone|soundtrack|score|theme)\b/i.test(clean);
  const BGM_OR_INSTRUMENTAL_REGEX =
    /\b(bgm|background\s*(?:music|score)|theme\s*(?:music|video|song|track)?|instrumental|karaoke|backing\s*track|minus\s*one|no\s*vocals?|without\s*vocals?|off\s*vocal|vocal\s*cut|score|piano\s*(?:cover|version)|flute|guitar\s*(?:cover|version)|violin\s*(?:cover|version)|sax\s*(?:cover|version)|orchestral\s*version|ringtone|soundtrack\s*suite)\b/i;

  const r = await fetchWithTimeout(
    'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'en',
            gl: 'US'
          }
        },
        query: ytQuery
      })
    },
    4500
  );
  if (!r.ok) return [];
  const data = await r.json();
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const tracks = [];
  const seenIds = new Set();

  for (const sec of sections) {
    const items = sec?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item.videoRenderer;
      if (!v || !v.videoId || seenIds.has(v.videoId)) continue;

      const lengthText = v.lengthText?.simpleText || '';
      const parts = lengthText.split(':').map(Number);
      let seconds = 0;
      if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
      else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];

      const wantsLong = /\b(mix|playlist|compilation|jukebox|hours?|live\s*stream)\b/i.test(clean);
      if (seconds < 45 || (!wantsLong && seconds > 900)) continue;

      const rawTitle = v.title?.runs?.[0]?.text || 'Unknown Title';
      const rawAuthor =
        v.ownerText?.runs?.[0]?.text ||
        v.longBylineText?.runs?.[0]?.text ||
        'WaveCraft Cloud';

      const JUNK_DISCARD_REGEX =
        /\b(karaoke|minus\s*one|backing\s*track|no\s*vocals?|without\s*vocals?|vocal\s*cut|off\s*vocal|sing\s*along|maa\s*paata\s*mee\s*nota|dance\s*performance|dance\s*cover|choreography|choreographed|duet\s*dance|college\s*dance|stage\s*performance|drama\s*company|reactions?|review|tutorial|lesson|ringtone|whatsapp\s*status|shorts|sound\s*effect|sfx|status\s*video|tiktok\s*audio)\b/i;

      // Discard ringtones, whatsapp status, dance performance, and karaoke videos if user didn't ask for instrumental
      if (!wantsInstrumental) {
        if (JUNK_DISCARD_REGEX.test(rawTitle) || JUNK_DISCARD_REGEX.test(rawAuthor)) {
          continue;
        }
      }
      if (!wantsLong) {
        if (/\b(top\s*\d+|most\s*viewed|compilation|jukebox|nonstop|non-stop)\b/i.test(rawTitle)) {
          continue;
        }
      }

      seenIds.add(v.videoId);

      const { cleanTitle, cleanArtist, cleanAlbum } = parseTrackMetadata(rawTitle, rawAuthor);
      const thumb = `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      const thumbLarge = `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`;
      const isInstrumentalOrBgm =
        BGM_OR_INSTRUMENTAL_REGEX.test(rawTitle) ||
        BGM_OR_INSTRUMENTAL_REGEX.test(cleanTitle || '') ||
        BGM_OR_INSTRUMENTAL_REGEX.test(rawAuthor || '');

      tracks.push({
        id: `yt_${v.videoId}`,
        title: cleanTitle || rawTitle,
        artist: cleanArtist || rawAuthor,
        album: cleanAlbum || '',
        duration: seconds || 210,
        thumbnail: thumb,
        thumbnailLarge: thumbLarge,
        thumbnailUrl: thumb,
        youtubeId: v.videoId,
        quality: 'Studio Audio',
        isInstrumental: isInstrumentalOrBgm,
        rawTitle,
        rawAuthor
      });
    }
  }

  // Demote instrumental/BGM below vocal tracks if user didn't ask for instrumental
  if (!wantsInstrumental) {
    const qTokens = clean.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    tracks.sort((a, b) => {
      const aInst = Boolean(a.isInstrumental || BGM_OR_INSTRUMENTAL_REGEX.test(a.title));
      const bInst = Boolean(b.isInstrumental || BGM_OR_INSTRUMENTAL_REGEX.test(b.title));
      if (aInst && !bInst) return 1;
      if (!aInst && bInst) return -1;

      // Prioritize tracks matching query tokens
      const aTitle = (a.title || a.rawTitle || '').toLowerCase();
      const bTitle = (b.title || b.rawTitle || '').toLowerCase();
      const aMatches = qTokens.filter((tok) => aTitle.includes(tok)).length;
      const bMatches = qTokens.filter((tok) => bTitle.includes(tok)).length;
      if (aMatches !== bMatches) return bMatches - aMatches;

      // Prefer official video / full song / lyrical releases when query match is equal
      const aOfficial = /\b(official\s*(?:video|audio)|full\s*(?:video\s*)?song|lyrical|video\s*song)\b/i.test(a.rawTitle || a.title);
      const bOfficial = /\b(official\s*(?:video|audio)|full\s*(?:video\s*)?song|lyrical|video\s*song)\b/i.test(b.rawTitle || b.title);
      if (aOfficial && !bOfficial) return -1;
      if (!aOfficial && bOfficial) return 1;

      return 0;
    });
  }

  return tracks.slice(0, limit);
}

export async function fetchSpotifyTrending(categoryKey = 'global') {
  const cat = SPOTIFY_TRENDING_PLAYLISTS[categoryKey] || SPOTIFY_TRENDING_PLAYLISTS['global'];
  const embedUrl = `https://open.spotify.com/embed/playlist/${cat.id}`;

  try {
    const r = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (r.ok) {
      const html = await r.text();
      const idx = html.indexOf('__NEXT_DATA__');
      if (idx !== -1) {
        const start = html.indexOf('>', idx) + 1;
        const end = html.indexOf('</script>', start);
        const json = JSON.parse(html.slice(start, end));
        const entity = json?.props?.pageProps?.state?.data?.entity;

        if (entity && Array.isArray(entity.trackList)) {
          const images = Array.isArray(entity.visualIdentity?.image)
            ? [...entity.visualIdentity.image].sort((a, b) => (b.maxWidth || 0) - (a.maxWidth || 0))
            : [];
          const playlistCover =
            images[0]?.url ||
            'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80';

          const mappedTracks = entity.trackList.slice(0, 40).map((t, index) => {
            const tid = t.uid || (t.uri ? t.uri.replace('spotify:track:', '') : `s_${index}`);
            const durSec = t.duration ? Math.round(t.duration / 1000) : 210;
            return {
              id: `sp_${tid}`,
              title: t.title || 'Untitled',
              artist: (t.subtitle || '').replace(/\u00a0/g, ' ') || 'Various Artists',
              album: entity.name || cat.name,
              duration: durSec,
              thumbnail: playlistCover,
              thumbnailLarge: playlistCover,
              thumbnailUrl: playlistCover,
              audioUrl: t.audioPreview?.url || undefined,
              audioPreviewUrl: t.audioPreview?.url || undefined,
              spotifyUri: t.uri || `spotify:track:${tid}`,
              quality: 'Spotify Master'
            };
          });

          // Pre-resolve YouTube IDs for the top tracks in parallel batches for zero-latency, verified playback
          const candidatesToResolve = mappedTracks.slice(0, 30);
          const resolvedTracks = [];
          const seenVideoIds = new Set();

          for (let b = 0; b < candidatesToResolve.length; b += 8) {
            const batch = candidatesToResolve.slice(b, b + 8);
            const batchResults = await Promise.allSettled(
              batch.map((tr) => fetchYouTubeSearch(`${tr.title} ${tr.artist}`, 2))
            );

            batch.forEach((tr, idx) => {
              const res = batchResults[idx];
              if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
                const matched = res.value[0];
                if (matched && matched.youtubeId && !seenVideoIds.has(matched.youtubeId)) {
                  seenVideoIds.add(matched.youtubeId);
                  tr.youtubeId = matched.youtubeId;
                  tr.id = `yt_${matched.youtubeId}`;
                  if (matched.thumbnail) {
                    tr.thumbnail = matched.thumbnail;
                    tr.thumbnailLarge = matched.thumbnailLarge || matched.thumbnail;
                    tr.thumbnailUrl = matched.thumbnail;
                  }
                  if (matched.duration && matched.duration > 0) {
                    tr.duration = matched.duration;
                  }
                  resolvedTracks.push(tr);
                } else {
                  resolvedTracks.push(tr);
                }
              } else {
                resolvedTracks.push(tr);
              }
            });
          }

          if (resolvedTracks.length >= 6) {
            return {
              tracks: resolvedTracks,
              playlistName: entity.name || cat.name,
              coverUrl: playlistCover
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Spotify trending fetch error for ${categoryKey}:`, err);
  }

  // Fallback to curated YouTube smash hits if Spotify network unreachable
  const fallback = await fetchYouTubeTrending();
  return {
    tracks: fallback,
    playlistName: cat.name,
    coverUrl: fallback[0]?.thumbnail || ''
  };
}

export async function fetchYouTubeTrending() {
  const specificHits = await Promise.allSettled(
    TOP_GLOBAL_TRENDING_SEEDS.map((q) => fetchYouTubeSearch(q, 1))
  );

  const seen = new Set();
  const tracks = [];

  for (const res of specificHits) {
    if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value[0]) {
      const t = res.value[0];
      if (!seen.has(t.youtubeId)) {
        seen.add(t.youtubeId);
        tracks.push(t);
      }
    }
  }

  if (tracks.length < 15) {
    try {
      const fallbackHits = await fetchYouTubeSearch('Global Top 20 Pop Music Hits Official Audio', 15);
      for (const t of fallbackHits) {
        if (!seen.has(t.youtubeId)) {
          seen.add(t.youtubeId);
          tracks.push(t);
        }
      }
    } catch {}
  }

  return tracks.slice(0, 25);
}
