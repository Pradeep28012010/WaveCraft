import { create } from 'zustand';
import type { Track } from '../types';
import { usePlayerStore } from './playerStore';
import { apiUrl, getShareBaseUrl } from '../services/apiConfig';
import { jamSyncEngine, type JamAudioAnchor, type JamTransportMode } from '../services/jamSyncEngine';
import { jamWebRtc, type WebRtcSignalPayload } from '../services/jamWebRtc';

export interface JamReaction {
  id: string;
  emoji: string;
  sender: string;
  createdAt: number;
}

export interface JamMember {
  id: string;
  name: string;
  lastSeen: number;
  isHost?: boolean;
}

export interface JamMessage {
  id: string;
  sender: string;
  text: string;
  createdAt: number;
}

interface ServerRoomSnapshot {
  roomCode: string;
  hostName?: string;
  hostSecret?: string;
  hostToken?: string;
  currentTrack?: Track | null;
  isPlaying?: boolean;
  position?: number;
  queue?: Track[];
  updatedAt?: number;
  serverTimestamp?: number;
  syncAnchor?: JamAudioAnchor | null;
  members?: JamMember[];
  reactions?: JamReaction[];
  messages?: JamMessage[];
  eventType?: string;
  signal?: WebRtcSignalPayload;
  pingId?: string;
  t0?: number;
  t1?: number;
  targetUserId?: string;
  userId?: string;
}

export interface JamStore {
  roomCode: string | null;
  isHost: boolean;
  userId: string;
  userName: string;
  hostName: string;
  members: JamMember[];
  reactions: JamReaction[];
  messages: JamMessage[];
  isConnected: boolean;
  isJoining: boolean;
  syncError: string | null;
  transportMode: JamTransportMode;
  lastSyncedAt: number | null;
  setUserName: (name: string) => void;
  createRoom: (customName?: string) => Promise<string>;
  joinRoom: (code: string, customName?: string) => Promise<void>;
  leaveRoom: () => void;
  sendReaction: (emoji: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  pushHostState: () => Promise<void>;
  addTrackToJam: (track: Track, playNow?: boolean) => Promise<void>;
  playTrackInJam: (track: Track) => Promise<void>;
  togglePlayInJam: () => Promise<void>;
  skipTrackInJam: () => Promise<void>;
  prevTrackInJam: () => Promise<void>;
  syncNow: () => void;
}

const USER_ID_KEY = 'wavecraft_jam_uid';
const USER_NAME_KEY = 'wavecraft_jam_uname';

function getOrCreateUserId(): string {
  try {
    const existing = localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const next = `u_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(USER_ID_KEY, next);
    return next;
  } catch {
    return `u_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getSavedUserName(): string {
  try {
    return localStorage.getItem(USER_NAME_KEY) || 'Listener';
  } catch {
    return 'Listener';
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `WAVE-${suffix}`;
}

let hostSecret: string | null = null;
let serverSseSource: EventSource | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;
let hostSyncSeq = 0;
let isApplyingRemoteState = false;
let lastAppliedTrackId: string | null = null;
let lastHostSyncPushAt = 0;
let playerUnsub: (() => void) | null = null;

function stopConnections() {
  if (serverSseSource) {
    try {
      serverSseSource.close();
    } catch {}
    serverSseSource = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (fallbackPollTimer) {
    clearInterval(fallbackPollTimer);
    fallbackPollTimer = null;
  }
  if (playerUnsub) {
    playerUnsub();
    playerUnsub = null;
  }
  jamWebRtc.cleanup();
  jamSyncEngine.reset();
}

function buildHostAnchor(): JamAudioAnchor | null {
  const player = usePlayerStore.getState();
  if (!player.currentTrack) return null;
  return {
    trackId: player.currentTrack.id,
    isPlaying: player.isPlaying,
    anchorPositionSec: player.currentTime || 0,
    anchorHostEpochMs: Date.now(),
    playbackSpeed: player.playbackSpeed || 1,
    sequence: ++hostSyncSeq
  };
}

async function postJamOp(
  op: string,
  roomCode: string,
  body: Record<string, unknown>
): Promise<{ status: number; data: ServerRoomSnapshot | null }> {
  try {
    const res = await fetch(
      apiUrl(`/api/music?action=jam&op=${encodeURIComponent(op)}&room=${encodeURIComponent(roomCode)}`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000)
      }
    );
    const data = (await res.json().catch(() => null)) as ServerRoomSnapshot | null;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

function applyRemoteSnapshot(
  snapshot: ServerRoomSnapshot,
  set: (partial: Partial<JamStore>) => void,
  get: () => JamStore
) {
  const state = get();
  if (!state.roomCode || snapshot.roomCode !== state.roomCode) return;

  // Handle WebRTC signaling packets routed over SSE
  if (snapshot.eventType === 'webrtc-signal' && snapshot.signal) {
    jamWebRtc.handleRemoteSignal(snapshot.signal);
    return;
  }

  // Handle clock ping/pong
  if (snapshot.eventType === 'sync-ping' && state.isHost && snapshot.t0) {
    const pong = {
      eventType: 'sync-pong',
      roomCode: state.roomCode,
      pingId: snapshot.pingId,
      t0: snapshot.t0,
      t1: Date.now(),
      targetUserId: snapshot.userId
    };
    if (jamWebRtc.isConnected()) {
      jamWebRtc.send(pong);
    }
    return;
  }

  if (snapshot.eventType === 'sync-pong' && !state.isHost && snapshot.t0 && snapshot.t1) {
    if (!snapshot.targetUserId || snapshot.targetUserId === state.userId) {
      jamSyncEngine.handlePingPongResponse(snapshot.t0, snapshot.t1, Date.now());
    }
    return;
  }

  // Update metadata (members, reactions, messages, hostName)
  const patch: Partial<JamStore> = {
    lastSyncedAt: Date.now(),
    isConnected: true,
    syncError: null
  };
  if (snapshot.hostName) patch.hostName = snapshot.hostName;
  if (Array.isArray(snapshot.members)) patch.members = snapshot.members;
  if (Array.isArray(snapshot.reactions)) patch.reactions = snapshot.reactions;
  if (Array.isArray(snapshot.messages)) patch.messages = snapshot.messages;
  set(patch);

  // Sync queue to playerStore for both host (guest additions) and guests
  const player = usePlayerStore.getState();
  if (Array.isArray(snapshot.queue) && snapshot.queue.length > 0) {
    const curIds = player.queue.map((t) => t.id).join(',');
    const nextIds = snapshot.queue.map((t) => t.id).join(',');
    if (curIds !== nextIds) {
      isApplyingRemoteState = true;
      usePlayerStore.setState({
        queue: snapshot.queue,
        originalQueue: snapshot.queue
      });
      isApplyingRemoteState = false;
    }
  }

  // Only guests follow host playback state
  if (state.isHost) return;

  if (snapshot.syncAnchor) {
    jamSyncEngine.updateAnchor(snapshot.syncAnchor);
  } else if (snapshot.currentTrack) {
    jamSyncEngine.updateAnchor({
      trackId: snapshot.currentTrack.id,
      isPlaying: Boolean(snapshot.isPlaying),
      anchorPositionSec: snapshot.position || 0,
      anchorHostEpochMs: snapshot.serverTimestamp || Date.now(),
      playbackSpeed: 1,
      sequence: snapshot.updatedAt || Date.now()
    });
  }

  const remoteTrack = snapshot.currentTrack || null;
  if (!remoteTrack) return;

  const expectedPos = jamSyncEngine.getExpectedPositionSec();
  isApplyingRemoteState = true;
  try {
    if (!player.currentTrack || player.currentTrack.id !== remoteTrack.id) {
      lastAppliedTrackId = remoteTrack.id;
      const queueList = Array.isArray(snapshot.queue) && snapshot.queue.length > 0
        ? snapshot.queue
        : [remoteTrack];
      const idx = Math.max(0, queueList.findIndex((t) => t.id === remoteTrack.id));
      player.playTrack(remoteTrack, queueList, idx);
      if (!snapshot.isPlaying) {
        setTimeout(() => usePlayerStore.getState().pause(), 80);
      } else if (expectedPos > 2) {
        setTimeout(() => usePlayerStore.getState().seekTo(expectedPos), 250);
      }
    } else {
      if (snapshot.isPlaying && !player.isPlaying) {
        player.resume();
      } else if (!snapshot.isPlaying && player.isPlaying) {
        player.pause();
      }
      const driftSec = Math.abs((player.currentTime || 0) - expectedPos);
      jamSyncEngine.recordDrift(player.currentTime || 0, expectedPos);
      if (driftSec > 1.8 && lastAppliedTrackId === remoteTrack.id) {
        player.seekTo(expectedPos);
      }
      lastAppliedTrackId = remoteTrack.id;
    }
  } finally {
    setTimeout(() => {
      isApplyingRemoteState = false;
    }, 150);
  }
}

function startRoomConnections(
  roomCode: string,
  isHost: boolean,
  userId: string,
  set: (partial: Partial<JamStore>) => void,
  get: () => JamStore
) {
  stopConnections();

  // 1. WebRTC P2P data channel + signaling
  jamWebRtc.init(
    userId,
    isHost,
    (msg: unknown) => {
      if (msg && typeof msg === 'object') {
        applyRemoteSnapshot(msg as ServerRoomSnapshot, set, get);
      }
    },
    (status) => {
      if (status === 'connected') {
        jamSyncEngine.setTransport('webrtc-p2p');
        set({ transportMode: 'webrtc-p2p' });
        if (!isHost) {
          jamWebRtc.send({
            eventType: 'sync-ping',
            roomCode,
            userId,
            pingId: `${Date.now()}`,
            t0: Date.now()
          });
        }
      } else if (serverSseSource && serverSseSource.readyState === EventSource.OPEN) {
        jamSyncEngine.setTransport('server-sse');
        set({ transportMode: 'server-sse' });
      }
    },
    (signal: WebRtcSignalPayload) => {
      postJamOp('webrtc-signal', roomCode, { userId, signal });
    }
  );

  // 2. Server-Sent Events (SSE)
  if (typeof EventSource !== 'undefined') {
    const sseUrl = apiUrl(
      `/api/music?action=jam&op=sse&room=${encodeURIComponent(roomCode)}&userId=${encodeURIComponent(userId)}`
    );
    serverSseSource = new EventSource(sseUrl);
    serverSseSource.onopen = () => {
      if (!jamWebRtc.isConnected()) {
        jamSyncEngine.setTransport('server-sse');
        set({ transportMode: 'server-sse', isConnected: true, syncError: null });
      }
    };
    serverSseSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ServerRoomSnapshot;
        if (data && data.roomCode) {
          applyRemoteSnapshot(data, set, get);
        }
      } catch {}
    };
    serverSseSource.onerror = () => {
      if (!jamWebRtc.isConnected()) {
        jamSyncEngine.setTransport('relay');
        set({ transportMode: 'relay' });
      }
    };
  }

  // 3. Heartbeat (every 6s) + Self-healing host re-hydration if cold-started (404)
  heartbeatTimer = setInterval(async () => {
    const cur = get();
    if (!cur.roomCode) return;
    if (cur.isHost) {
      const player = usePlayerStore.getState();
      const res = await postJamOp('heartbeat', cur.roomCode, {
        userId: cur.userId,
        userName: cur.userName,
        isHost: true,
        hostSecret,
        position: player.currentTime || 0,
        isPlaying: player.isPlaying
      });
      if (res.status === 404) {
        await cur.pushHostState();
      } else if (res.data) {
        applyRemoteSnapshot(res.data, set, get);
      }
    } else {
      const res = await postJamOp('heartbeat', cur.roomCode, {
        userId: cur.userId,
        userName: cur.userName,
        isHost: false
      });
      if (res.data) {
        applyRemoteSnapshot(res.data, set, get);
      }
    }
  }, 6000);

  // 4. Fallback poll (every 4s, active only when SSE is closed and WebRTC is not connected)
  fallbackPollTimer = setInterval(async () => {
    const cur = get();
    if (!cur.roomCode) return;
    const sseOpen = serverSseSource && serverSseSource.readyState === EventSource.OPEN;
    if (sseOpen || jamWebRtc.isConnected()) return;
    try {
      const res = await fetch(
        apiUrl(`/api/music?action=jam&op=get&room=${encodeURIComponent(cur.roomCode)}`),
        { signal: AbortSignal.timeout(6000) }
      );
      if (res.ok) {
        const data = (await res.json()) as ServerRoomSnapshot;
        if (data?.roomCode) applyRemoteSnapshot(data, set, get);
      }
    } catch {}
  }, 4000);

  // 5. Host playerStore subscription: auto-push track/play/pause changes
  if (isHost) {
    playerUnsub = usePlayerStore.subscribe((next, prev) => {
      if (isApplyingRemoteState) return;
      const cur = get();
      if (!cur.roomCode || !cur.isHost) return;
      const trackChanged = next.currentTrack?.id !== prev.currentTrack?.id;
      const playChanged = next.isPlaying !== prev.isPlaying;
      const seekJumped = Math.abs((next.currentTime || 0) - (prev.currentTime || 0)) > 2.2;
      if (trackChanged || playChanged || seekJumped) {
        const now = Date.now();
        if (trackChanged || playChanged || now - lastHostSyncPushAt > 500) {
          lastHostSyncPushAt = now;
          cur.pushHostState();
        }
      }
    });
  }
}

export const useJamStore = create<JamStore>((set, get) => ({
  roomCode: null,
  isHost: false,
  userId: getOrCreateUserId(),
  userName: getSavedUserName(),
  hostName: '',
  members: [],
  reactions: [],
  messages: [],
  isConnected: false,
  isJoining: false,
  syncError: null,
  transportMode: 'offline',
  lastSyncedAt: null,

  setUserName: (name: string) => {
    const clean = name.trim().slice(0, 24) || 'Listener';
    try {
      localStorage.setItem(USER_NAME_KEY, clean);
    } catch {}
    set({ userName: clean });
  },

  createRoom: async (customName?: string) => {
    const code = generateRoomCode();
    const state = get();
    const cleanName = (customName || state.userName || 'Host DJ').trim().slice(0, 24);
    hostSecret = null;
    lastAppliedTrackId = null;

    set({
      roomCode: code,
      isHost: true,
      userName: cleanName,
      hostName: cleanName,
      members: [{ id: state.userId, name: cleanName, lastSeen: Date.now(), isHost: true }],
      reactions: [],
      messages: [],
      isConnected: false,
      isJoining: true,
      syncError: null
    });

    const player = usePlayerStore.getState();
    const anchor = buildHostAnchor();
    const { data } = await postJamOp('sync', code, {
      userId: state.userId,
      userName: cleanName,
      hostName: cleanName,
      isHost: true,
      currentTrack: player.currentTrack,
      isPlaying: player.isPlaying,
      position: player.currentTime || 0,
      queue: player.queue,
      syncAnchor: anchor
    });

    if (data?.hostSecret || data?.hostToken) {
      hostSecret = data.hostSecret || data.hostToken || null;
    }

    set({
      isJoining: false,
      isConnected: Boolean(data),
      members: data?.members || [{ id: state.userId, name: cleanName, lastSeen: Date.now(), isHost: true }]
    });

    startRoomConnections(code, true, state.userId, set, get);
    return code;
  },

  joinRoom: async (code: string, customName?: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    const state = get();
    const cleanName = (customName || state.userName || 'Listener').trim().slice(0, 24);
    hostSecret = null;
    lastAppliedTrackId = null;

    set({
      roomCode: normalized,
      isHost: false,
      userName: cleanName,
      isJoining: true,
      syncError: null
    });

    const { status, data } = await postJamOp('join', normalized, {
      userId: state.userId,
      userName: cleanName,
      isHost: false
    });

    if (!data || status === 404) {
      set({
        roomCode: null,
        isHost: false,
        isJoining: false,
        isConnected: false,
        syncError: 'Jam room not found or expired.'
      });
      return;
    }

    set({ isJoining: false, isConnected: true });
    applyRemoteSnapshot(data, set, get);
    startRoomConnections(normalized, false, state.userId, set, get);
  },

  leaveRoom: () => {
    const state = get();
    const oldCode = state.roomCode;
    if (oldCode) {
      postJamOp('leave', oldCode, {
        userId: state.userId,
        isHost: state.isHost,
        hostSecret
      });
    }
    hostSecret = null;
    lastAppliedTrackId = null;
    stopConnections();
    set({
      roomCode: null,
      isHost: false,
      hostName: '',
      members: [],
      reactions: [],
      messages: [],
      isConnected: false,
      isJoining: false,
      syncError: null,
      transportMode: 'offline',
      lastSyncedAt: null
    });
  },

  pushHostState: async () => {
    const state = get();
    if (!state.roomCode || !state.isHost) return;
    const player = usePlayerStore.getState();
    const anchor = buildHostAnchor();
    const payload: Record<string, unknown> = {
      userId: state.userId,
      userName: state.userName,
      hostName: state.hostName || state.userName,
      isHost: true,
      hostSecret,
      currentTrack: player.currentTrack,
      isPlaying: player.isPlaying,
      position: player.currentTime || 0,
      queue: player.queue,
      syncAnchor: anchor,
      serverTimestamp: Date.now()
    };

    if (jamWebRtc.isConnected()) {
      jamWebRtc.send({ ...payload, roomCode: state.roomCode, hostSecret: undefined });
    }

    const { data } = await postJamOp('sync', state.roomCode, payload);
    if (data?.hostSecret || data?.hostToken) {
      hostSecret = data.hostSecret || data.hostToken || null;
    }
    if (data) {
      set({ lastSyncedAt: Date.now(), isConnected: true });
    }
  },

  sendReaction: async (emoji: string) => {
    const state = get();
    if (!state.roomCode) return;
    const { data } = await postJamOp('react', state.roomCode, {
      userId: state.userId,
      sender: state.userName,
      emoji
    });
    if (data?.reactions) {
      set({ reactions: data.reactions });
    }
  },

  sendMessage: async (text: string) => {
    const state = get();
    const clean = text.trim();
    if (!state.roomCode || !clean) return;
    const { data } = await postJamOp('chat', state.roomCode, {
      userId: state.userId,
      sender: state.userName,
      text: clean
    });
    if (data?.messages) {
      set({ messages: data.messages });
    }
  },

  addTrackToJam: async (track: Track, playNow = false) => {
    const state = get();
    if (!state.roomCode) return;
    if (playNow && state.isHost) {
      await state.playTrackInJam(track);
      return;
    }
    const { data } = await postJamOp('add-track', state.roomCode, {
      userId: state.userId,
      isHost: state.isHost,
      hostSecret: state.isHost ? hostSecret : undefined,
      track,
      playNow: false
    });
    if (data) {
      applyRemoteSnapshot(data, set, get);
    }
  },

  playTrackInJam: async (track: Track) => {
    const state = get();
    if (!state.roomCode || !state.isHost) return;
    const player = usePlayerStore.getState();
    const existingIdx = player.queue.findIndex((t) => t.id === track.id);
    const nextQueue = existingIdx >= 0 ? player.queue : [...player.queue, track];
    const targetIdx = existingIdx >= 0 ? existingIdx : nextQueue.length - 1;
    player.playTrack(track, nextQueue, targetIdx);
    await get().pushHostState();
  },

  togglePlayInJam: async () => {
    const state = get();
    if (!state.roomCode || !state.isHost) return;
    usePlayerStore.getState().togglePlay();
    await get().pushHostState();
  },

  skipTrackInJam: async () => {
    const state = get();
    if (!state.roomCode || !state.isHost) return;
    usePlayerStore.getState().nextTrack();
    setTimeout(() => {
      get().pushHostState();
    }, 60);
  },

  prevTrackInJam: async () => {
    const state = get();
    if (!state.roomCode || !state.isHost) return;
    usePlayerStore.getState().prevTrack();
    setTimeout(() => {
      get().pushHostState();
    }, 60);
  },

  syncNow: () => {
    const state = get();
    if (!state.roomCode) return;
    if (state.isHost) {
      state.pushHostState();
      return;
    }
    const expected = jamSyncEngine.getExpectedPositionSec();
    const player = usePlayerStore.getState();
    if (player.currentTrack && expected >= 0) {
      player.seekTo(expected);
    }
    fetch(apiUrl(`/api/music?action=jam&op=get&room=${encodeURIComponent(state.roomCode)}`), {
      signal: AbortSignal.timeout(6000)
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ServerRoomSnapshot | null) => {
        if (data?.roomCode) applyRemoteSnapshot(data, set, get);
      })
      .catch(() => {});
  }
}));

export function getJamInviteUrl(code: string): string {
  return `${getShareBaseUrl()}/jam?jam=${encodeURIComponent(code)}`;
}
