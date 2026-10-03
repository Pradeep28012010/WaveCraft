// Serverless API handler for Vercel / Vite / Netlify (/api/music)
const responseCache = new Map();
const MAX_CACHE_ENTRIES = 250;

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data, ttlMs = 300_000) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2200) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const action = url.searchParams.get('action') || 'search';
  const q = (url.searchParams.get('q') || '').trim();

  try {
    if (action === 'search') {
      const cacheKey = `search:${q.toLowerCase()}`;
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=180, s-maxage=300, stale-while-revalidate=600');
      if (cached) return res.status(200).json(cached);

      const [saavnRes, ytRes] = await Promise.allSettled([
        fetchSaavnSearch(q, 20),
        fetchYouTubeSearch(q)
      ]);
      const payload = {
        saavn: saavnRes.status === 'fulfilled' ? saavnRes.value : [],
        youtube: ytRes.status === 'fulfilled' ? ytRes.value : []
      };
      if (payload.saavn.length > 0 || payload.youtube.length > 0) {
        setCached(cacheKey, payload, 300_000);
      }
      return res.status(200).json(payload);
    }

    if (action === 'trending') {
      const cacheKey = 'trending:global';
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200');
      if (cached) return res.status(200).json(cached);

      const [enRes, hiRes, teRes] = await Promise.allSettled([
        fetchSaavnTrending('english'),
        fetchSaavnTrending('hindi'),
        fetchSaavnTrending('telugu')
      ]);
      const combined = [
        ...(enRes.status === 'fulfilled' ? enRes.value.slice(0, 10) : []),
        ...(hiRes.status === 'fulfilled' ? hiRes.value.slice(0, 8) : []),
        ...(teRes.status === 'fulfilled' ? teRes.value.slice(0, 6) : [])
      ];
      const payload = { saavn: combined };
      if (combined.length > 0) {
        setCached(cacheKey, payload, 600_000);
      }
      return res.status(200).json(payload);
    }

    if (action === 'suggestions') {
      const cacheKey = `sug:${q.toLowerCase()}`;
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
      if (cached) return res.status(200).json(cached);

      const results = await fetchSaavnSearch(q, 6);
      const suggestions = results.map((r) =>
        `${r.title} - ${r.subtitle || ''}`.replace(/&quot;/g, '"')
      );
      const payload = { suggestions };
      setCached(cacheKey, payload, 300_000);
      return res.status(200).json(payload);
    }

    if (action === 'lyrics') {
      const title = (url.searchParams.get('title') || '').trim();
      const artist = (url.searchParams.get('artist') || '').trim();
      const cacheKey = `lyrics:${artist.toLowerCase()}__${title.toLowerCase()}`;
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=1800');
      if (cached) return res.status(200).json(cached);

      const lyricsData = await fetchMultiSourceLyrics(title, artist);
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

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function fetchSaavnSearch(query, count = 20) {
  if (!query) return [];
  const apiUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${count}&p=1&q=${encodeURIComponent(query)}`;
  const r = await fetchWithTimeout(
    apiUrl,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    },
    2000
  );
  if (!r.ok) return [];
  const data = await r.json();
  return data.results || [];
}

async function fetchSaavnTrending(lang = 'english') {
  const apiUrl = `https://www.jiosaavn.com/api.php?__call=content.getTrending&api_version=4&_format=json&_marker=0&ctx=web6dot0&entity_type=song&entity_language=${lang}`;
  const r = await fetchWithTimeout(
    apiUrl,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    },
    2200
  );
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data)
    ? data.filter((item) => item.type === 'song' && item.more_info?.encrypted_media_url)
    : [];
}

async function fetchYouTubeSearch(query) {
  if (!query) return [];
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
        query: `${query} song`
      })
    },
    1400
  );
  if (!r.ok) return [];
  const data = await r.json();
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const videos = [];
  for (const sec of sections) {
    const items = sec?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item.videoRenderer;
      if (!v || !v.videoId) continue;
      const lengthText = v.lengthText?.simpleText || '';
      const parts = lengthText.split(':').map(Number);
      let seconds = 0;
      if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
      else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (seconds < 45 || seconds > 900) continue;

      videos.push({
        videoId: v.videoId,
        title: v.title?.runs?.[0]?.text || 'Unknown Title',
        author:
          v.ownerText?.runs?.[0]?.text ||
          v.longBylineText?.runs?.[0]?.text ||
          'Unknown Artist',
        lengthSeconds: seconds || 210,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        thumbnailLarge: `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`
      });
    }
  }
  return videos.slice(0, 15);
}

function cleanSongTitle(rawTitle) {
  return (rawTitle || '')
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .replace(/feat\..*/gi, '')
    .replace(/ft\..*/gi, '')
    .replace(/-\s*from.*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchMultiSourceLyrics(rawTitle, rawArtist) {
  const cleanTitle = cleanSongTitle(rawTitle) || rawTitle;
  const primaryArtist = (rawArtist || '').split(',')[0].split('&')[0].split('-')[0].trim();

  // 1. Try LRCLIB with track_name + artist_name
  try {
    const lrcUrl1 = `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`;
    const r1 = await fetch(lrcUrl1, {
      headers: { 'User-Agent': 'WaveCraft/2.0 (https://wavecraft.app)' }
    });
    if (r1.ok) {
      const list = await r1.json();
      if (Array.isArray(list) && list.length > 0) {
        const best = list.find((item) => item.syncedLyrics) || list.find((item) => item.plainLyrics);
        if (best && (best.syncedLyrics || best.plainLyrics)) {
          return {
            synced: Boolean(best.syncedLyrics),
            lyrics: best.syncedLyrics || best.plainLyrics,
            source: 'WaveSync • Time-Synced'
          };
        }
      }
    }
  } catch {}

  // 2. Try general query search
  try {
    const lrcUrl2 = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${primaryArtist}`)}`;
    const r2 = await fetch(lrcUrl2, {
      headers: { 'User-Agent': 'WaveCraft/2.0 (https://wavecraft.app)' }
    });
    if (r2.ok) {
      const list = await r2.json();
      if (Array.isArray(list) && list.length > 0) {
        const titleLower = cleanTitle.toLowerCase();
        const match =
          list.find((item) => item.trackName?.toLowerCase().includes(titleLower) && item.syncedLyrics) ||
          list.find((item) => item.trackName?.toLowerCase().includes(titleLower) && item.plainLyrics);
        if (match && (match.syncedLyrics || match.plainLyrics)) {
          return {
            synced: Boolean(match.syncedLyrics),
            lyrics: match.syncedLyrics || match.plainLyrics,
            source: 'WaveSync Lyrics'
          };
        }
      }
    }
  } catch {}

  // 3. Try plain lyrics lookup
  try {
    if (primaryArtist && cleanTitle) {
      const ovhRes = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`
      );
      if (ovhRes.ok) {
        const ovhData = await ovhRes.json();
        if (ovhData?.lyrics) {
          return {
            synced: false,
            lyrics: ovhData.lyrics.trim(),
            source: 'Studio Lyrics'
          };
        }
      }
    }
  } catch {}

  // 4. Fallback: Official Liner Notes
  try {
    const ytSearchRes = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
        query: `${cleanTitle} ${primaryArtist} lyrics`
      })
    });
    if (ytSearchRes.ok) {
      const ytData = await ytSearchRes.json();
      const contents =
        ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
          ?.contents?.[0]?.itemSectionRenderer?.contents || [];
      const videoIds = contents
        .filter((c) => c.videoRenderer?.videoId)
        .slice(0, 3)
        .map((c) => c.videoRenderer.videoId);

      let fallbackDesc = '';
      for (const vid of videoIds) {
        const nextRes = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
            videoId: vid
          })
        });
        if (!nextRes.ok) continue;
        const nextData = await nextRes.json();
        const items =
          nextData?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
        const sec = items.find((c) => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;
        const desc = sec?.attributedDescription?.content || '';
        if (desc && desc.length > 120) {
          // Clean hashtags and URLs from description
          const cleanedDesc = desc
            .split('\n')
            .filter(
              (line) =>
                !line.trim().startsWith('http') &&
                !line.trim().startsWith('#') &&
                !line.toLowerCase().includes('subscribe') &&
                !line.toLowerCase().includes('follow us')
            )
            .join('\n')
            .trim();
          if (cleanedDesc.length > 80) {
            fallbackDesc = cleanedDesc;
            if (desc.toLowerCase().includes('lyrics')) break;
          }
        }
      }

      if (fallbackDesc) {
        return {
          synced: false,
          lyrics: fallbackDesc,
          source: 'Studio Liner Notes'
        };
      }
    }
  } catch {}

  return { synced: false, lyrics: null, source: null };
}

async function importExternalPlaylist(playlistUrl) {
  if (!playlistUrl) return { error: 'Missing playlist URL' };

  // 1. External Playlist or Album Link (Type A)
  if (playlistUrl.includes('spotify.com')) {
    const typeMatch = playlistUrl.match(/spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
    if (typeMatch) {
      const [, entityType, id] = typeMatch;
      const embedUrl = `https://open.spotify.com/embed/${entityType}/${id}`;
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
          if (entity) {
            const name = entity.name || entity.title || 'Imported Playlist';
            const coverUrl = entity.visualIdentity?.image?.[0]?.url || '';
            const trackList = entity.trackList || [];
            const queries = trackList.slice(0, 30).map((t) => ({
              title: t.title,
              artist: (t.subtitle || '').replace(/\u00a0/g, ' ')
            }));
            return {
              platform: 'External Link',
              name,
              coverUrl,
              queries
            };
          }
        }
      }
    }
  }

  // 2. External Playlist Link (Type B)
  if (playlistUrl.includes('youtube.com') || playlistUrl.includes('youtu.be')) {
    const listMatch = playlistUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch) {
      const listId = listMatch[1];
      const r = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
          browseId: `VL${listId}`
        })
      });
      if (r.ok) {
        const data = await r.json();
        const title =
          data?.header?.playlistHeaderRenderer?.title?.simpleText ||
          data?.metadata?.playlistMetadataRenderer?.title ||
          'Imported Playlist';
        const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
        const contents =
          tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer
            ?.contents?.[0]?.playlistVideoListRenderer?.contents || [];

        const queries = [];
        for (const item of contents.slice(0, 30)) {
          const pv = item.playlistVideoRenderer;
          if (!pv) continue;
          queries.push({
            title: pv.title?.runs?.[0]?.text || '',
            artist: pv.shortBylineText?.runs?.[0]?.text || '',
            videoId: pv.videoId
          });
        }
        return {
          platform: 'External Link',
          name: title,
          coverUrl: queries[0]?.videoId
            ? `https://i.ytimg.com/vi/${queries[0].videoId}/hqdefault.jpg`
            : '',
          queries
        };
      }
    }
  }

  return { error: 'Could not parse playlist link. Make sure the playlist is public.' };
}
