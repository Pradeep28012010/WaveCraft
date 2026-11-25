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
import {
  publishSyncPayload,
  pullSyncPayload,
  generateSyncCode
} from './lib/sync.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin, User-Agent');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limit protection
  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`);
  } catch {
    return res.status(400).json({ error: 'Invalid request URL' });
  }

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

      // If JioSaavn has no direct audio match, resolve YouTube direct audio stream via mirror proxy
      if (!streamData?.audioUrl && videoId) {
        const ytStream = await resolveYouTubeAudioStream(videoId);
        if (ytStream?.audioUrl) {
          const proxiedUrl = ytStream.audioUrl.startsWith('/api/music?action=proxy-stream')
            ? ytStream.audioUrl
            : `/api/music?action=proxy-stream&url=${encodeURIComponent(ytStream.audioUrl)}`;
          streamData = {
            audioUrl: proxiedUrl,
            quality: ytStream.quality || '160kbps YouTube Studio',
            title: ytStream.title || title,
            artist: ytStream.artist || artist
          };
        }
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
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const audioUrl = url.searchParams.get('url') || '';
      if (!audioUrl) return res.status(400).json({ error: 'URL required' });
      let currentAudioUrl = audioUrl;
      let upstream = null;
      let redirectCount = 0;
      const MAX_REDIRECTS = 5;

      const isAllowedMediaContentType = (rawType) => {
        if (!rawType) return true;
        const mime = rawType.split(';')[0].trim().toLowerCase();
        if (!mime) return true;
        if (mime.startsWith('audio/')) return true;
        return (
          mime === 'video/mp4' ||
          mime === 'video/webm' ||
          mime === 'video/quicktime' ||
          mime === 'application/ogg' ||
          mime === 'application/vnd.apple.mpegurl' ||
          mime === 'application/x-mpegurl' ||
          mime === 'application/octet-stream'
        );
      };

      try {
        const upstreamHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        // Forward HTTP Range header if requested by audio element for seamless buffering and seeking
        if (req.headers && req.headers.range) {
          upstreamHeaders['Range'] = req.headers.range;
        }

        while (true) {
          if (!isAllowedAudioProxyUrl(currentAudioUrl)) {
            return res.status(403).json({ error: 'Proxy URL target domain not allowed' });
          }

          upstream = await fetchWithTimeout(
            currentAudioUrl,
            {
              method: req.method === 'HEAD' ? 'HEAD' : 'GET',
              headers: upstreamHeaders,
              redirect: 'manual'
            },
            15000
          );

          if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
            try {
              await upstream.body?.cancel?.();
            } catch {}
            if (redirectCount >= MAX_REDIRECTS) {
              return res.status(502).json({ error: 'Too many upstream redirects' });
            }
            const loc = upstream.headers.get('location');
            currentAudioUrl = new URL(loc, currentAudioUrl).toString();
            redirectCount++;
            continue;
          }
          break;
        }

        if (!upstream || (!upstream.ok && upstream.status !== 206)) {
          try {
            await upstream?.body?.cancel?.();
          } catch {}
          return res.status(upstream?.status || 502).json({ error: 'Upstream fetch failed' });
        }

        const rawUpstreamType = upstream.headers.get('content-type') || '';
        if (!isAllowedMediaContentType(rawUpstreamType)) {
          try {
            await upstream.body?.cancel?.();
          } catch {}
          return res.status(415).json({ error: 'Unsupported upstream media type' });
        }

        const normalizedMime = rawUpstreamType.split(';')[0].trim().toLowerCase();
        const safeContentType =
          !normalizedMime || normalizedMime === 'application/octet-stream'
            ? 'audio/mp4'
            : normalizedMime;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment; filename="stream.m4a"');
        res.setHeader('Content-Type', safeContentType);

        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

        const length = upstream.headers.get('content-length');
        if (length) res.setHeader('Content-Length', length);

        res.status(upstream.status);

        if (req.method === 'HEAD') {
          try {
            await upstream.body?.cancel?.();
          } catch {}
          return res.end();
        }

        if (upstream.body && typeof upstream.body.getReader === 'function') {
          const { Readable } = await import('node:stream');
          const readable = Readable.fromWeb(upstream.body);
          readable.on('error', () => {
            try {
              if (!res.headersSent) {
                res.status(502).json({ error: 'Upstream stream interrupted' });
              } else if (typeof res.destroy === 'function') {
                res.destroy();
              } else {
                res.end?.();
              }
            } catch {}
          });
          if (typeof res.on === 'function') {
            res.on('close', () => {
              try { readable.destroy(); } catch {}
            });
          }
          readable.pipe(res);
          return;
        } else {
          const arrayBuf = await upstream.arrayBuffer();
          return res.send(Buffer.from(arrayBuf));
        }
      } catch (err) {
        if (!res.headersSent) {
          return res.status(500).json({ error: err?.message || 'Proxy error' });
        }
        try { res.end?.(); } catch {}
        return;
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

    if (action === 'sync-publish') {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const code = (url.searchParams.get('code') || body?.code || '').trim();
      const payload = body?.payload !== undefined ? body.payload : body;
      const result = publishSyncPayload(code, payload);
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.status(200).json(result);
    }

    if (action === 'sync-pull') {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      const code = (url.searchParams.get('code') || '').trim();
      const result = pullSyncPayload(code);
      if (!result.success) {
        return res.status(404).json(result);
      }
      return res.status(200).json(result);
    }

    if (action === 'feedback') {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const feedbackEntry = {
        id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: String(body.type || url.searchParams.get('type') || 'general').slice(0, 40),
        category: String(body.category || url.searchParams.get('category') || 'general').slice(0, 60),
        title: String(body.title || url.searchParams.get('title') || '').slice(0, 200),
        message: String(body.message || url.searchParams.get('message') || '').slice(0, 2000),
        rating: Number(body.rating || url.searchParams.get('rating')) || 5,
        timestamp: new Date().toISOString()
      };
      console.log(
        '[WaveCraft Feedback Received]:',
        JSON.stringify({
          id: feedbackEntry.id,
          type: feedbackEntry.type,
          category: feedbackEntry.category,
          rating: feedbackEntry.rating,
          hasMessage: Boolean(feedbackEntry.message),
          timestamp: feedbackEntry.timestamp
        })
      );
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
        version: '5.4.0',
        versionCode: 25,
        releaseDate: '2026-11-19',
        downloadUrl: 'https://wavecraft-alpha.vercel.app/WaveCraft.apk',
        windowsDownloadUrl: 'https://github.com/Pradeep28012010/WaveCraft/releases/latest/download/WaveCraft-Pro-Setup.exe',
        windowsInstallerUrl: 'https://github.com/Pradeep28012010/WaveCraft/releases/latest/download/WaveCraft-Pro-Setup.exe',
        title: 'WaveCraft Pro v5.4.0 (100% Background Audio, Smooth Carousel Physics & Infinite Flow Radios)',
        releaseNotes: [
          '100% Background Audio & Screen-Lock Continuity: Completely resolved background video throttling and unintended pauses. Audio seamlessly transitions and continues playing uninterrupted when switching tabs or locking device screen.',
          'Zero-Gap Continuous Playback & Eager Lookahead: Proactively resolves next track streams in background at 65% duration, ensuring instantaneous, zero-delay transitions to queued songs.',
          'Eliminated Carousel Scroll Trapping: Fixed mouse wheel and touch scroll freezing over music displays, pill bars, and genre chips, allowing the main page to scroll smoothly everywhere.',
          '24/7 Endless Radios & Decade Time Machine: Restored live stream and era station tuning with multi-stage resilient search fallbacks and live indicator spin telemetry.',
          'WaveJam 2D Spatial Audio: Interactive spatial listening room with real-time stereo panning and distance-based volume rolloff.'
        ],
        forceUpdate: true
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
