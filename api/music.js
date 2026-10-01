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

      const [saavnRes, itunesRes, ytRes] = await Promise.allSettled([
        fetchSaavnSearch(q, 25),
        fetchItunesSearch(q, 25),
        fetchYouTubeSearch(q)
      ]);
      const payload = {
        saavn: saavnRes.status === 'fulfilled' ? saavnRes.value : [],
        itunes: itunesRes.status === 'fulfilled' ? itunesRes.value : [],
        youtube: ytRes.status === 'fulfilled' ? ytRes.value : []
      };
      if (payload.saavn.length > 0 || payload.itunes.length > 0 || payload.youtube.length > 0) {
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

    if (action === 'jam') {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      const roomCode = (url.searchParams.get('room') || '').trim().toUpperCase();
      if (!roomCode) {
        return res.status(400).json({ error: 'Room code required' });
      }
      const result = await handleJamRoomRequest(req, url, roomCode);
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const jamRooms = new Map();

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on?.('data', (chunk) => {
      raw += chunk;
      if (raw.length > 250_000) req.destroy?.();
    });
    req.on?.('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on?.('error', () => resolve({}));
  });
}

async function handleJamRoomRequest(req, url, roomCode) {
  const now = Date.now();
  // Clean up expired rooms (> 2 hours idle)
  for (const [key, rm] of jamRooms.entries()) {
    if (now - rm.updatedAt > 7_200_000) jamRooms.delete(key);
  }

  const op = url.searchParams.get('op') || (req.method === 'POST' ? 'sync' : 'get');
  const body = req.method === 'POST' ? await readJsonBody(req) : {};

  const userId = body.userId || url.searchParams.get('userId');
  const userName = body.userName || url.searchParams.get('userName');

  let room = jamRooms.get(roomCode);
  if (!room) {
    const isCreatingOrSyncingHost = op === 'sync' || Boolean(body.hostName);
    room = {
      roomCode,
      hostId: isCreatingOrSyncingHost ? userId || 'host' : 'host',
      hostName: body.hostName || (isCreatingOrSyncingHost ? userName : null) || 'DJ Host',
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      updatedAt: now,
      trackOverrideAt: 0,
      stateVersion: 1,
      queue: [],
      guestTracks: [],
      members: [],
      reactions: [],
      messages: []
    };
    jamRooms.set(roomCode, room);
  }

  if (op === 'leave' && userId) {
    room.members = room.members.filter((m) => m.id !== userId);
    return room;
  }

  if (userId && userName) {
    const existing = room.members.find((m) => m.id === userId);
    if (existing) {
      existing.name = userName;
      existing.lastSeen = now;
    } else {
      room.members.push({ id: userId, name: userName, lastSeen: now });
      room.messages.push({
        id: `sys-${now}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'WaveJam',
        text: `🎧 ${userName} joined the Jam!`,
        isSystem: true,
        createdAt: now
      });
    }
  }

  // Prune members inactive for > 25s
  room.members = room.members.filter((m) => now - m.lastSeen < 25_000);
  // Keep reactions from last 20s
  room.reactions = room.reactions.filter((r) => now - r.createdAt < 20_000).slice(-20);
  // Keep last 40 chat messages
  room.messages = (room.messages || []).slice(-40);

  if (op === 'sync') {
    if (body.hostName) room.hostName = body.hostName;
    if (userId) room.hostId = userId;

    // Only accept host currentTrack if a collaborative play-track didn't just override it in the last 4s
    const recentOverride = room.trackOverrideAt && now - room.trackOverrideAt < 4000;
    if (!recentOverride) {
      if (body.currentTrack !== undefined && (body.currentTrack || !room.currentTrack)) {
        room.currentTrack = body.currentTrack;
      }
      if (typeof body.isPlaying === 'boolean') room.isPlaying = body.isPlaying;
      if (typeof body.currentTime === 'number') room.currentTime = body.currentTime;
      if (body.syncAnchor) room.syncAnchor = body.syncAnchor;
    }

    if (Array.isArray(body.queue)) {
      const merged = [...body.queue];
      for (const gt of room.guestTracks || []) {
        if (!merged.some((t) => t.id === gt.id)) {
          merged.push(gt);
        }
      }
      room.queue = merged.slice(0, 40);
    }
    room.updatedAt = now;
  } else if (op === 'react') {
    const emoji = body.emoji || url.searchParams.get('emoji') || '🔥';
    const sender = userName || 'Listener';
    const reactionId = body.id || `${now}-${Math.random().toString(36).slice(2, 6)}`;
    if (!room.reactions.some((r) => r.id === reactionId)) {
      room.reactions.push({
        id: reactionId,
        emoji,
        sender,
        createdAt: now
      });
    }
  } else if (op === 'chat' && body.text) {
    const msgId = body.id || `${now}-${Math.random().toString(36).slice(2, 6)}`;
    if (!room.messages.some((m) => m.id === msgId)) {
      room.messages.push({
        id: msgId,
        sender: userName || 'Listener',
        text: String(body.text).slice(0, 240),
        createdAt: now
      });
    }
  } else if (op === 'add-track' && body.track) {
    const exists = room.queue.some((t) => t.id === body.track.id);
    if (!exists) {
      room.queue.push(body.track);
    }
    if (!room.guestTracks.some((t) => t.id === body.track.id)) {
      room.guestTracks.push(body.track);
    }
    if (!room.currentTrack || body.playNow) {
      room.currentTrack = body.track;
      room.isPlaying = true;
      room.currentTime = 0;
      room.trackOverrideAt = now;
    }
    room.stateVersion = (room.stateVersion || 1) + 1;
    room.updatedAt = now;
    room.messages.push({
      id: `sys-${now}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'WaveJam',
      text: `🎵 ${userName || 'A listener'} ${body.playNow ? 'started playing' : 'queued'} "${body.track.title}"`,
      isSystem: true,
      createdAt: now
    });
  } else if (op === 'play-track' && body.track) {
    if (!room.queue.some((t) => t.id === body.track.id)) {
      room.queue.push(body.track);
    }
    room.currentTrack = body.track;
    room.isPlaying = true;
    room.currentTime = 0;
    room.trackOverrideAt = now;
    room.stateVersion = (room.stateVersion || 1) + 1;
    room.updatedAt = now;
  }

  return {
    ...room,
    serverTime: now
  };
}

async function fetchSaavnSearch(query, count = 25) {
  if (!query) return [];
  const cleanQ = query.trim();
  const apiUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${count}&p=1&q=${encodeURIComponent(cleanQ)}`;
  try {
    const r = await fetchWithTimeout(
      apiUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      },
      2500
    );
    if (!r.ok) return [];
    const data = await r.json();
    let results = Array.isArray(data.results) ? data.results : [];

    // If search results are sparse, query autocomplete to find exact matching tracks
    if (results.length < 3) {
      try {
        const autoUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&api_version=4&ctx=web6dot0&query=${encodeURIComponent(cleanQ)}`;
        const autoRes = await fetchWithTimeout(autoUrl, { headers: { 'Accept': 'application/json' } }, 1800);
        if (autoRes.ok) {
          const autoData = await autoRes.json();
          const autoSongs = autoData?.songs?.data || [];
          const existingIds = new Set(results.map((r) => r.id));
          for (const s of autoSongs) {
            if (s && s.id && !existingIds.has(s.id)) {
              results.push(s);
              existingIds.add(s.id);
            }
          }
        }
      } catch {}
    }

    return results;
  } catch {
    return [];
  }
}

async function fetchItunesSearch(query, count = 25) {
  if (!query) return [];
  const cleanQ = query.trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&entity=song&limit=${count}&media=music`;
  try {
    const r = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      },
      2500
    );
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
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
  const clean = query.trim();
  const ytQuery = /song|remix|official|audio|music|album/i.test(clean) || clean.split(/\s+/).length > 2
    ? clean
    : `${clean} official audio`;

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
    2500
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

function parseTrackMetadata(rawTitle, rawArtist) {
  let title = (rawTitle || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

  let artist = (rawArtist || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

  // Strip generic label channels from artist
  const isLabelChannel =
    /^(?:t-series|aditya\s*music|sony\s*music|zee\s*music|saregama|think\s*music|lahari\s*music|junglee\s*music|tips\s*official|yrf|mythri|hombale|wavecraft|unknown\s*artist|official\s*channel|records|films|movies)\b/i.test(
      artist
    );
  if (isLabelChannel) {
    artist = '';
  }

  // Remove common YouTube video fluff in parentheses/brackets
  title = title
    .replace(
      /\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*video|video\s*song|full\s*song|4k|8k|hd|audio|visualizer|remastered|lyrics)[\)\]]\s*/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  // If title has pipes: e.g., "Song | Movie | Artist"
  if (title.includes('|')) {
    const pipeParts = title.split('|').map((p) => p.trim()).filter(Boolean);
    title = pipeParts[0] || title;
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
        artist = part0;
        title = part1;
      }
    }
  }

  // Clean title: remove movie tags, "(From ...)", feat, etc.
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

  return { cleanTitle: cleanTitle || title, cleanArtist, primaryArtist };
}

function normalizeForMatch(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateMatchScore(queryTitle, queryArtist, candidateTitle, candidateArtist, candidateDuration = 0, targetDuration = 0) {
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

async function fetchMultiSourceLyrics(rawTitle, rawArtist, duration = 0) {
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

  // 3. Try JioSaavn Official Lyrics API with strict candidate validation
  try {
    const q = primaryArtist ? `${cleanTitle} ${primaryArtist}` : cleanTitle;
    const searchRes = await fetchSaavnSearch(q.trim(), 6);
    for (const item of searchRes) {
      const itemTitle = (item.song || item.title || '').replace(/&quot;/g, '"');
      const itemArtist = (
        item.more_info?.singers ||
        item.subtitle ||
        item.more_info?.artistMap?.primary_artists?.[0]?.name ||
        ''
      ).replace(/&quot;/g, '"');

      const score = calculateMatchScore(
        cleanTitle,
        primaryArtist || cleanArtist,
        itemTitle,
        itemArtist,
        0,
        duration
      );

      if (score >= 0.70 && (item.more_info?.has_lyrics === 'true' || item.more_info?.lyrics_id || item.id)) {
        const lyricsId = item.id || item.more_info?.lyrics_id;
        const saavnLyricsUrl = `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&ctx=web6dot0&api_version=4&_format=json&_marker=0&lyrics_id=${lyricsId}`;
        const lrRes = await fetchWithTimeout(saavnLyricsUrl, {}, 2200);
        if (lrRes.ok) {
          const lrData = await lrRes.json();
          if (lrData?.lyrics) {
            const formatted = lrData.lyrics
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .trim();
            if (formatted.length > 30) {
              return {
                synced: false,
                lyrics: formatted,
                source: 'Studio Lyrics • JioSaavn Verified',
                verified: true
              };
            }
          }
        }
      }
    }
  } catch {}

  // 4. Try plain lyrics lookup (lyrics.ovh) with primaryArtist and cleanTitle
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

  // 5. Strict rejection: Never return lyrics from unrelated song
  return { synced: false, lyrics: null, source: null };
}

async function importExternalPlaylist(playlistUrl) {
  if (!playlistUrl) return { error: 'Missing playlist URL' };

  // 1. Spotify Playlist / Album / Track Link — Fetch ALL tracks (Embed + Web API pagination for >100 tracks)
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
          const accessToken = json?.props?.pageProps?.state?.settings?.session?.accessToken;

          if (entity) {
            const name = entity.name || entity.title || 'Imported Playlist';
            const images = Array.isArray(entity.visualIdentity?.image)
              ? [...entity.visualIdentity.image].sort(
                  (a, b) => (b.maxWidth || b.width || 0) - (a.maxWidth || a.width || 0)
                )
              : [];
            const rawCover = images[0]?.url || '';
            const coverUrl = rawCover
              .replace('ab67706f00000001', 'ab67706f00000003')
              .replace('ab67706f00000002', 'ab67706f00000003')
              .replace('ab67616d00004851', 'ab67616d0000b273')
              .replace('ab67616d00001e02', 'ab67616d0000b273');
            const trackList = entity.trackList || [];
            const queries = trackList.map((t) => ({
              title: t.title,
              artist: (t.subtitle || '').replace(/\u00a0/g, ' ')
            }));

            // If playlist has more than 100 tracks and we have an anonymous session token, paginate through ALL remaining tracks!
            if (entityType === 'playlist' && accessToken && trackList.length >= 100) {
              try {
                let nextOffset = trackList.length;
                let keepFetching = true;
                while (keepFetching && nextOffset < 1000) {
                  const apiRes = await fetch(
                    `https://api.spotify.com/v1/playlists/${id}/tracks?offset=${nextOffset}&limit=100`,
                    {
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                      }
                    }
                  );
                  if (!apiRes.ok) break;
                  const pageData = await apiRes.json();
                  const items = pageData?.items || [];
                  if (items.length === 0) break;
                  for (const item of items) {
                    const tr = item?.track;
                    if (tr?.name) {
                      const artists = Array.isArray(tr.artists)
                        ? tr.artists.map((a) => a.name).filter(Boolean).join(', ')
                        : '';
                      queries.push({
                        title: tr.name,
                        artist: artists
                      });
                    }
                  }
                  nextOffset += items.length;
                  if (!pageData.next || items.length < 100) {
                    keepFetching = false;
                  }
                }
              } catch {}
            }

            return {
              platform: 'Spotify',
              name,
              coverUrl,
              queries
            };
          }
        }
      }
    }
  }

  // 2. YouTube / YouTube Music Playlist Link — Fetch ALL tracks + follow continuation tokens for >100 song playlists
  if (playlistUrl.includes('youtube.com') || playlistUrl.includes('youtu.be')) {
    const listMatch = playlistUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch) {
      const listId = listMatch[1];
      const ytClientContext = {
        client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' }
      };
      const r = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: ytClientContext,
          browseId: `VL${listId}`
        })
      });
      if (r.ok) {
        const data = await r.json();
        const title =
          data?.header?.playlistHeaderRenderer?.title?.simpleText ||
          data?.metadata?.playlistMetadataRenderer?.title ||
          'Imported YouTube Playlist';
        const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
        let contents =
          tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer
            ?.contents?.[0]?.playlistVideoListRenderer?.contents || [];

        const queries = [];
        const extractFromItems = (items) => {
          let token = null;
          for (const item of items) {
            const pv = item.playlistVideoRenderer;
            if (pv && pv.videoId) {
              queries.push({
                title: pv.title?.runs?.[0]?.text || '',
                artist: pv.shortBylineText?.runs?.[0]?.text || '',
                videoId: pv.videoId
              });
            }
            const cont =
              item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
            if (cont) token = cont;
          }
          return token;
        };

        let nextToken = extractFromItems(contents);
        let pageCount = 0;

        // Follow continuation pages so playlists with 100 to 1000+ songs import every single track
        while (nextToken && pageCount < 10) {
          pageCount++;
          try {
            const contRes = await fetch(
              'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  context: ytClientContext,
                  continuation: nextToken
                })
              }
            );
            if (!contRes.ok) break;
            const contData = await contRes.json();
            const actions = contData?.onResponseReceivedActions || [];
            const appendedItems =
              actions[0]?.appendContinuationItemsAction?.continuationItems || [];
            if (appendedItems.length === 0) break;
            nextToken = extractFromItems(appendedItems);
          } catch {
            break;
          }
        }

        return {
          platform: 'YouTube',
          name: title,
          coverUrl: queries[0]?.videoId
            ? `https://i.ytimg.com/vi/${queries[0].videoId}/hqdefault.jpg`
            : '',
          queries
        };
      }
    }
  }

  // 3. JioSaavn Featured Playlist or Album Link
  if (playlistUrl.includes('jiosaavn.com')) {
    try {
      const tokenMatch = playlistUrl.match(/\/(featured|album|s\/playlist)\/[^/]+\/([^/?#]+)/);
      const token = tokenMatch ? tokenMatch[2] : playlistUrl.split('/').filter(Boolean).pop();
      const type = playlistUrl.includes('/album/') ? 'album' : 'playlist';
      if (token) {
        const saavnApi = `https://www.jiosaavn.com/api.php?__call=webapi.get&token=${encodeURIComponent(token)}&type=${type}&p=1&n=500&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0`;
        const sr = await fetch(saavnApi, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        if (sr.ok) {
          const sdata = await sr.json();
          const list = sdata?.list || sdata?.songs || [];
          if (Array.isArray(list) && list.length > 0) {
            const queries = list.map((item) => ({
              title: (item.title || item.song || '').replace(/&quot;/g, '"'),
              artist: (item.more_info?.artistMap?.primary_artists?.[0]?.name || item.subtitle || '').replace(/&quot;/g, '"')
            }));
            return {
              platform: 'JioSaavn',
              name: (sdata.title || sdata.listname || 'Imported Saavn Playlist').replace(/&quot;/g, '"'),
              coverUrl: (sdata.image || '').replace('150x150', '500x500'),
              queries
            };
          }
        }
      }
    } catch {}
  }

  return { error: 'Could not parse playlist link. Make sure the playlist is public.' };
}
