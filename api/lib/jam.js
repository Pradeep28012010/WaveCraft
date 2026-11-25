/**
 * WaveJam Real-time Live Listening Room Coordinator.
 * Manages shared synchronized playback, collaborative queues, live chat, and WebRTC signalling.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

export const jamRooms = new Map();
export const roomSubscribers = new Map();

const MAX_JAM_ROOMS = 500;
const MAX_SUBSCRIBERS_PER_ROOM = 100;
const ROOM_IDLE_TTL_MS = 7_200_000;

function secretsMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) {
    return false;
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sanitizeRoom(room) {
  if (!room || typeof room !== 'object') return room;
  const { hostId, hostSecret, guestTracks, ...publicFields } = room;
  return {
    ...publicFields,
    members: Array.isArray(room.members)
      ? room.members.map((m) => ({
          ...m,
          isHost: Boolean(hostId && m?.id === hostId)
        }))
      : []
  };
}

function closeRoomSubscribers(roomCode) {
  const subs = roomSubscribers.get(roomCode);
  if (!subs) return;
  for (const client of subs) {
    try {
      client.end?.();
    } catch {}
  }
  roomSubscribers.delete(roomCode);
}

export function broadcastToRoom(roomCode, data) {
  const subs = roomSubscribers.get(roomCode);
  if (!subs || subs.size === 0) return;
  const sanitized = data && typeof data === 'object' && ('hostId' in data || 'hostSecret' in data)
    ? sanitizeRoom(data)
    : data;
  const msg = `data: ${JSON.stringify(sanitized)}\n\n`;
  for (const client of Array.from(subs)) {
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
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  if (!roomSubscribers.has(roomCode)) {
    roomSubscribers.set(roomCode, new Set());
  }
  const subs = roomSubscribers.get(roomCode);
  if (subs.size >= MAX_SUBSCRIBERS_PER_ROOM) {
    const oldest = subs.values().next().value;
    if (oldest) {
      subs.delete(oldest);
      try { oldest.end?.(); } catch {}
    }
  }
  subs.add(res);

  if (typeof res.write === 'function') {
    res.write(': connected\n\n');
  }
  const room = jamRooms.get(roomCode);
  if (room && typeof res.write === 'function') {
    res.write(`data: ${JSON.stringify(sanitizeRoom(room))}\n\n`);
  }

  const keepAlive = setInterval(() => {
    try {
      if (typeof res.write === 'function') {
        res.write(': ping\n\n');
      }
    } catch {
      clearInterval(keepAlive);
      subs.delete(res);
    }
  }, 12000);

  // Serverless execution timeout guard:
  // Vercel / Netlify forcefully kill functions after 10-15s, triggering 504 errors.
  // By gracefully closing before the platform cap, browser EventSource reconnects seamlessly.
  const isServerless = Boolean(
    process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
  );
  let serverlessTimer = null;
  if (isServerless) {
    serverlessTimer = setTimeout(() => {
      try {
        if (typeof res.write === 'function') {
          res.write(': keepalive-reconnect\n\n');
        }
        res.end?.();
      } catch {}
      clearInterval(keepAlive);
      subs.delete(res);
    }, 8500);
  }

  req.on?.('close', () => {
    if (serverlessTimer) clearTimeout(serverlessTimer);
    clearInterval(keepAlive);
    subs.delete(res);
    if (subs.size === 0) {
      roomSubscribers.delete(roomCode);
    }
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
  // Clean up expired rooms (> 2 hours idle) and enforce bounded map capacity
  for (const [key, rm] of jamRooms.entries()) {
    if (now - rm.updatedAt > ROOM_IDLE_TTL_MS) {
      jamRooms.delete(key);
      closeRoomSubscribers(key);
    }
  }

  const rawOp = (url.searchParams.get('op') || (req.method === 'POST' ? 'sync' : 'get')).trim().toLowerCase();
  const body = req.method === 'POST' ? await readJsonBody(req) : {};
  const requestedEventType = typeof body.eventType === 'string' ? body.eventType.trim() : '';

  const rawUserId = body.userId ?? url.searchParams.get('userId');
  const userId = typeof rawUserId === 'string' ? rawUserId.trim().slice(0, 128) : '';
  const rawUserName = body.userName ?? url.searchParams.get('userName');
  const userName = typeof rawUserName === 'string' ? rawUserName.trim().slice(0, 80) : '';

  const isHostClaimIntent =
    Boolean(userId) &&
    (rawOp === 'create' ||
      (body.isHost === true &&
        (rawOp === 'sync' || rawOp === 'play-track' || rawOp === 'toggle-play' || rawOp === 'add-track')));

  let room = jamRooms.get(roomCode);
  let justClaimedHost = false;

  if (!room) {
    while (jamRooms.size >= MAX_JAM_ROOMS) {
      const oldestKey = jamRooms.keys().next().value;
      if (!oldestKey) break;
      jamRooms.delete(oldestKey);
      closeRoomSubscribers(oldestKey);
    }

    const hostSecret = isHostClaimIntent ? randomBytes(24).toString('hex') : null;
    if (isHostClaimIntent) justClaimedHost = true;

    room = {
      roomCode,
      hostId: isHostClaimIntent ? userId : null,
      hostSecret,
      hostName:
        (typeof body.hostName === 'string' && body.hostName.trim()) ||
        (isHostClaimIntent && userName) ||
        'DJ Host',
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      updatedAt: now,
      trackOverrideAt: 0,
      stateVersion: 1,
      queue: [],
      members: [],
      reactions: [],
      messages: []
    };
    jamRooms.set(roomCode, room);
  } else if (!room.hostId && !room.hostSecret && isHostClaimIntent && rawOp !== 'add-track') {
    // Allow host creation claim if a guest polled op=get before the host's initial sync landed
    room.hostId = userId;
    room.hostSecret = randomBytes(24).toString('hex');
    justClaimedHost = true;
  }

  if (rawOp === 'leave') {
    if (userId) {
      const leaving = room.members.find((m) => m.id === userId);
      room.members = room.members.filter((m) => m.id !== userId);
      if (leaving) {
        room.messages.push({
          id: `sys-leave-${userId}-${now}`,
          sender: 'WaveJam',
          text: `👋 ${leaving.name || userName || 'A listener'} left the Jam`,
          isSystem: true,
          createdAt: now
        });
        room.messages = room.messages.slice(-40);
      }
      room.updatedAt = now;
    }
    const leavePayload = {
      ...sanitizeRoom(room),
      eventType: 'leave',
      userId: userId || undefined,
      serverTime: now
    };
    broadcastToRoom(roomCode, leavePayload);
    return leavePayload;
  }

  if (userId && userName) {
    const existing = room.members.find((m) => m.id === userId);
    if (existing) {
      existing.name = userName;
      existing.lastSeen = now;
      if (body.seatId) existing.seatId = String(body.seatId).slice(0, 64);
      if (typeof body.seatX === 'number' && Number.isFinite(body.seatX)) existing.x = body.seatX;
      if (typeof body.seatY === 'number' && Number.isFinite(body.seatY)) existing.y = body.seatY;
      if (typeof body.seatPan === 'number' && Number.isFinite(body.seatPan)) {
        existing.pan = Math.max(-0.85, Math.min(0.85, body.seatPan));
      }
    } else {
      room.members.push({
        id: userId,
        name: userName,
        lastSeen: now,
        seatId: body.seatId ? String(body.seatId).slice(0, 64) : undefined,
        x: typeof body.seatX === 'number' && Number.isFinite(body.seatX) ? body.seatX : undefined,
        y: typeof body.seatY === 'number' && Number.isFinite(body.seatY) ? body.seatY : undefined,
        pan:
          typeof body.seatPan === 'number' && Number.isFinite(body.seatPan)
            ? Math.max(-0.85, Math.min(0.85, body.seatPan))
            : undefined
      });
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

  // Strict authoritative host check: non-empty userId matching room.hostId + verified secret (or initial host claim)
  const providedSecret =
    typeof (body.hostSecret ?? body.hostToken) === 'string'
      ? (body.hostSecret ?? body.hostToken).trim()
      : '';
  const isHostSender =
    Boolean(userId) &&
    Boolean(room.hostId) &&
    userId === room.hostId &&
    body.isHost === true &&
    (justClaimedHost || secretsMatch(providedSecret, room.hostSecret));

  if (rawOp === 'get') {
    return {
      ...sanitizeRoom(room),
      eventType: 'get',
      serverTime: now
    };
  }

  if (rawOp === 'sync' || rawOp === 'create') {
    if (requestedEventType === 'join') {
      if (body.message?.id && body.message?.text && !room.messages.some((m) => m.id === body.message.id)) {
        room.messages.push({
          id: String(body.message.id).slice(0, 80),
          sender: 'WaveJam',
          text: String(body.message.text).slice(0, 240),
          isSystem: true,
          createdAt: typeof body.message.createdAt === 'number' ? body.message.createdAt : now
        });
        room.messages = room.messages.slice(-40);
      }
      room.updatedAt = now;
      const joinPayload = {
        ...sanitizeRoom(room),
        eventType: 'join',
        userId: userId || undefined,
        userName: userName || undefined,
        seatId: body.seatId,
        seatX: body.seatX,
        seatY: body.seatY,
        seatPan: body.seatPan,
        serverTime: now
      };
      broadcastToRoom(roomCode, joinPayload);
      return joinPayload;
    }

    if (requestedEventType === 'sync-ping') {
      const pingPayload = {
        ...sanitizeRoom(room),
        eventType: 'sync-ping',
        guestId: body.guestId || userId || undefined,
        clientSendEpoch: body.clientSendEpoch,
        serverTime: now
      };
      broadcastToRoom(roomCode, pingPayload);
      return pingPayload;
    }

    if (requestedEventType === 'sync-pong') {
      if (!isHostSender) {
        return { ...sanitizeRoom(room), eventType: 'sync-pong', rejected: true, serverTime: now };
      }
      const pongPayload = {
        ...sanitizeRoom(room),
        eventType: 'sync-pong',
        targetGuestId: body.targetGuestId,
        clientSendEpoch: body.clientSendEpoch,
        hostReceiveEpoch: body.hostReceiveEpoch,
        hostSendEpoch: body.hostSendEpoch,
        serverTime: now
      };
      broadcastToRoom(roomCode, pongPayload);
      return pongPayload;
    }

    if (requestedEventType === 'sync-beep') {
      if (!isHostSender) {
        return { ...sanitizeRoom(room), eventType: 'sync-beep', rejected: true, serverTime: now };
      }
      const beepPayload = {
        ...sanitizeRoom(room),
        eventType: 'sync-beep',
        rendezvousAt: body.rendezvousAt,
        serverTime: now
      };
      broadcastToRoom(roomCode, beepPayload);
      return beepPayload;
    }

    if (requestedEventType === 'sync-anchor') {
      if (!isHostSender) {
        return { ...sanitizeRoom(room), eventType: 'sync-anchor', rejected: true, serverTime: now };
      }
      if (body.syncAnchor && typeof body.syncAnchor === 'object') {
        room.syncAnchor = body.syncAnchor;
      }
      room.updatedAt = now;
      const anchorPayload = {
        ...sanitizeRoom(room),
        eventType: 'sync-anchor',
        syncAnchor: room.syncAnchor,
        serverTime: now
      };
      broadcastToRoom(roomCode, anchorPayload);
      return anchorPayload;
    }

    if (!isHostSender) {
      return {
        ...sanitizeRoom(room),
        eventType: rawOp,
        rejected: true,
        serverTime: now
      };
    }

    if (typeof body.hostName === 'string' && body.hostName.trim()) {
      room.hostName = body.hostName.trim().slice(0, 80);
    }
    if (body.currentTrack === null || (body.currentTrack && typeof body.currentTrack === 'object')) {
      room.currentTrack = body.currentTrack;
    }
    if (typeof body.isPlaying === 'boolean') room.isPlaying = body.isPlaying;
    if (typeof body.currentTime === 'number' && Number.isFinite(body.currentTime)) {
      room.currentTime = body.currentTime;
    }
    if (body.syncAnchor && typeof body.syncAnchor === 'object') room.syncAnchor = body.syncAnchor;
    if (Array.isArray(body.queue)) {
      room.queue = body.queue.slice(0, 40);
    }
    room.updatedAt = now;

    const publicSync = {
      ...sanitizeRoom(room),
      eventType: 'sync',
      serverTime: now
    };
    broadcastToRoom(roomCode, publicSync);
    return {
      ...publicSync,
      ...(justClaimedHost && room.hostSecret ? { hostSecret: room.hostSecret, hostToken: room.hostSecret } : {})
    };
  }

  if (rawOp === 'react') {
    const emoji = String(body.emoji || url.searchParams.get('emoji') || '🔥').slice(0, 16);
    const sender = userName || 'Listener';
    const reactionId = String(body.id || `${now}-${Math.random().toString(36).slice(2, 6)}`).slice(0, 80);
    const reactionObj = {
      id: reactionId,
      emoji,
      sender,
      createdAt: now,
      x: typeof body.x === 'number' ? body.x : undefined,
      y: typeof body.y === 'number' ? body.y : undefined,
      seatId: body.seatId ? String(body.seatId).slice(0, 64) : undefined
    };
    if (!room.reactions.some((r) => r.id === reactionId)) {
      room.reactions.push(reactionObj);
    }
    room.updatedAt = now;
    const payload = {
      ...sanitizeRoom(room),
      eventType: 'react',
      reaction: reactionObj,
      serverTime: now
    };
    broadcastToRoom(roomCode, payload);
    return payload;
  }

  if ((rawOp === 'seat' || rawOp === 'member-seat') && userId) {
    let mem = room.members.find((m) => m.id === userId);
    const safeSeatId = body.seatId ? String(body.seatId).slice(0, 64) : mem?.seatId;
    const safeX = typeof body.seatX === 'number' && Number.isFinite(body.seatX) ? body.seatX : mem?.x ?? 50;
    const safeY = typeof body.seatY === 'number' && Number.isFinite(body.seatY) ? body.seatY : mem?.y ?? 50;
    const safePan =
      typeof body.seatPan === 'number' && Number.isFinite(body.seatPan)
        ? Math.max(-0.85, Math.min(0.85, body.seatPan))
        : mem?.pan ?? 0;

    if (mem) {
      mem.seatId = safeSeatId;
      mem.x = safeX;
      mem.y = safeY;
      mem.pan = safePan;
      mem.lastSeen = now;
    } else if (userName) {
      mem = {
        id: userId,
        name: userName,
        lastSeen: now,
        seatId: safeSeatId,
        x: safeX,
        y: safeY,
        pan: safePan
      };
      room.members.push(mem);
    }
    room.updatedAt = now;

    const seatPayload = {
      ...sanitizeRoom(room),
      eventType: 'member-seat',
      userId,
      seatId: safeSeatId,
      seatX: safeX,
      seatY: safeY,
      seatPan: safePan,
      serverTime: now
    };
    broadcastToRoom(roomCode, seatPayload);
    return seatPayload;
  }

  if (rawOp === 'chat' && body.text) {
    const msgId = String(body.id || `${now}-${Math.random().toString(36).slice(2, 6)}`).slice(0, 80);
    const msgObj = {
      id: msgId,
      sender: userName || 'Listener',
      text: String(body.text).slice(0, 240),
      createdAt: now
    };
    if (!room.messages.some((m) => m.id === msgId)) {
      room.messages.push(msgObj);
    }
    room.updatedAt = now;
    const chatPayload = {
      ...sanitizeRoom(room),
      eventType: 'chat',
      message: msgObj,
      serverTime: now
    };
    broadcastToRoom(roomCode, chatPayload);
    return chatPayload;
  }

  if (rawOp === 'add-track' && body.track && typeof body.track === 'object') {
    const exists = room.queue.some((t) => t.id === body.track.id);
    if (!exists) {
      room.queue.push(body.track);
      room.queue = room.queue.slice(0, 40);
    }
    const allowPlayNow = isHostSender && (Boolean(body.playNow) || !room.currentTrack);
    if (allowPlayNow) {
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
      text: `🎵 ${userName || 'A listener'} ${allowPlayNow ? 'started playing' : 'queued'} "${String(body.track.title || 'Track').slice(0, 120)}"`,
      isSystem: true,
      createdAt: now
    });
    const addPayload = {
      ...sanitizeRoom(room),
      eventType: 'add-track',
      addedTrack: body.track,
      playNow: allowPlayNow,
      isHost: isHostSender,
      serverTime: now
    };
    broadcastToRoom(roomCode, addPayload);
    return addPayload;
  }

  if (rawOp === 'signal' && body.signal) {
    broadcastToRoom(roomCode, {
      eventType: 'webrtc-signal',
      roomCode,
      signal: body.signal,
      targetGuestId: body.targetGuestId || body.signal?.target,
      guestId: body.guestId || body.signal?.from
    });
    return { ok: true };
  }

  if (rawOp === 'play-track') {
    const playTrack = body.track || body.currentTrack;
    if (!isHostSender || !playTrack || typeof playTrack !== 'object') {
      return { ...sanitizeRoom(room), eventType: 'play-track', rejected: true, serverTime: now };
    }
    if (!room.queue.some((t) => t.id === playTrack.id)) {
      room.queue.push(playTrack);
      room.queue = room.queue.slice(0, 40);
    }
    room.currentTrack = playTrack;
    room.isPlaying = true;
    room.currentTime = 0;
    room.trackOverrideAt = now;
    room.stateVersion = (room.stateVersion || 1) + 1;
    room.updatedAt = now;
    if (body.syncAnchor) room.syncAnchor = body.syncAnchor;
    if (body.rendezvousAt) room.rendezvousAt = body.rendezvousAt;

    const playPayload = {
      ...sanitizeRoom(room),
      eventType: 'play-track',
      isHost: true,
      rendezvousAt: room.rendezvousAt,
      serverTime: now
    };
    broadcastToRoom(roomCode, playPayload);
    return playPayload;
  }

  if (rawOp === 'toggle-play' && typeof body.isPlaying === 'boolean') {
    if (!isHostSender) {
      return { ...sanitizeRoom(room), eventType: 'toggle-play', rejected: true, serverTime: now };
    }
    room.isPlaying = body.isPlaying;
    if (typeof body.currentTime === 'number' && Number.isFinite(body.currentTime)) {
      room.currentTime = body.currentTime;
    }
    if (body.syncAnchor) room.syncAnchor = body.syncAnchor;
    if (body.rendezvousAt) room.rendezvousAt = body.rendezvousAt;
    room.updatedAt = now;

    const togglePayload = {
      ...sanitizeRoom(room),
      eventType: 'toggle-play',
      isHost: true,
      trackOverrideAt: body.trackOverrideAt || now,
      rendezvousAt: room.rendezvousAt,
      serverTime: now
    };
    broadcastToRoom(roomCode, togglePayload);
    return togglePayload;
  }

  return {
    ...sanitizeRoom(room),
    eventType: rawOp,
    serverTime: now
  };
}
