/**
 * WaveCraft Serverless API Gateway (/api/music)
 * Modularized gateway routing search, trending charts, new releases, lyrics,
 * stream resolution, external playlist imports, and real-time Live Jam room sync.
 * Equipped with in-memory caching, per-IP rate limiting, SSRF guardrails, and upstream abort timeouts.
 */

import {
  checkRateLimit,
  isAllowedAudioProxyUrl,
  getCached,
  setCached,
  fetchWithTimeout
} from './lib/cache.js';
import {
  handleJamRoomSseStream,
  handleJamRoomRequest,
  readJsonBody
} from './lib/jam.js';
import {
  fetchMultiSourceLyrics
} from './lib/lyrics.js';
import {
  importExternalPlaylist
} from './lib/playlists.js';
import {
  fetchYouTubeSearch,
  fetchSpotifyTrending,
  SPOTIFY_TRENDING_PLAYLISTS
} from './lib/search.js';
import {
  resolveDirectAudioStream,
  resolveYouTubeAudioStream
} from './lib/stream.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limit protection
  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const action = (url.searchParams.get('action') || 'search').toLowerCase();
  const q = (url.searchParams.get('q') || '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 150)
    .trim();

  try {
    if (action === 'search') {
      if (!q) {
        return res.status(200).json({ tracks: [], youtube: [] });
      }
      const cacheKey = `search:${q.toLowerCase()}`;
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=180, s-maxage=300, stale-while-revalidate=600');
      if (cached) return res.status(200).json(cached);

      const tracks = await fetchYouTubeSearch(q, 30);
      const payload = {
        tracks,
        youtube: tracks
      };
      if (tracks.length > 0) {
        setCached(cacheKey, payload, 300_000);
      }
      return res.status(200).json(payload);
    }

    if (action === 'trending') {
      const category = (url.searchParams.get('category') || 'global').toLowerCase();
      const cacheKey = `trending:${category}`;
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200');
      if (cached) return res.status(200).json(cached);

      const trendingData = await fetchSpotifyTrending(category);
      const categoriesList = Object.entries(SPOTIFY_TRENDING_PLAYLISTS).map(([k, v]) => ({
        key: k,
        name: v.name,
        genre: v.genre,
        icon: v.icon
      }));

      const payload = {
        tracks: trendingData.tracks,
        youtube: trendingData.tracks,
        playlistName: trendingData.playlistName,
        coverUrl: trendingData.coverUrl,
        activeCategory: category,
        categories: categoriesList
      };

      if (trendingData.tracks && trendingData.tracks.length > 0) {
        setCached(cacheKey, payload, 600_000);
      }
      return res.status(200).json(payload);
    }

    if (action === 'new-releases') {
      const cacheKey = 'releases:global';
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=7200');
      if (cached) return res.status(200).json(cached);

      try {
        const r = await fetchWithTimeout('https://itunes.apple.com/us/rss/topalbums/limit=25/json', {}, 4000);
        if (r.ok) {
          const data = await r.json();
          const entries = data.feed?.entry || [];
          const releases = entries.map((e, idx) => {
            const rawCover = e['im:image']?.slice(-1)[0]?.label || '';
            const highResCover = rawCover.replace('170x170bb', '600x600bb');
            const title = e['im:name']?.label || 'Untitled Album';
            const artist = e['im:artist']?.label || 'Various Artists';
            return {
              id: `rel_${idx}_${e.id?.attributes?.['im:id'] || idx}`,
              name: title,
              title: title,
              artist: artist,
              coverUrl: highResCover,
              coverArt: highResCover,
              thumbnail: highResCover,
              year: new Date().getFullYear(),
              trackCount: parseInt(e['im:itemCount']?.label || '10', 10)
            };
          });

          if (releases.length > 0) {
            const payload = { releases };
            setCached(cacheKey, payload, 3600_000);
            return res.status(200).json(payload);
          }
        }
      } catch (err) {
        console.warn('New releases fetch error:', err);
      }

      const verifiedFallbackReleases = [
        {
          id: 'itunes_alb_1752214909',
          name: "Short n' Sweet",
          title: "Short n' Sweet",
          artist: 'Sabrina Carpenter',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a1/1c/ca/a11ccab6-7d4c-e041-d028-998bcebeb709/24UMGIM61704.rgb.jpg/600x600bb.jpg',
          coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a1/1c/ca/a11ccab6-7d4c-e041-d028-998bcebeb709/24UMGIM61704.rgb.jpg/600x600bb.jpg',
          thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a1/1c/ca/a11ccab6-7d4c-e041-d028-998bcebeb709/24UMGIM61704.rgb.jpg/600x600bb.jpg',
          year: 2024,
          trackCount: 12
        },
        {
          id: 'itunes_alb_1739659134',
          name: 'HIT ME HARD AND SOFT',
          title: 'HIT ME HARD AND SOFT',
          artist: 'Billie Eilish',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg',
          coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg',
          thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg',
          year: 2024,
          trackCount: 11
        },
        {
          id: 'itunes_alb_1736268215',
          name: 'THE TORTURED POETS DEPARTMENT',
          title: 'THE TORTURED POETS DEPARTMENT',
          artist: 'Taylor Swift',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/6b/7d/61/6b7d61e4-e6f1-83bc-d645-463aa06b33c4/24UMGIM29563.rgb.jpg/600x600bb.jpg',
          coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/6b/7d/61/6b7d61e4-e6f1-83bc-d645-463aa06b33c4/24UMGIM29563.rgb.jpg/600x600bb.jpg',
          thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/6b/7d/61/6b7d61e4-e6f1-83bc-d645-463aa06b33c4/24UMGIM29563.rgb.jpg/600x600bb.jpg',
          year: 2024,
          trackCount: 17
        },
        {
          id: 'itunes_alb_1781316864',
          name: 'GNX',
          title: 'GNX',
          artist: 'Kendrick Lamar',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/54/28/14/54281424-eece-0935-299d-fdd2ab403f92/24UM1IM28978.rgb.jpg/600x600bb.jpg',
          coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/54/28/14/54281424-eece-0935-299d-fdd2ab403f92/24UM1IM28978.rgb.jpg/600x600bb.jpg',
          thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/54/28/14/54281424-eece-0935-299d-fdd2ab403f92/24UM1IM28978.rgb.jpg/600x600bb.jpg',
          year: 2024,
          trackCount: 12
        },
        {
          id: 'itunes_alb_1707412988',
          name: 'The Rise and Fall of a Midwest Princess',
          title: 'The Rise and Fall of a Midwest Princess',
          artist: 'Chappell Roan',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/42/a0/c5/42a0c5e6-6b98-f1f9-7d6b-6d6c61aba562/23UMGIM84225.rgb.jpg/600x600bb.jpg',
          coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/42/a0/c5/42a0c5e6-6b98-f1f9-7d6b-6d6c61aba562/23UMGIM84225.rgb.jpg/600x600bb.jpg',
          thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/42/a0/c5/42a0c5e6-6b98-f1f9-7d6b-6d6c61aba562/23UMGIM84225.rgb.jpg/600x600bb.jpg',
          year: 2023,
          trackCount: 14
        },
        {
          id: 'itunes_alb_1752536575',
          name: 'F-1 Trillion',
          title: 'F-1 Trillion',
          artist: 'Post Malone',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/0e/7c/29/0e7c29f4-74ec-e234-cc49-9212a5c0f847/24UMGIM60824.rgb.jpg/600x600bb.jpg',
          coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/0e/7c/29/0e7c29f4-74ec-e234-cc49-9212a5c0f847/24UMGIM60824.rgb.jpg/600x600bb.jpg',
          thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/0e/7c/29/0e7c29f4-74ec-e234-cc49-9212a5c0f847/24UMGIM60824.rgb.jpg/600x600bb.jpg',
          year: 2024,
          trackCount: 18
        },
        {
          id: 'itunes_alb_1739079974',
          name: 'BRAT',
          title: 'BRAT',
          artist: 'Charli xcx',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/600x600bb.jpg',
          coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/600x600bb.jpg',
          thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/600x600bb.jpg',
          year: 2024,
          trackCount: 15
        },
        {
          id: 'itunes_alb_1770789137',
          name: 'Moon Music',
          title: 'Moon Music',
          artist: 'Coldplay',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/6d/06/c66d06d3-0ceb-35b9-594d-4b85b697ec2c/5021732499189.jpg/600x600bb.jpg',
          coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/6d/06/c66d06d3-0ceb-35b9-594d-4b85b697ec2c/5021732499189.jpg/600x600bb.jpg',
          thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/6d/06/c66d06d3-0ceb-35b9-594d-4b85b697ec2c/5021732499189.jpg/600x600bb.jpg',
          year: 2024,
          trackCount: 10
        }
      ];

      return res.status(200).json({ releases: verifiedFallbackReleases });
    }

    if (action === 'suggestions') {
      const cacheKey = `sug:${q.toLowerCase()}`;
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
      if (cached) return res.status(200).json(cached);

      try {
        const sugUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;
        const sugRes = await fetchWithTimeout(sugUrl, {}, 2500);
        if (sugRes.ok) {
          const sugData = await sugRes.json();
          const rawList = Array.isArray(sugData?.[1]) ? sugData[1] : [];
          const suggestions = rawList
            .filter((s) => typeof s === 'string' && !/\b(ringtone|whatsapp|status|apk|download|vlog)\b/i.test(s))
            .slice(0, 10);
          const payload = { suggestions };
          setCached(cacheKey, payload, 300_000);
          return res.status(200).json(payload);
        }
      } catch {}

      return res.status(200).json({ suggestions: [] });
    }

    if (action === 'lyrics') {
      const title = (url.searchParams.get('title') || '').trim();
      const artist = (url.searchParams.get('artist') || '').trim();
      const duration = parseFloat(url.searchParams.get('duration') || '0');
      const cacheKey = `lyrics:${artist.toLowerCase()}__${title.toLowerCase()}__${Math.round(duration)}`;
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=1800');
      if (cached) return res.status(200).json(cached);

      const lyricsData = await fetchMultiSourceLyrics(title, artist, duration);
      if (lyricsData?.lyrics) {
        setCached(cacheKey, lyricsData, 1_800_000);
      }
      return res.status(200).json(lyricsData);
    }

    if (action === 'import-playlist') {
      const playlistUrl = url.searchParams.get('url') || '';
      const imported = await importExternalPlaylist(playlistUrl);
      return res.status(200).json(imported);
    }

    if (action === 'batch-search') {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      let queries = Array.isArray(body?.queries) ? body.queries : [];
      if (queries.length === 0) {
        const rawQ = url.searchParams.get('queries');
        if (rawQ) {
          try {
            queries = JSON.parse(rawQ);
          } catch {}
        }
      }

      if (!Array.isArray(queries) || queries.length === 0) {
        return res.status(200).json({ results: [] });
      }

      const targetQueries = queries.slice(0, 30);
      const results = [];

      for (let i = 0; i < targetQueries.length; i += 5) {
        const chunk = targetQueries.slice(i, i + 5);
        const chunkPromises = chunk.map(async (item) => {
          const title = (item.title || '').trim();
          const artist = (item.artist || '').trim();
          if (!title) return { title, artist, track: null };

          if (item.videoId) {
            return {
              title,
              artist,
              track: {
                id: `yt_${item.videoId}`,
                title,
                artist: artist || 'YouTube Music',
                album: 'Imported',
                duration: 210,
                thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
                thumbnailLarge: `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`,
                youtubeId: item.videoId
              }
            };
          }

          const cacheKey = `search:${title.toLowerCase()} ${artist.toLowerCase()}`.trim();
          const cached = getCached(cacheKey);
          if (cached?.tracks?.[0]) {
            return { title, artist, track: cached.tracks[0] };
          }

          try {
            const tracks = await fetchYouTubeSearch(`${title} ${artist}`.trim(), 2);
            if (tracks.length > 0) {
              setCached(cacheKey, { tracks, youtube: tracks }, 300_000);
              return { title, artist, track: tracks[0] };
            }
          } catch {}

          return { title, artist, track: null };
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
      }

      return res.status(200).json({ results });
    }

    if (action === 'resolve-stream') {
      const title = (url.searchParams.get('title') || '').trim();
      const artist = (url.searchParams.get('artist') || '').trim();
      const videoId = (url.searchParams.get('videoId') || '').trim();
      if (!title && !videoId) return res.status(400).json({ error: 'Title or videoId required' });

      const cacheKey = `stream:${videoId || `${title.toLowerCase()}__${artist.toLowerCase()}`}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        return res.status(200).json(cached);
      }

      let streamData = null;
      if (title) {
        streamData = await resolveDirectAudioStream(title, artist, clientIp);
      }
      if (!streamData && videoId) {
        streamData = await resolveYouTubeAudioStream(videoId);
      }

      if (streamData?.audioUrl) {
        setCached(cacheKey, streamData, 3_600_000);
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        return res.status(200).json(streamData);
      }
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(404).json({ error: 'Direct stream not found' });
    }

    if (action === 'proxy-stream') {
      const audioUrl = url.searchParams.get('url') || '';
      if (!audioUrl) return res.status(400).json({ error: 'URL required' });
      if (!isAllowedAudioProxyUrl(audioUrl)) {
        return res.status(403).json({ error: 'Proxy URL target domain not allowed' });
      }
      try {
        const upstream = await fetchWithTimeout(audioUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }, 15000);
        if (!upstream.ok) {
          return res.status(upstream.status).json({ error: 'Upstream fetch failed' });
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mp4');
        const length = upstream.headers.get('content-length');
        if (length) res.setHeader('Content-Length', length);

        if (upstream.body && typeof upstream.body.getReader === 'function') {
          const { Readable } = await import('node:stream');
          res.status(200);
          Readable.fromWeb(upstream.body).pipe(res);
          return;
        } else {
          const arrayBuf = await upstream.arrayBuffer();
          return res.status(200).send(Buffer.from(arrayBuf));
        }
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'jam') {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      const roomCode = (url.searchParams.get('room') || '').trim().toUpperCase();
      if (!roomCode) {
        return res.status(400).json({ error: 'Room code required' });
      }
      const op = url.searchParams.get('op') || (req.method === 'POST' ? 'sync' : 'get');
      if (op === 'stream') {
        return handleJamRoomSseStream(req, res, roomCode);
      }
      const result = await handleJamRoomRequest(req, url, roomCode);
      return res.status(200).json(result);
    }

    if (action === 'feedback') {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      let body = {};
      if (req.method === 'POST') {
        try {
          body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        } catch {
          body = {};
        }
      }
      const feedbackEntry = {
        id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: body.type || url.searchParams.get('type') || 'general',
        category: body.category || url.searchParams.get('category') || 'general',
        title: body.title || url.searchParams.get('title') || '',
        message: body.message || url.searchParams.get('message') || '',
        rating: body.rating || Number(url.searchParams.get('rating')) || 5,
        email: body.email || url.searchParams.get('email') || '',
        diagnostics: body.diagnostics || {},
        timestamp: new Date().toISOString(),
        clientIp
      };
      console.log('[WaveCraft Feedback Received]:', JSON.stringify(feedbackEntry));
      return res.status(200).json({
        success: true,
        id: feedbackEntry.id,
        receivedAt: feedbackEntry.timestamp,
        message: 'Feedback received successfully. Thank you for making WaveCraft better!'
      });
    }

    if (action === 'version') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).json({
        version: '5.2.4',
        versionCode: 15,
        releaseDate: '2026-10-21',
        downloadUrl: 'https://wavecraft-alpha.vercel.app/WaveCraft.apk',
        title: 'WaveCraft Pro v5.2.3 (Seamless Liquid Glass & Dark Obsidian Studio)',
        releaseNotes: [
          'Deep Dark Obsidian Aesthetics: Clamped warm album color luminance (L <= 0.24) and unified ambient backdrops so the player strictly stays deep, dark, and moody across all songs.',
          'Seamless Liquid Glass Blending: Completely eliminated artificial diffuser strips, softened perimeter shadows, and centered radial gradient diffusion for zero boundary lines or dark stripes on cards.',
          'Smooth Waveform Visualizer: Retained audio envelope dynamics and unclipped atmospheric visualizer glow.',
          'Fluid Liquid-Glass Navigation: Ultra-smooth gliding indicator and glint physics across all navigation tabs.',
          'Atmosphere Studio Interactivity: Full touch and click event responsiveness across all soundscape layers, sliders, and presets.',
          'Ultra-Fast Track Resolver: Instant 1200ms playback transition and concurrent audio stream racing for zero buffering dropouts.'
        ],
        forceUpdate: false
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
