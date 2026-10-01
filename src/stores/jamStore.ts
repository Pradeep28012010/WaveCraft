import { create } from 'zustand';
import type { Track } from '../types';
import { usePlayerStore } from './playerStore';
import { unlockAudioEngine } from '../components/player/YouTubeEmbed';

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
}

export interface JamMessage {
  id: string;
  sender: string;
  text: string;
  isSystem?: boolean;
  createdAt: number;
}

export interface JamRoomSnapshot {
  roomCode: string;
  hostName?: string;
  userId?: string;
  userName?: string;
  members?: JamMember[];
  reaction?: JamReaction;
  reactions?: JamReaction[];
  message?: JamMessage;
  messages?: JamMessage[];
  eventType?: 'add-track' | 'play-track' | 'toggle-play' | 'sync-state' | string;
  addedTrack?: Track;
  currentTrack?: Track | null;
  queue?: Track[];
  isPlaying?: boolean;
  currentTime?: number;
  playNow?: boolean;
  sentAt?: number;
}

interface JamStore {
  roomCode: string | null;
  isHost: boolean;
  userId: string;
  userName: string;
  hostName: string;
  members: JamMember[];
  reactions: JamReaction[];
  messages: JamMessage[];
  isConnected: boolean;
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
  syncNow: () => void;
}

const getInitialUserId = () => {
  try {
    const saved = localStorage.getItem('wavecraft_jam_uid');
    if (saved) return saved;
    const id = 'usr_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('wavecraft_jam_uid', id);
    return id;
  } catch {
    return 'usr_' + Math.random().toString(36).slice(2, 10);
  }
};

const getInitialUserName = () => {
  try {
    return localStorage.getItem('wavecraft_jam_name') || 'WaveRider';
  } catch {
    return 'WaveRider';
  }
};

let bc: BroadcastChannel | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let sseSource: EventSource | null = null;
let isApplyingRemoteState = false;
let lastCollaborativeTrackSwitchAt = 0;
let latestRemoteRoomSnapshot: JamRoomSnapshot | null = null;

function getRelayTopic(roomCode: string) {
  return `wavecraft_jam_v2_${roomCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
}

async function publishRealtimeEvent(roomCode: string, eventPayload: JamRoomSnapshot) {
  try {
    bc?.postMessage(eventPayload);
  } catch {}

  try {
    const topic = getRelayTopic(roomCode);
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      body: JSON.stringify(eventPayload)
    });
  } catch {}
}

export const useJamStore = create<JamStore>((set, get) => {
  const mergeMembers = (incoming: JamMember[] | undefined, extraMember?: JamMember) => {
    const now = Date.now();
    const map = new Map<string, JamMember>();
    for (const m of get().members) {
      if (now - m.lastSeen < 28_000) map.set(m.id, m);
    }
    if (Array.isArray(incoming)) {
      for (const m of incoming) {
        if (m && m.id && now - (m.lastSeen || now) < 28_000) {
          const prev = map.get(m.id);
          if (!prev || (m.lastSeen || 0) >= prev.lastSeen) {
            map.set(m.id, { id: m.id, name: m.name || 'Listener', lastSeen: m.lastSeen || now });
          }
        }
      }
    }
    if (extraMember && extraMember.id) {
      map.set(extraMember.id, { ...extraMember, lastSeen: now });
    }
    const selfId = get().userId;
    const selfName = get().userName;
    map.set(selfId, { id: selfId, name: selfName, lastSeen: now });
    return Array.from(map.values());
  };

  const mergeReactions = (incoming: JamReaction[] | undefined) => {
    const now = Date.now();
    const map = new Map<string, JamReaction>();
    for (const r of get().reactions) {
      if (now - r.createdAt < 20_000) map.set(r.id, r);
    }
    if (Array.isArray(incoming)) {
      for (const r of incoming) {
        if (r && r.id && now - (r.createdAt || now) < 20_000) {
          map.set(r.id, r);
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-12);
  };

  const mergeMessages = (incoming: JamMessage[] | undefined) => {
    const map = new Map<string, JamMessage>();
    for (const m of get().messages) {
      map.set(m.id, m);
    }
    if (Array.isArray(incoming)) {
      for (const m of incoming) {
        if (m && m.id && m.text) {
          map.set(m.id, m);
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-40);
  };

  const applyRoomPayload = (room: JamRoomSnapshot) => {
    const activeRoomCode = get().roomCode;
    if (!room || !activeRoomCode || room.roomCode !== activeRoomCode) return;

    latestRemoteRoomSnapshot = room;

    const extraMember =
      room.userId && room.userName
        ? { id: room.userId, name: room.userName, lastSeen: Date.now() }
        : undefined;

    const updatedMembers = mergeMembers(room.members, extraMember);
    const updatedReactions = mergeReactions(
      room.reaction ? [room.reaction] : room.reactions
    );
    const updatedMessages = mergeMessages(
      room.message ? [room.message] : room.messages
    );

    set({
      hostName:
        room.hostName && room.hostName !== 'DJ Host'
          ? room.hostName
          : get().hostName || 'DJ Host',
      members: updatedMembers,
      reactions: updatedReactions,
      messages: updatedMessages,
      isConnected: true,
      lastSyncedAt: Date.now()
    });

    const player = usePlayerStore.getState();

    // 1. Handle explicit collaborative "add-track" or "play-track" events for BOTH Host and Guests!
    if (room.eventType === 'add-track' && room.addedTrack) {
      const exists = player.queue.some((t) => t.id === room.addedTrack.id);
      if (!exists) {
        player.addToQueue(room.addedTrack);
      }
      if (!player.currentTrack || room.playNow) {
        isApplyingRemoteState = true;
        lastCollaborativeTrackSwitchAt = Date.now();
        player.playTrack(
          room.addedTrack,
          exists ? player.queue : [...player.queue, room.addedTrack],
          0
        );
        setTimeout(() => {
          isApplyingRemoteState = false;
        }, 200);
      }
      return;
    }

    if (room.eventType === 'play-track' && room.currentTrack) {
      isApplyingRemoteState = true;
      lastCollaborativeTrackSwitchAt = Date.now();
      const nextQueue =
        Array.isArray(room.queue) && room.queue.length > 0
          ? room.queue
          : player.queue.some((t) => t.id === room.currentTrack.id)
          ? player.queue
          : [...player.queue, room.currentTrack];
      const idx = Math.max(
        0,
        nextQueue.findIndex((t: Track) => t.id === room.currentTrack.id)
      );
      player.playTrack(room.currentTrack, nextQueue, idx);
      setTimeout(() => {
        isApplyingRemoteState = false;
      }, 250);
      return;
    }

    if (room.eventType === 'toggle-play' && typeof room.isPlaying === 'boolean') {
      isApplyingRemoteState = true;
      lastCollaborativeTrackSwitchAt = Date.now();
      if (room.isPlaying && !player.isPlaying) {
        player.resume();
      } else if (!room.isPlaying && player.isPlaying) {
        player.pause();
      }
      setTimeout(() => {
        isApplyingRemoteState = false;
      }, 200);
      return;
    }

    // 2. Merge any new tracks from room.queue into local queue (for both Host and Guests)
    if (Array.isArray(room.queue) && room.queue.length > 0) {
      const localIds = new Set(player.queue.map((t) => t.id));
      const newTracks = room.queue.filter((t: Track) => t && t.id && !localIds.has(t.id));
      if (newTracks.length > 0) {
        newTracks.forEach((t: Track) => player.addToQueue(t));
      }
    }

    // 3. If we are a Host and a guest started a song when the host had no song playing, or via recent override
    if (get().isHost) {
      if (
        room.currentTrack &&
        (!player.currentTrack ||
          (room.trackOverrideAt &&
            room.trackOverrideAt > lastCollaborativeTrackSwitchAt &&
            Date.now() - room.trackOverrideAt < 6000 &&
            player.currentTrack.id !== room.currentTrack.id))
      ) {
        isApplyingRemoteState = true;
        lastCollaborativeTrackSwitchAt = room.trackOverrideAt || Date.now();
        const q =
          Array.isArray(room.queue) && room.queue.length > 0
            ? room.queue
            : [room.currentTrack];
        const idx = Math.max(0, q.findIndex((t: Track) => t.id === room.currentTrack.id));
        player.playTrack(room.currentTrack, q, idx);
        setTimeout(() => {
          isApplyingRemoteState = false;
        }, 250);
      }
      return;
    }

    // 4. Guest Playback Alignment with Host
    if (!get().isHost && room.currentTrack) {
      isApplyingRemoteState = true;
      try {
        const trackChanged = player.currentTrack?.id !== room.currentTrack.id;
        if (trackChanged) {
          const nextQueue =
            Array.isArray(room.queue) && room.queue.length > 0
              ? room.queue
              : [room.currentTrack];
          const idx = Math.max(
            0,
            nextQueue.findIndex((t: Track) => t.id === room.currentTrack.id)
          );
          player.playTrack(room.currentTrack, nextQueue, idx);
        }

        if (room.isPlaying && !player.isPlaying) {
          player.resume();
        } else if (!room.isPlaying && player.isPlaying) {
          player.pause();
        }

        // Sub-second drift compensation
        const elapsedSec =
          room.isPlaying && room.updatedAt
            ? Math.max(0, (Date.now() - room.updatedAt) / 1000)
            : 0;
        const expectedTime = Math.max(0, (room.currentTime || 0) + elapsedSec);
        if (Math.abs((player.currentTime || 0) - expectedTime) > 2.2) {
          player.seekTo(expectedTime);
        }
      } finally {
        setTimeout(() => {
          isApplyingRemoteState = false;
        }, 180);
      }
    }
  };

  const connectRealtimeStreams = (roomCode: string) => {
    // 1. Same-browser BroadcastChannel
    if (!bc && typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('wavecraft_jam_channel');
      } catch {}
    }
    if (bc) {
      bc.onmessage = (ev) => {
        if (ev.data && ev.data.roomCode === get().roomCode) {
          applyRoomPayload(ev.data);
        }
      };
    }

    // 2. Cross-device EventSource (SSE) relay for instant global sync across phones & laptops
    if (sseSource) {
      try {
        sseSource.close();
      } catch {}
      sseSource = null;
    }

    const topic = getRelayTopic(roomCode);

    // Fetch recent buffered messages on topic so newly joined guests get host state immediately
    fetch(`https://ntfy.sh/${topic}/json?poll=1&since=15m`)
      .then(async (res) => {
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const env = JSON.parse(line);
            if (env.event === 'message' && env.message) {
              const payload = JSON.parse(env.message);
              applyRoomPayload(payload);
            }
          } catch {}
        }
      })
      .catch(() => {});

    if (typeof EventSource !== 'undefined') {
      try {
        const es = new EventSource(`https://ntfy.sh/${topic}/sse`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            const inner = data.message ? JSON.parse(data.message) : data;
            if (inner && inner.roomCode === get().roomCode) {
              applyRoomPayload(inner);
            }
          } catch {}
        };
        sseSource = es;
      } catch {}
    }
  };

  const startRoomPolling = () => {
    if (pollInterval) clearInterval(pollInterval);
    const currentCode = get().roomCode;
    if (currentCode) {
      connectRealtimeStreams(currentCode);
    }

    pollInterval = setInterval(async () => {
      const { roomCode, isHost, userId, userName } = get();
      if (!roomCode) return;

      try {
        if (isHost) {
          await get().pushHostState();
        } else {
          const res = await fetch(
            `/api/music?action=jam&op=get&room=${encodeURIComponent(
              roomCode
            )}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}`
          );
          if (res.ok) {
            const data = await res.json();
            applyRoomPayload(data);
          }
        }
      } catch {}
    }, 2000);
  };

  return {
    roomCode: null,
    isHost: false,
    userId: getInitialUserId(),
    userName: getInitialUserName(),
    hostName: 'DJ Host',
    members: [],
    reactions: [],
    messages: [],
    isConnected: false,
    lastSyncedAt: null,

    setUserName: (name) => {
      const clean = name.trim() || 'WaveRider';
      try {
        localStorage.setItem('wavecraft_jam_name', clean);
      } catch {}
      set({ userName: clean });
    },

    createRoom: async (customName) => {
      unlockAudioEngine();
      if (customName?.trim()) get().setUserName(customName);
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let suffix = '';
      for (let i = 0; i < 4; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = `WAVE-${suffix}`;
      const { userId, userName } = get();
      const now = Date.now();

      set({
        roomCode: code,
        isHost: true,
        hostName: userName,
        members: [{ id: userId, name: userName, lastSeen: now }],
        reactions: [],
        messages: [
          {
            id: `sys-start-${now}`,
            sender: 'WaveJam',
            text: `👑 ${userName} started Live Jam Room ${code}`,
            isSystem: true,
            createdAt: now
          }
        ],
        isConnected: true,
        lastSyncedAt: now
      });

      startRoomPolling();
      await get().pushHostState();
      return code;
    },

    joinRoom: async (code, customName) => {
      unlockAudioEngine();
      if (customName?.trim()) get().setUserName(customName);
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) return;

      const { userId, userName } = get();
      const now = Date.now();

      set({
        roomCode: cleanCode,
        isHost: false,
        members: [{ id: userId, name: userName, lastSeen: now }],
        reactions: [],
        messages: [],
        isConnected: true,
        lastSyncedAt: now
      });

      startRoomPolling();

      // Announce join to all devices via real-time relay
      const joinAnnouncement = {
        roomCode: cleanCode,
        eventType: 'join',
        userId,
        userName,
        message: {
          id: `sys-join-${userId}-${now}`,
          sender: 'WaveJam',
          text: `🎧 ${userName} joined the Jam!`,
          isSystem: true,
          createdAt: now
        }
      };
      publishRealtimeEvent(cleanCode, joinAnnouncement);

      try {
        const res = await fetch(
          `/api/music?action=jam&op=get&room=${encodeURIComponent(
            cleanCode
          )}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}`
        );
        if (res.ok) {
          const data = await res.json();
          applyRoomPayload(data);
        }
      } catch {}
    },

    leaveRoom: () => {
      const { roomCode, userId } = get();
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (sseSource) {
        try {
          sseSource.close();
        } catch {}
        sseSource = null;
      }
      if (roomCode && userId) {
        fetch(
          `/api/music?action=jam&op=leave&room=${encodeURIComponent(
            roomCode
          )}&userId=${encodeURIComponent(userId)}`,
          { method: 'POST' }
        ).catch(() => {});
      }
      set({
        roomCode: null,
        isHost: false,
        members: [],
        reactions: [],
        messages: [],
        isConnected: false,
        lastSyncedAt: null
      });
    },

    pushHostState: async () => {
      const { roomCode, userId, userName } = get();
      if (!roomCode) return;

      const player = usePlayerStore.getState();
      const now = Date.now();
      const payload = {
        roomCode,
        eventType: 'sync',
        userId,
        userName,
        hostName: userName,
        currentTrack: player.currentTrack,
        isPlaying: player.isPlaying,
        currentTime: player.currentTime,
        queue: player.queue.slice(0, 30),
        members: mergeMembers(get().members),
        reactions: get().reactions,
        messages: get().messages.slice(-25),
        updatedAt: now
      };

      publishRealtimeEvent(roomCode, payload);

      try {
        const res = await fetch(
          `/api/music?action=jam&op=sync&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        if (res.ok) {
          const data = await res.json();
          applyRoomPayload(data);
        }
      } catch {}
    },

    sendReaction: async (emoji) => {
      const { roomCode, userId, userName } = get();
      if (!roomCode) return;

      const now = Date.now();
      const reaction: JamReaction = {
        id: `react-${now}-${Math.random().toString(36).slice(2, 7)}`,
        emoji,
        sender: userName,
        createdAt: now
      };
      set((s) => ({ reactions: mergeReactions([...s.reactions, reaction]) }));

      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'react',
        userId,
        userName,
        reaction
      });

      try {
        const res = await fetch(
          `/api/music?action=jam&op=react&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: reaction.id, emoji, userId, userName })
          }
        );
        if (res.ok) {
          const data = await res.json();
          applyRoomPayload(data);
        }
      } catch {}
    },

    sendMessage: async (text) => {
      const clean = text.trim();
      const { roomCode, userId, userName } = get();
      if (!clean || !roomCode) return;

      const now = Date.now();
      const message: JamMessage = {
        id: `msg-${now}-${Math.random().toString(36).slice(2, 7)}`,
        sender: userName,
        text: clean.slice(0, 240),
        createdAt: now
      };
      set((s) => ({ messages: mergeMessages([...s.messages, message]) }));

      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'chat',
        userId,
        userName,
        message
      });

      try {
        const res = await fetch(
          `/api/music?action=jam&op=chat&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: message.id, text: message.text, userId, userName })
          }
        );
        if (res.ok) {
          const data = await res.json();
          applyRoomPayload(data);
        }
      } catch {}
    },

    addTrackToJam: async (track, playNow = false) => {
      unlockAudioEngine();
      const { roomCode, isHost, userId, userName } = get();
      const player = usePlayerStore.getState();

      const alreadyInQueue = player.queue.some((t) => t.id === track.id);
      if (!alreadyInQueue) {
        player.addToQueue(track);
      }

      const shouldStartPlayback = !player.currentTrack || playNow;
      if (shouldStartPlayback) {
        lastCollaborativeTrackSwitchAt = Date.now();
        const updatedQueue = usePlayerStore.getState().queue;
        const idx = Math.max(0, updatedQueue.findIndex((t) => t.id === track.id));
        player.playTrack(track, updatedQueue.length > 0 ? updatedQueue : [track], idx);
      }

      if (!roomCode) return;

      const now = Date.now();
      const sysMsg: JamMessage = {
        id: `sys-add-${now}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'WaveJam',
        text: `🎵 ${userName} ${shouldStartPlayback ? 'started playing' : 'queued'} "${track.title}"`,
        isSystem: true,
        createdAt: now
      };
      set((s) => ({ messages: mergeMessages([...s.messages, sysMsg]) }));

      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'add-track',
        userId,
        userName,
        addedTrack: track,
        playNow: shouldStartPlayback,
        currentTrack: usePlayerStore.getState().currentTrack,
        isPlaying: usePlayerStore.getState().isPlaying,
        currentTime: usePlayerStore.getState().currentTime,
        queue: usePlayerStore.getState().queue.slice(0, 30),
        message: sysMsg,
        updatedAt: now
      });

      try {
        const res = await fetch(
          `/api/music?action=jam&op=add-track&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track, playNow: shouldStartPlayback, userId, userName })
          }
        );
        if (res.ok) {
          const data = await res.json();
          applyRoomPayload(data);
        }
      } catch {}

      if (isHost) {
        await get().pushHostState();
      }
    },

    playTrackInJam: async (track) => {
      unlockAudioEngine();
      const { roomCode, userId, userName } = get();
      const player = usePlayerStore.getState();

      lastCollaborativeTrackSwitchAt = Date.now();
      const nextQueue = player.queue.some((t) => t.id === track.id)
        ? player.queue
        : [...player.queue, track];
      const idx = Math.max(0, nextQueue.findIndex((t) => t.id === track.id));
      player.playTrack(track, nextQueue, idx);

      if (!roomCode) return;

      const now = Date.now();
      const sysMsg: JamMessage = {
        id: `sys-play-${now}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'WaveJam',
        text: `▶️ ${userName} switched the room track to "${track.title}"`,
        isSystem: true,
        createdAt: now
      };
      set((s) => ({ messages: mergeMessages([...s.messages, sysMsg]) }));

      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'play-track',
        userId,
        userName,
        currentTrack: track,
        isPlaying: true,
        currentTime: 0,
        trackOverrideAt: now,
        queue: nextQueue.slice(0, 30),
        message: sysMsg,
        updatedAt: now
      });

      try {
        const res = await fetch(
          `/api/music?action=jam&op=play-track&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track, userId, userName })
          }
        );
        if (res.ok) {
          const data = await res.json();
          applyRoomPayload(data);
        }
      } catch {}
    },

    togglePlayInJam: async () => {
      unlockAudioEngine();
      const { roomCode, userId, userName } = get();
      const player = usePlayerStore.getState();
      const nextPlaying = !player.isPlaying;
      player.togglePlay();

      if (!roomCode) return;
      const now = Date.now();
      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'toggle-play',
        userId,
        userName,
        isPlaying: nextPlaying,
        currentTime: player.currentTime,
        trackOverrideAt: now,
        updatedAt: now
      });

      try {
        await fetch(`/api/music?action=jam&op=sync&room=${encodeURIComponent(roomCode)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            userName,
            isPlaying: nextPlaying,
            currentTime: player.currentTime
          })
        });
      } catch {}
    },

    skipTrackInJam: async () => {
      unlockAudioEngine();
      const player = usePlayerStore.getState();
      const nextIdx =
        player.queueIndex + 1 < player.queue.length ? player.queueIndex + 1 : 0;
      const candidate = player.queue[nextIdx];
      if (candidate) {
        await get().playTrackInJam(candidate);
      } else {
        player.nextTrack();
      }
    },

    syncNow: () => {
      unlockAudioEngine();
      if (latestRemoteRoomSnapshot) {
        applyRoomPayload(latestRemoteRoomSnapshot);
      }
      const player = usePlayerStore.getState();
      if (player.currentTrack && !player.isPlaying) {
        player.resume();
      }
    }
  };
});

// Automatically push host playback changes (track switch / play / pause / seek) immediately
usePlayerStore.subscribe((state, prevState) => {
  if (isApplyingRemoteState) return;
  const jam = useJamStore.getState();
  if (!jam.roomCode || !jam.isHost) return;

  const trackChanged = state.currentTrack?.id !== prevState.currentTrack?.id;
  const playChanged = state.isPlaying !== prevState.isPlaying;
  const timeJumped = Math.abs(state.currentTime - prevState.currentTime) > 3.0;
  const queueChanged = state.queue.length !== prevState.queue.length;

  if (trackChanged || playChanged || timeJumped || queueChanged) {
    jam.pushHostState();
  }
});
