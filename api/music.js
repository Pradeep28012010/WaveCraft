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

async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
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

      return res.status(200).json({ releases: [] });
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

    if (action === 'resolve-stream') {
      const title = (url.searchParams.get('title') || '').trim();
      const artist = (url.searchParams.get('artist') || '').trim();
      const videoId = (url.searchParams.get('videoId') || '').trim();
      if (!title && !videoId) return res.status(400).json({ error: 'Title or videoId required' });

      const cacheKey = `stream:${videoId || `${title.toLowerCase()}__${artist.toLowerCase()}`}`;
      const cached = getCached(cacheKey);
      res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600');
      if (cached) return res.status(200).json(cached);

      let streamData = null;
      if (title) {
        streamData = await resolveDirectAudioStream(title, artist);
      }
      if (!streamData && videoId) {
        streamData = await resolveYouTubeAudioStream(videoId);
      }

      if (streamData?.audioUrl) {
        setCached(cacheKey, streamData, 3_600_000);
        return res.status(200).json(streamData);
      }
      return res.status(404).json({ error: 'Direct stream not found' });
    }

    if (action === 'proxy-stream') {
      const audioUrl = url.searchParams.get('url') || '';
      if (!audioUrl) return res.status(400).json({ error: 'URL required' });
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
        const arrayBuf = await upstream.arrayBuffer();
        return res.status(200).send(Buffer.from(arrayBuf));
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

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const jamRooms = new Map();
const roomSubscribers = new Map();

function broadcastToRoom(roomCode, data) {
  const subs = roomSubscribers.get(roomCode);
  if (!subs || subs.size === 0) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of subs) {
    try {
      if (typeof client.write === 'function') {
        client.write(msg);
      }
    } catch {
      subs.delete(client);
    }
  }
}

function handleJamRoomSseStream(req, res, roomCode) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  if (!roomSubscribers.has(roomCode)) {
    roomSubscribers.set(roomCode, new Set());
  }
  const subs = roomSubscribers.get(roomCode);
  subs.add(res);

  res.write(': connected\n\n');
  const room = jamRooms.get(roomCode);
  if (room) {
    res.write(`data: ${JSON.stringify(room)}\n\n`);
  }

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
      subs.delete(res);
    }
  }, 15000);

  req.on?.('close', () => {
    clearInterval(keepAlive);
    subs.delete(res);
  });
}

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
  } else if (op === 'signal' && body.signal) {
    broadcastToRoom(roomCode, {
      eventType: 'webrtc-signal',
      roomCode,
      signal: body.signal
    });
    return { ok: true };
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
    if (body.syncAnchor) room.syncAnchor = body.syncAnchor;
    if (body.rendezvousAt) room.rendezvousAt = body.rendezvousAt;
  }

  const payload = {
    ...room,
    eventType: op,
    serverTime: now
  };
  broadcastToRoom(roomCode, payload);
  return payload;
}

function parseTrackMetadata(rawTitle, rawArtist) {
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

async function fetchYouTubeSearch(query, limit = 25) {
  if (!query) return [];
  const clean = query.trim();
  const ytQuery = /song|remix|official|audio|music|album|track/i.test(clean) || clean.split(/\s+/).length > 2
    ? clean
    : `${clean} song`;

  const wantsInstrumental = /\b(instrumental|karaoke|backing|piano|flute|guitar|bgm|violin|ringtone)\b/i.test(clean);

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

      // Discard ringtones, whatsapp status clips, sound effects, and compilations if user didn't ask
      if (!wantsInstrumental) {
        if (/\b(ringtone|whatsapp\s*status|shorts|sound\s*effect|sfx|status\s*video|tiktok\s*audio)\b/i.test(rawTitle)) {
          continue;
        }
      }
      if (!wantsLong) {
        if (/\b(top\s*\d+|most\s*viewed|compilation|jukebox|nonstop|non-stop)\b/i.test(rawTitle)) {
          continue;
        }
      }

      seenIds.add(v.videoId);

      const rawAuthor =
        v.ownerText?.runs?.[0]?.text ||
        v.longBylineText?.runs?.[0]?.text ||
        'WaveCraft Cloud';

      const { cleanTitle, cleanArtist } = parseTrackMetadata(rawTitle, rawAuthor);
      const thumb = `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      const thumbLarge = `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`;

      tracks.push({
        id: `yt_${v.videoId}`,
        title: cleanTitle || rawTitle,
        artist: cleanArtist || rawAuthor,
        album: 'WaveCraft Cloud',
        duration: seconds || 210,
        thumbnail: thumb,
        thumbnailLarge: thumbLarge,
        thumbnailUrl: thumb,
        youtubeId: v.videoId,
        quality: 'Studio Audio'
      });
    }
  }

  // Demote instrumental/karaoke below vocal tracks if user didn't ask for instrumental
  if (!wantsInstrumental) {
    tracks.sort((a, b) => {
      const aInst = /\b(instrumental|karaoke|backing\s*track|minus\s*one|no\s*vocals?|piano\s*(?:cover|version)|flute|guitar\s*cover|bgm)\b/i.test(a.title);
      const bInst = /\b(instrumental|karaoke|backing\s*track|minus\s*one|no\s*vocals?|piano\s*(?:cover|version)|flute|guitar\s*cover|bgm)\b/i.test(b.title);
      if (aInst && !bInst) return 1;
      if (!aInst && bInst) return -1;
      return 0;
    });
  }

  return tracks.slice(0, limit);
}

const SPOTIFY_TRENDING_PLAYLISTS = {
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

async function fetchSpotifyTrending(categoryKey = 'global') {
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

const TOP_GLOBAL_TRENDING_SEEDS = [
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

async function fetchYouTubeTrending() {
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

async function importExternalPlaylist(playlistUrl) {
  if (!playlistUrl) return { error: 'Missing playlist URL' };

  let targetUrl = playlistUrl.trim();

  // Handle Spotify shortlinks (e.g., https://spotify.link/AbCdEf123)
  if (targetUrl.includes('spotify.link/')) {
    try {
      const red = await fetch(targetUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (red.url) targetUrl = red.url;
    } catch {}
  }

  // 1. Spotify Playlist / Album / Track Link
  if (targetUrl.includes('spotify.com') || targetUrl.startsWith('spotify:')) {
    const typeMatch =
      targetUrl.match(/spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(playlist|album|track)\/([a-zA-Z0-9]+)/i) ||
      targetUrl.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/i);

    if (typeMatch) {
      const [, entityType, id] = typeMatch;
      const embedUrl = `https://open.spotify.com/embed/${entityType}/${id}`;
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

              // If playlist has more than 100 tracks and session token is available, paginate through remaining tracks
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

              if (queries.length > 0) {
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
      } catch (err) {
        console.warn('Spotify embed fetch failed:', err);
      }
    }
  }

  // 2. YouTube / YouTube Music Playlist Link
  if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
    const listMatch = targetUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    if (listMatch) {
      const listId = listMatch[1];
      const ytClientContext = {
        client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' }
      };

      try {
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
          const sectionContents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

          let initialItems = [];
          for (const sec of sectionContents) {
            const listItems =
              sec?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents ||
              sec?.itemSectionRenderer?.contents ||
              [];
            initialItems.push(...listItems);
          }

          const queries = [];
          const extractFromItems = (items) => {
            let token = null;
            for (const item of items) {
              // Format A: Modern YouTube lockupViewModel (2024/2025/2026)
              const vm = item.lockupViewModel;
              if (vm) {
                const videoId =
                  vm.contentId ||
                  vm.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
                const songTitle =
                  vm.metadata?.lockupMetadataViewModel?.title?.content ||
                  vm.rendererContext?.accessibilityContext?.label ||
                  '';
                const artist =
                  vm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]
                    ?.metadataParts?.[0]?.text?.content || '';
                if (videoId && songTitle) {
                  queries.push({
                    title: songTitle,
                    artist,
                    videoId
                  });
                }
              }

              // Format B: Legacy playlistVideoRenderer
              const pv = item.playlistVideoRenderer;
              if (pv && pv.videoId) {
                queries.push({
                  title: pv.title?.runs?.[0]?.text || pv.title?.simpleText || '',
                  artist: pv.shortBylineText?.runs?.[0]?.text || '',
                  videoId: pv.videoId
                });
              }

              // Continuation Token (both formats)
              const cont =
                item.continuationItemViewModel?.continuationEndpoint?.continuationCommand?.token ||
                item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
              if (cont) token = cont;
            }
            return token;
          };

          let nextToken = extractFromItems(initialItems);
          let pageCount = 0;

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

          if (queries.length > 0) {
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
      } catch (err) {
        console.warn('YouTubei playlist browse failed:', err);
      }
    }

    // Fallback for single YouTube video links (e.g. https://youtu.be/XYZ or https://www.youtube.com/watch?v=XYZ)
    const singleMatch = targetUrl.match(/(?:watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (singleMatch) {
      const videoId = singleMatch[1];
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          return {
            platform: 'YouTube',
            name: oembed.title || 'Imported Song',
            coverUrl: oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            queries: [
              {
                title: oembed.title || 'Imported Song',
                artist: oembed.author_name || 'YouTube',
                videoId
              }
            ]
          };
        }
      } catch {}
    }
  }

  // 3. Apple Music / iTunes Album Link
  if (targetUrl.includes('apple.com')) {
    const albumMatch = targetUrl.match(/album\/(?:[^\/]+\/)?(\d+)/i) || targetUrl.match(/[?&]i=(\d+)/i);
    if (albumMatch) {
      const id = albumMatch[1];
      try {
        const itunesRes = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=song`);
        if (itunesRes.ok) {
          const itunesData = await itunesRes.json();
          const results = itunesData?.results || [];
          if (results.length > 0) {
            const collection = results.find((r) => r.wrapperType === 'collection') || results[0];
            const name = collection.collectionName || 'Imported Apple Music Album';
            const rawCover = collection.artworkUrl100 || '';
            const coverUrl = rawCover ? rawCover.replace('100x100bb', '600x600bb') : '';
            const trackItems = results.filter((r) => r.wrapperType === 'track');
            const queries = trackItems.map((t) => ({
              title: t.trackName || '',
              artist: t.artistName || collection.artistName || ''
            }));

            if (queries.length > 0) {
              return {
                platform: 'Apple Music',
                name,
                coverUrl,
                queries
              };
            }
          }
        }
      } catch (err) {
        console.warn('Apple Music / iTunes lookup failed:', err);
      }
    }

    // Apple Music Playlist URL (e.g. https://music.apple.com/us/playlist/todays-hits/pl.f4d1060b52a243d7b321e1e8a70f8e37)
    const playlistMatch = targetUrl.match(/playlist\/(?:[^\/]+\/)?(pl\.[a-zA-Z0-9_-]+)/i);
    if (playlistMatch) {
      try {
        const pageRes = await fetch(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        if (pageRes.ok) {
          const html = await pageRes.text();

          // Title & cover from meta
          const titleMatch =
            html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<title>([^<]+)<\/title>/i);
          const rawTitle = titleMatch ? titleMatch[1].replace(/\s*[-–—]\s*(Apple Music|Playlist).*$/i, '').trim() : 'Apple Music Playlist';

          const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
          const coverUrl = imgMatch ? imgMatch[1] : '';

          const queries = [];

          // Format A: JSON-LD MusicPlaylist schema
          const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
          if (jsonLdMatches) {
            for (const scriptTag of jsonLdMatches) {
              try {
                const inner = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
                const data = JSON.parse(inner);
                const tracks = data?.track || (Array.isArray(data) ? data : []);
                if (Array.isArray(tracks)) {
                  for (const tr of tracks) {
                    const songName = tr?.name;
                    const artistName =
                      tr?.byArtist?.name ||
                      (Array.isArray(tr?.byArtist) ? tr.byArtist.map((a) => a.name).join(', ') : '');
                    if (songName) {
                      queries.push({
                        title: songName,
                        artist: artistName || ''
                      });
                    }
                  }
                }
              } catch {}
            }
          }

          // Format B: Extract from tracklist table or data-testid attributes
          if (queries.length === 0) {
            const rowMatches = html.matchAll(/data-testid=["']track-title["'][^>]*>([^<]+)<\/a>[\s\S]*?data-testid=["']track-artist["'][^>]*>([^<]+)<\/a>/gi);
            for (const m of rowMatches) {
              if (m[1]) {
                queries.push({
                  title: m[1].trim(),
                  artist: (m[2] || '').trim()
                });
              }
            }
          }

          if (queries.length > 0) {
            return {
              platform: 'Apple Music',
              name: rawTitle,
              coverUrl,
              queries
            };
          }
        }
      } catch (plErr) {
        console.warn('Apple Music playlist scrape failed:', plErr);
      }
    }
  }

  return { error: 'Could not parse playlist link. Make sure the playlist or album is public.' };
}

// -------------------------------------------------------------
// Direct 320kbps Audio Stream Resolution via Saavn CDN
// -------------------------------------------------------------
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_S = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
];
const DES_SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];

function desPermute(bits, table) { return table.map((i) => bits[i - 1]); }
function desBytesToBits(bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}
function desBitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  return bytes;
}

const desKeyBits = desPermute(desBytesToBits([...'38346591'].map((c) => c.charCodeAt(0))), DES_PC1);
let desC = desKeyBits.slice(0, 28);
let desD = desKeyBits.slice(28);
const desSubKeys = DES_SHIFTS.map((s) => {
  desC = desC.slice(s).concat(desC.slice(0, s));
  desD = desD.slice(s).concat(desD.slice(0, s));
  return desPermute(desC.concat(desD), DES_PC2);
}).reverse();

function decryptSaavnMediaUrl(enc) {
  if (!enc) return undefined;
  try {
    const raw = Buffer.from(enc, 'base64');
    const out = [];
    for (let off = 0; off < raw.length; off += 8) {
      const block = desPermute(desBytesToBits(raw.slice(off, off + 8)), DES_IP);
      let L = block.slice(0, 32);
      let R = block.slice(32);
      for (let round = 0; round < 16; round++) {
        const exp = desPermute(R, DES_E).map((b, idx) => b ^ desSubKeys[round][idx]);
        const sOut = [];
        for (let sb = 0; sb < 8; sb++) {
          const chunk = exp.slice(sb * 6, sb * 6 + 6);
          const row = (chunk[0] << 1) | chunk[5];
          const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
          const val = DES_S[sb][row * 16 + col];
          sOut.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
        }
        const f = desPermute(sOut, DES_P);
        const nextR = L.map((b, idx) => b ^ f[idx]);
        L = R;
        R = nextR;
      }
      out.push(...desBitsToBytes(desPermute(R.concat(L), DES_FP)));
    }
    const pad = out[out.length - 1];
    const clean = pad >= 1 && pad <= 8 ? out.slice(0, out.length - pad) : out;
    const url = String.fromCharCode(...clean)
      .replace('_96.mp4', '_320.mp4')
      .replace('_160.mp4', '_320.mp4')
      .replace('http://', 'https://')
      .replace('web.saavncdn.com', 'aac.saavncdn.com')
      .replace('preview.saavncdn.com', 'aac.saavncdn.com');
    return url.startsWith('https://') ? url : undefined;
  } catch {
    return undefined;
  }
}

async function resolveDirectAudioStream(title, artist) {
  if (!title) return null;
  let cleanTitle = (title || '')
    .replace(/\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*video|lyrical\s*song|video\s*song|full\s*song|4k|8k|hd|audio\s*song|audio|visualizer|remastered|lyrics|prod\s*\..*?|dir\s*\..*?|second\s*single|first\s*single|third\s*single|promo|teaser|trailer)[\)\]]\s*/gi, ' ')
    .replace(/\s+(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|full\s+audio|8k\s+video|4k\s+video|hd\s+video|official\s+video|official\s+audio|second\s+single|first\s+single|promo\s+song|video)\b.*$/i, '')
    .replace(/\|\s*.*$/g, '')
    .replace(/[-–—]\s*(?:video|lyric|audio|full|song).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  let cleanArtist = (artist || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*(?:VEVO|Records|Entertainment|Music|Official|Channel|Series|Films)\b.*$/i, '')
    .replace(/\s*,\s*.*$/, '')
    .replace(/\s+(?:feat\.|ft\.|second\s*single|first\s*single).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const candidateQueries = [
    cleanArtist ? `${cleanTitle} ${cleanArtist}`.trim() : cleanTitle,
    cleanTitle,
    title.split(/[-–—]/)[0]?.trim()
  ].filter((q, idx, arr) => Boolean(q) && q.length > 1 && arr.indexOf(q) === idx);

  for (const q of candidateQueries) {
    try {
      const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&p=1&n=5&q=${encodeURIComponent(q)}`;
      const res = await fetchWithTimeout(saavnUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 3500);
      if (res.ok) {
        const data = await res.json();
        const results = data?.results || [];
        if (Array.isArray(results) && results.length > 0) {
          for (const item of results) {
            const enc = item?.more_info?.encrypted_media_url;
            if (enc) {
              const directUrl = decryptSaavnMediaUrl(enc);
              if (directUrl && directUrl.startsWith('https://')) {
                return {
                  audioUrl: directUrl,
                  quality: '320kbps Studio AAC',
                  title: item.title,
                  artist: item.subtitle
                };
              }
            }
          }
        }
      }
    } catch {}
  }

  // iTunes preview fallback
  try {
    const itunesQuery = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(itunesQuery)}&entity=song&limit=3`;
    const itRes = await fetchWithTimeout(itunesUrl, {}, 3500);
    if (itRes.ok) {
      const itData = await itRes.json();
      const match = itData?.results?.find((r) => r.previewUrl && r.previewUrl.startsWith('https://'));
      if (match?.previewUrl) {
        return {
          audioUrl: match.previewUrl,
          quality: '256kbps High-Fidelity AAC',
          title: match.trackName,
          artist: match.artistName
        };
      }
    }
  } catch {}

  return null;
}

async function resolveYouTubeAudioStream(videoId) {
  if (!videoId) return null;
  try {
    const res = await fetchWithTimeout(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '19.09.37',
              hl: 'en',
              gl: 'US'
            }
          },
          videoId
        })
      },
      4500
    );
    if (!res.ok) return null;
    const data = await res.json();
    const formats = data?.streamingData?.adaptiveFormats || [];
    const audioFormats = formats.filter(
      (f) => f.mimeType && f.mimeType.startsWith('audio/') && f.url
    );
    if (audioFormats.length > 0) {
      audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      return {
        audioUrl: audioFormats[0].url,
        quality: `${Math.round((audioFormats[0].bitrate || 128000) / 1000)}kbps Audio`,
        title: data.videoDetails?.title || '',
        artist: data.videoDetails?.author || ''
      };
    }
  } catch {}
  return null;
}

