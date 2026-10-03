import { create } from 'zustand';
import type { Track } from '../types';
import { usePlayerStore } from './playerStore';

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

interface JamStore {
  roomCode: string | null;
  isHost: boolean;
  userId: string;
  userName: string;
  hostName: string;
  members: JamMember[];
  reactions: JamReaction[];
  setUserName: (name: string) => void;
  createRoom: (customName?: string) => Promise<string>;
  joinRoom: (code: string, customName?: string) => Promise<void>;
  leaveRoom: () => void;
  sendReaction: (emoji: string) => Promise<void>;
  pushHostState: () => Promise<void>;
  addTrackToJam: (track: Track) => Promise<void>;
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
let pollInterval: any = null;
let isApplyingRemoteState = false;
const seenReactionIds = new Set<string>();

function ensureBroadcastChannel(applyRoomPayload: (data: any) => void) {
  if (bc || typeof BroadcastChannel === 'undefined') return;
  try {
    bc = new BroadcastChannel('wavecraft_jam_channel');
    bc.onmessage = (ev) => {
      const msg = ev.data;
      const activeCode = useJamStore.getState().roomCode;
      if (msg && msg.roomCode === activeCode) {
        applyRoomPayload(msg);
      }
    };
  } catch {}
}

export const useJamStore = create<JamStore>((set, get) => {
  const applyRoomPayload = (room: any) => {
    if (!room || room.roomCode !== get().roomCode) return;

    const newReactions: JamReaction[] = Array.isArray(room.reactions) ? room.reactions : [];
    newReactions.forEach((r) => seenReactionIds.add(r.id));

    set({
      hostName: room.hostName || 'DJ Host',
      members: Array.isArray(room.members) ? room.members : [],
      reactions: newReactions.slice(-12)
    });

    // If we are a guest (or syncing from another participant), align player state
    if (!get().isHost && room.currentTrack) {
      const player = usePlayerStore.getState();
      isApplyingRemoteState = true;
      try {
        const trackChanged = player.currentTrack?.id !== room.currentTrack.id;
        if (trackChanged) {
          player.playTrack(
            room.currentTrack,
            Array.isArray(room.queue) && room.queue.length > 0 ? room.queue : [room.currentTrack],
            0
          );
        } else if (Array.isArray(room.queue) && room.queue.length !== player.queue.length) {
          player.setQueue(room.queue);
        }

        if (room.isPlaying && !player.isPlaying) {
          player.resume();
        } else if (!room.isPlaying && player.isPlaying) {
          player.pause();
        }

        // Drift compensation
        const elapsedSec = room.isPlaying && room.updatedAt ? (Date.now() - room.updatedAt) / 1000 : 0;
        const expectedTime = Math.max(0, (room.currentTime || 0) + elapsedSec);
        if (Math.abs((player.currentTime || 0) - expectedTime) > 2.8) {
          player.seekTo(expectedTime);
        }
      } finally {
        setTimeout(() => {
          isApplyingRemoteState = false;
        }, 150);
      }
    }
  };

  const startRoomPolling = () => {
    if (pollInterval) clearInterval(pollInterval);
    ensureBroadcastChannel(applyRoomPayload);

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

    setUserName: (name) => {
      const clean = name.trim() || 'WaveRider';
      try {
        localStorage.setItem('wavecraft_jam_name', clean);
      } catch {}
      set({ userName: clean });
    },

    createRoom: async (customName) => {
      if (customName?.trim()) get().setUserName(customName);
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let suffix = '';
      for (let i = 0; i < 4; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = `WAVE-${suffix}`;
      const { userId, userName } = get();

      set({
        roomCode: code,
        isHost: true,
        hostName: userName,
        members: [{ id: userId, name: userName, lastSeen: Date.now() }],
        reactions: []
      });

      await get().pushHostState();
      startRoomPolling();
      return code;
    },

    joinRoom: async (code, customName) => {
      if (customName?.trim()) get().setUserName(customName);
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) return;

      const { userId, userName } = get();
      set({
        roomCode: cleanCode,
        isHost: false,
        reactions: []
      });

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

      startRoomPolling();
    },

    leaveRoom: () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      set({
        roomCode: null,
        isHost: false,
        members: [],
        reactions: []
      });
    },

    pushHostState: async () => {
      const { roomCode, userId, userName } = get();
      if (!roomCode) return;

      const player = usePlayerStore.getState();
      const payload = {
        roomCode,
        userId,
        userName,
        hostName: userName,
        currentTrack: player.currentTrack,
        isPlaying: player.isPlaying,
        currentTime: player.currentTime,
        queue: player.queue.slice(0, 25),
        updatedAt: Date.now()
      };

      try {
        bc?.postMessage({
          ...payload,
          members: get().members,
          reactions: get().reactions
        });
      } catch {}

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
          set({
            members: Array.isArray(data.members) ? data.members : get().members,
            reactions: Array.isArray(data.reactions) ? data.reactions.slice(-12) : get().reactions
          });
        }
      } catch {}
    },

    sendReaction: async (emoji) => {
      const { roomCode, userId, userName } = get();
      if (!roomCode) return;

      const optimistic: JamReaction = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        emoji,
        sender: userName,
        createdAt: Date.now()
      };
      set((s) => ({ reactions: [...s.reactions.slice(-11), optimistic] }));

      try {
        const res = await fetch(
          `/api/music?action=jam&op=react&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emoji, userId, userName })
          }
        );
        if (res.ok) {
          const data = await res.json();
          bc?.postMessage(data);
        }
      } catch {}
    },

    addTrackToJam: async (track) => {
      const { roomCode, isHost, userId, userName } = get();
      const player = usePlayerStore.getState();
      player.addToQueue(track);
      if (!player.currentTrack) {
        player.playTrack(track, [track], 0);
      }

      if (!roomCode) return;
      if (isHost) {
        await get().pushHostState();
      } else {
        try {
          const res = await fetch(
            `/api/music?action=jam&op=add-track&room=${encodeURIComponent(roomCode)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ track, userId, userName })
            }
          );
          if (res.ok) {
            const data = await res.json();
            applyRoomPayload(data);
            bc?.postMessage(data);
          }
        } catch {}
      }
    }
  };
});

// Automatically push host playback changes (track switch / play / pause) immediately
usePlayerStore.subscribe((state, prevState) => {
  if (isApplyingRemoteState) return;
  const jam = useJamStore.getState();
  if (!jam.roomCode || !jam.isHost) return;

  const trackChanged = state.currentTrack?.id !== prevState.currentTrack?.id;
  const playChanged = state.isPlaying !== prevState.isPlaying;
  const timeJumped = Math.abs(state.currentTime - prevState.currentTime) > 3.5;

  if (trackChanged || playChanged || timeJumped) {
    jam.pushHostState();
  }
});
