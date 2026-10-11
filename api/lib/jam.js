/**
 * WaveJam Real-time Live Listening Room Coordinator.
 * Manages shared synchronized playback, collaborative queues, live chat, and WebRTC signalling.
 */

export const jamRooms = new Map();
export const roomSubscribers = new Map();

export function broadcastToRoom(roomCode, data) {
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

export function handleJamRoomSseStream(req, res, roomCode) {
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

export async function readJsonBody(req) {
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

export async function handleJamRoomRequest(req, url, roomCode) {
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
