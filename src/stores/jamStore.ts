import { create } from 'zustand';
import type { Track } from '../types';
import { usePlayerStore } from './playerStore';
import { unlockAudioEngine } from '../components/player/YouTubeEmbed';
import { getPreciseAudioTime, seekToTime } from '../services/audioEngine';
import { jamSyncEngine, type JamAudioAnchor } from '../services/jamSyncEngine';
import { jamWebRtc } from '../services/jamWebRtc';
import { searchTracks } from '../services/youtube';

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
  eventType?:
    | 'add-track'
    | 'play-track'
    | 'toggle-play'
    | 'sync-state'
    | 'sync-anchor'
    | 'sync-ping'
    | 'sync-pong'
    | 'sync-beep'
    | 'webrtc-signal'
    | 'p2p-ping'
    | 'p2p-pong'
    | 'p2p-anchor'
    | string;
  addedTrack?: Track;
  currentTrack?: Track | null;
  queue?: Track[];
  isPlaying?: boolean;
  currentTime?: number;
  playNow?: boolean;
  sentAt?: number;
  updatedAt?: number;
  trackOverrideAt?: number;
  syncAnchor?: JamAudioAnchor;
  clientSendEpoch?: number;
  hostReceiveEpoch?: number;
  hostSendEpoch?: number;
  targetGuestId?: string;
  guestId?: string;
  rendezvousAt?: number;
  serverTime?: number;
  signal?: any;
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
  triggerSyncClick: () => void;
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
let hostPulseInterval: ReturnType<typeof setInterval> | null = null;
let guestPingInterval: ReturnType<typeof setInterval> | null = null;
let sseSource: EventSource | null = null;
let serverSseSource: EventSource | null = null;
let isApplyingRemoteState = false;
let lastCollaborativeTrackSwitchAt = 0;
let latestRemoteRoomSnapshot: JamRoomSnapshot | null = null;
let syncSeq = 1;
let lastRelayPulseAt = 0;

function getRelayTopic(roomCode: string) {
  return `wavecraft_jam_v2_${roomCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
}

function publishRealtimeEvent(roomCode: string, eventPayload: JamRoomSnapshot) {
  // 1. Direct WebRTC P2P DataChannel (1ms - 4ms latency on LAN / Wi-Fi)
  if (jamWebRtc.isConnected()) {
    jamWebRtc.send(eventPayload);
  }

  // 2. Local-tab BroadcastChannel
  try {
    bc?.postMessage(eventPayload);
  } catch {}

  // 3. Local API server broadcast (via SSE to all room clients)
  fetch(`/api/music?action=jam&op=sync&room=${encodeURIComponent(roomCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventPayload)
  }).catch(() => {});

  // 4. Cloud Relay (throttled to max 1 per 6s for continuous pulses, instant for actions)
  const isHighFreqPulse = eventPayload.eventType === 'sync-anchor' || eventPayload.eventType === 'sync-ping';
  const now = Date.now();
  if (!isHighFreqPulse || now - lastRelayPulseAt > 6500) {
    if (isHighFreqPulse) lastRelayPulseAt = now;
    try {
      const topic = getRelayTopic(roomCode);
      fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        body: JSON.stringify(eventPayload),
        headers: { 'Title': 'JamSync', 'Priority': 'high' }
      }).catch(() => {});
    } catch {}
  }
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

    // WebRTC Signal Forwarding
    if (room.eventType === 'webrtc-signal' && room.signal) {
      jamWebRtc.handleRemoteSignal(room.signal);
      return;
    }

    // Direct P2P Micro-NTP Handshake
    if (room.eventType === 'p2p-ping' && get().isHost) {
      jamWebRtc.send({
        roomCode: activeRoomCode,
        eventType: 'p2p-pong',
        clientSendEpoch: room.clientSendEpoch,
        hostReceiveEpoch: Date.now()
      });
      return;
    }

    if (room.eventType === 'p2p-pong' && !get().isHost) {
      if (typeof room.clientSendEpoch === 'number' && typeof room.hostReceiveEpoch === 'number') {
        jamSyncEngine.handlePingPongResponse(
          room.clientSendEpoch,
          room.hostReceiveEpoch,
          room.hostReceiveEpoch,
          Date.now(),
          true
        );
      }
      return;
    }

    if (room.eventType === 'p2p-anchor' && room.syncAnchor && !get().isHost) {
      jamSyncEngine.updateAnchor(room.syncAnchor);
      return;
    }

    // Dual-Device Acoustic Sync Click Beep
    if (room.eventType === 'sync-beep' && room.rendezvousAt) {
      jamSyncEngine.playAcousticSyncBeep(room.rendezvousAt);
      return;
    }

    // Standard Micro-NTP Ping-Pong Routing
    if (room.eventType === 'sync-ping' && get().isHost && room.guestId) {
      publishRealtimeEvent(activeRoomCode, {
        roomCode: activeRoomCode,
        eventType: 'sync-pong',
        targetGuestId: room.guestId,
        clientSendEpoch: room.clientSendEpoch,
        hostReceiveEpoch: Date.now(),
        hostSendEpoch: Date.now()
      });
      return;
    }

    if (room.eventType === 'sync-pong' && !get().isHost && room.targetGuestId === get().userId) {
      if (typeof room.clientSendEpoch === 'number' && typeof room.hostReceiveEpoch === 'number') {
        jamSyncEngine.handlePingPongResponse(
          room.clientSendEpoch,
          room.hostReceiveEpoch,
          room.hostSendEpoch || room.hostReceiveEpoch,
          Date.now(),
          false
        );
      }
      return;
    }

    // Continuous Sub-Millisecond Audio Sync Anchor
    if (room.syncAnchor && !get().isHost) {
      jamSyncEngine.updateAnchor(room.syncAnchor);
    }

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

    // 3. Collaborative "add-track"
    const addedTrack = room.addedTrack;
    if (room.eventType === 'add-track' && addedTrack) {
      const exists = player.queue.some((t) => t.id === addedTrack.id);
      if (!exists) {
        player.addToQueue(addedTrack);
      }
      if (!player.currentTrack || room.playNow) {
        isApplyingRemoteState = true;
        lastCollaborativeTrackSwitchAt = Date.now();
        player.playTrack(
          addedTrack,
          exists ? player.queue : [...player.queue, addedTrack],
          0
        );
        setTimeout(() => {
          isApplyingRemoteState = false;
        }, 200);
      }
      return;
    }

    // 4. Collaborative "play-track" with synchronized rendezvous
    const playCurrentTrack = room.currentTrack;
    if (room.eventType === 'play-track' && playCurrentTrack) {
      isApplyingRemoteState = true;
      lastCollaborativeTrackSwitchAt = Date.now();
      const nextQueue =
        Array.isArray(room.queue) && room.queue.length > 0
          ? room.queue
          : player.queue.some((t) => t.id === playCurrentTrack.id)
          ? player.queue
          : [...player.queue, playCurrentTrack];
      const idx = Math.max(
        0,
        nextQueue.findIndex((t: Track) => t.id === playCurrentTrack.id)
      );

      if (room.syncAnchor) {
        jamSyncEngine.updateAnchor(room.syncAnchor);
      }

      // Immediately pass track to playerStore so YouTubeEmbed can set audio.src & pre-buffer.
      // YouTubeEmbed will delay actual audio.play() until rendezvousAt for acoustic lockstep.
      player.playTrack(playCurrentTrack, nextQueue, idx);

      setTimeout(() => {
        isApplyingRemoteState = false;
      }, 350);
      return;
    }

    // 5. Collaborative "toggle-play" with synchronized rendezvous
    if (room.eventType === 'toggle-play' && typeof room.isPlaying === 'boolean') {
      isApplyingRemoteState = true;
      lastCollaborativeTrackSwitchAt = Date.now();

      if (room.syncAnchor && !get().isHost) {
        jamSyncEngine.updateAnchor(room.syncAnchor);
      }

      const hostNow = jamSyncEngine.getSynchronizedHostEpoch();
      const delayMs = room.rendezvousAt
        ? Math.max(0, room.rendezvousAt - hostNow)
        : 0;

      const executeToggle = () => {
        if (room.isPlaying && !player.isPlaying) {
          player.resume();
        } else if (!room.isPlaying && player.isPlaying) {
          player.pause();
          if (!get().isHost) {
            jamSyncEngine.stopPLL();
          }
        }
      };

      if (delayMs > 10 && delayMs < 1500) {
        setTimeout(executeToggle, delayMs);
      } else {
        executeToggle();
      }

      setTimeout(() => {
        isApplyingRemoteState = false;
      }, 250);
      return;
    }

    // 6. Queue Merging
    if (Array.isArray(room.queue) && room.queue.length > 0) {
      const localIds = new Set(player.queue.map((t) => t.id));
      const newTracks = room.queue.filter((t: Track) => t && t.id && !localIds.has(t.id));
      if (newTracks.length > 0) {
        newTracks.forEach((t: Track) => player.addToQueue(t));
      }
    }

    // 7. Host overrides
    const curTrack = room.currentTrack;
    if (get().isHost) {
      if (
        curTrack &&
        (!player.currentTrack ||
          (room.trackOverrideAt &&
            room.trackOverrideAt > lastCollaborativeTrackSwitchAt &&
            Date.now() - room.trackOverrideAt < 6000 &&
            player.currentTrack.id !== curTrack.id))
      ) {
        isApplyingRemoteState = true;
        lastCollaborativeTrackSwitchAt = room.trackOverrideAt || Date.now();
        const q =
          Array.isArray(room.queue) && room.queue.length > 0
            ? room.queue
            : [curTrack];
        const idx = Math.max(0, q.findIndex((t: Track) => t.id === curTrack.id));
        player.playTrack(curTrack, q, idx);
        setTimeout(() => {
          isApplyingRemoteState = false;
        }, 250);
      }
      return;
    }

    // 8. Guest UltraSync Alignment with Host Anchor
    if (!get().isHost && curTrack) {
      isApplyingRemoteState = true;
      try {
        const trackChanged = player.currentTrack?.id !== curTrack.id;
        if (trackChanged) {
          const nextQueue =
            Array.isArray(room.queue) && room.queue.length > 0
              ? room.queue
              : [curTrack];
          const idx = Math.max(
            0,
            nextQueue.findIndex((t: Track) => t.id === curTrack.id)
          );
          player.playTrack(curTrack, nextQueue, idx);
        }

        if (room.isPlaying && !player.isPlaying) {
          player.resume();
        } else if (!room.isPlaying && player.isPlaying) {
          player.pause();
        }

        // Pass authoritative anchor to the PLL engine for continuous micro-steering
        if (room.syncAnchor) {
          jamSyncEngine.updateAnchor(room.syncAnchor);
        } else if (typeof room.currentTime === 'number') {
          const fallbackAnchor: JamAudioAnchor = {
            trackId: curTrack.id,
            position: room.currentTime,
            hostEpoch: room.updatedAt || Date.now(),
            playbackRate: 1.0,
            isPlaying: Boolean(room.isPlaying),
            syncVersion: ++syncSeq
          };
          jamSyncEngine.updateAnchor(fallbackAnchor);
        }
      } finally {
        setTimeout(() => {
          isApplyingRemoteState = false;
        }, 150);
      }
    }
  };

  const connectRealtimeStreams = (roomCode: string) => {
    // 1. Same-device / local-network BroadcastChannel
    if (!bc && typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('wavecraft_jam_channel');
      } catch {}
    }
    if (bc) {
      bc.onmessage = (ev) => {
        if (ev.data && ev.data.roomCode === get().roomCode) {
          jamSyncEngine.setTransport('broadcast');
          applyRoomPayload(ev.data);
        }
      };
    }

    // 2. WebRTC Peer-to-Peer DataChannel (1ms - 4ms latency on same Wi-Fi)
    jamWebRtc.init(
      get().userId,
      get().isHost,
      (data) => {
        jamSyncEngine.setTransport('webrtc-p2p');
        applyRoomPayload(data);
      },
      (status) => {
        if (status === 'connected') {
          jamSyncEngine.setTransport('webrtc-p2p');
        }
      },
      (signal) => {
        publishRealtimeEvent(roomCode, {
          roomCode,
          eventType: 'webrtc-signal',
          signal
        } as any);
      }
    );

    // 3. Local API Server SSE Stream
    if (serverSseSource) {
      try {
        serverSseSource.close();
      } catch {}
      serverSseSource = null;
    }
    if (typeof EventSource !== 'undefined') {
      try {
        const es = new EventSource(
          `/api/music?action=jam&op=stream&room=${encodeURIComponent(roomCode)}`
        );
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data && data.roomCode === get().roomCode) {
              if (!jamWebRtc.isConnected()) {
                jamSyncEngine.setTransport('server-sse');
              }
              applyRoomPayload(data);
            }
          } catch {}
        };
        serverSseSource = es;
      } catch {}
    }

    // 4. Cross-device EventSource (SSE) relay fallback
    if (sseSource) {
      try {
        sseSource.close();
      } catch {}
      sseSource = null;
    }

    const topic = getRelayTopic(roomCode);

    if (typeof EventSource !== 'undefined') {
      try {
        const es = new EventSource(`https://ntfy.sh/${topic}/sse`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            const inner = data.message ? JSON.parse(data.message) : data;
            if (inner && inner.roomCode === get().roomCode) {
              if (!jamWebRtc.isConnected() && !serverSseSource) {
                jamSyncEngine.setTransport('relay');
              }
              applyRoomPayload(inner);
            }
          } catch {}
        };
        sseSource = es;
      } catch {}
    }
  };

  const sendSyncPing = () => {
    const { roomCode, isHost, userId } = get();
    if (!roomCode || isHost) return;

    if (jamWebRtc.isConnected()) {
      jamWebRtc.send({
        roomCode,
        eventType: 'p2p-ping',
        clientSendEpoch: Date.now()
      });
      return;
    }

    publishRealtimeEvent(roomCode, {
      roomCode,
      eventType: 'sync-ping',
      guestId: userId,
      clientSendEpoch: Date.now()
    });
  };

  const broadcastHostAnchorPulse = () => {
    const { roomCode, isHost } = get();
    if (!roomCode || !isHost) return;
    const player = usePlayerStore.getState();
    if (!player.currentTrack || !player.isPlaying) return;

    const precisePos = getPreciseAudioTime();
    const anchor: JamAudioAnchor = {
      trackId: player.currentTrack.id,
      position: precisePos,
      hostEpoch: Date.now(),
      playbackRate: player.playbackSpeed || 1.0,
      isPlaying: player.isPlaying,
      syncVersion: ++syncSeq
    };

    // If P2P DataChannel is open, stream directly to peer with zero server overhead
    if (jamWebRtc.isConnected()) {
      jamWebRtc.send({
        roomCode,
        eventType: 'p2p-anchor',
        syncAnchor: anchor,
        updatedAt: anchor.hostEpoch
      });
      return;
    }

    publishRealtimeEvent(roomCode, {
      roomCode,
      eventType: 'sync-anchor',
      syncAnchor: anchor,
      updatedAt: anchor.hostEpoch
    });
  };

  const startRoomPolling = () => {
    if (pollInterval) clearInterval(pollInterval);
    if (hostPulseInterval) clearInterval(hostPulseInterval);
    if (guestPingInterval) clearInterval(guestPingInterval);

    const currentCode = get().roomCode;
    if (currentCode) {
      connectRealtimeStreams(currentCode);
    }

    // 1. High-frequency 60ms Audio Anchor Pulse for Host
    hostPulseInterval = setInterval(() => {
      if (get().isHost) {
        broadcastHostAnchorPulse();
      }
    }, 60);

    // 2. High-frequency micro-NTP ping for Guest
    guestPingInterval = setInterval(() => {
      if (!get().isHost) {
        sendSyncPing();
      }
    }, 1000);

    // 3. Fallback server state sync
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
    }, 2500);
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
      sendSyncPing();

      // Announce join
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
      if (hostPulseInterval) {
        clearInterval(hostPulseInterval);
        hostPulseInterval = null;
      }
      if (guestPingInterval) {
        clearInterval(guestPingInterval);
        guestPingInterval = null;
      }
      if (serverSseSource) {
        try {
          serverSseSource.close();
        } catch {}
        serverSseSource = null;
      }
      if (sseSource) {
        try {
          sseSource.close();
        } catch {}
        sseSource = null;
      }
      jamWebRtc.cleanup();
      jamSyncEngine.stopPLL();

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
        reaction,
        updatedAt: now
      });

      try {
        await fetch(
          `/api/music?action=jam&op=react&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emoji, userId, userName, id: reaction.id })
          }
        );
      } catch {}
    },

    sendMessage: async (text) => {
      const { roomCode, userId, userName } = get();
      if (!roomCode || !text.trim()) return;

      const now = Date.now();
      const msg: JamMessage = {
        id: `chat-${now}-${Math.random().toString(36).slice(2, 7)}`,
        sender: userName,
        text: text.trim().slice(0, 240),
        createdAt: now
      };

      set((s) => ({ messages: mergeMessages([...s.messages, msg]) }));

      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'chat',
        message: msg,
        updatedAt: now
      });

      try {
        await fetch(
          `/api/music?action=jam&op=chat&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: msg.text, userId, userName, id: msg.id })
          }
        );
      } catch {}
    },

    pushHostState: async () => {
      const { roomCode, isHost, userId, userName } = get();
      if (!roomCode || !isHost) return;

      const player = usePlayerStore.getState();
      const now = Date.now();
      const preciseTime = getPreciseAudioTime();

      const syncAnchor: JamAudioAnchor = {
        trackId: player.currentTrack?.id || '',
        position: preciseTime,
        hostEpoch: now,
        playbackRate: player.playbackSpeed || 1.0,
        isPlaying: player.isPlaying,
        syncVersion: ++syncSeq
      };

      const payload = {
        roomCode,
        eventType: 'sync',
        userId,
        userName,
        hostName: userName,
        currentTrack: player.currentTrack,
        isPlaying: player.isPlaying,
        currentTime: preciseTime,
        queue: player.queue.slice(0, 30),
        syncAnchor,
        updatedAt: now
      };

      publishRealtimeEvent(roomCode, payload);
    },

    addTrackToJam: async (track, shouldPlay = false) => {
      unlockAudioEngine();
      const { roomCode, userId, userName, isHost } = get();
      const player = usePlayerStore.getState();

      let playableTrack = track;
      if (!playableTrack.audioUrl && playableTrack.title) {
        try {
          const res = await searchTracks(`${playableTrack.title} ${playableTrack.artist}`);
          const match = res.find((t) => t.audioUrl);
          if (match && match.audioUrl) {
            playableTrack = { ...playableTrack, audioUrl: match.audioUrl };
          }
        } catch {}
      }

      const now = Date.now();
      const sysMsg: JamMessage = {
        id: `sys-add-${now}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'WaveJam',
        text: `🎵 ${userName} ${shouldPlay ? 'started playing' : 'added'} "${playableTrack.title}"`,
        isSystem: true,
        createdAt: now
      };

      set((s) => ({ messages: mergeMessages([...s.messages, sysMsg]) }));

      if (shouldPlay) {
        await get().playTrackInJam(playableTrack);
        return;
      }

      player.addToQueue(playableTrack);

      if (!roomCode) return;

      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'add-track',
        userId,
        userName,
        addedTrack: playableTrack,
        playNow: shouldPlay,
        currentTrack: usePlayerStore.getState().currentTrack,
        isPlaying: usePlayerStore.getState().isPlaying,
        currentTime: getPreciseAudioTime(),
        queue: usePlayerStore.getState().queue.slice(0, 30),
        message: sysMsg,
        updatedAt: now
      });

      try {
        await fetch(
          `/api/music?action=jam&op=add-track&room=${encodeURIComponent(roomCode)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track: playableTrack, playNow: shouldPlay, userId, userName })
          }
        );
      } catch {}

      if (isHost) {
        await get().pushHostState();
      }
    },

    playTrackInJam: async (track) => {
      unlockAudioEngine();
      const { roomCode, userId, userName } = get();
      const player = usePlayerStore.getState();

      // Resolve 320k direct stream if missing so both devices play on Web Audio
      let playableTrack = track;
      if (!playableTrack.audioUrl && playableTrack.title) {
        try {
          const found = await searchTracks(`${playableTrack.title} ${playableTrack.artist}`);
          const match = found.find((t) => t.audioUrl);
          if (match && match.audioUrl) {
            playableTrack = { ...playableTrack, audioUrl: match.audioUrl };
          }
        } catch {}
      }

      lastCollaborativeTrackSwitchAt = Date.now();
      const nextQueue = player.queue.some((t) => t.id === playableTrack.id)
        ? player.queue
        : [...player.queue, playableTrack];
      const idx = Math.max(0, nextQueue.findIndex((t) => t.id === playableTrack.id));

      if (!roomCode) {
        player.playTrack(playableTrack, nextQueue, idx);
        return;
      }

      const now = Date.now();
      // Synchronized kickoff rendezvous (480ms allows network delivery + pre-buffering)
      const rendezvousAt = now + 480;

      const sysMsg: JamMessage = {
        id: `sys-play-${now}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'WaveJam',
        text: `▶️ ${userName} switched room track to "${playableTrack.title}"`,
        isSystem: true,
        createdAt: now
      };
      set((s) => ({ messages: mergeMessages([...s.messages, sysMsg]) }));

      const syncAnchor: JamAudioAnchor = {
        trackId: playableTrack.id,
        position: 0,
        hostEpoch: rendezvousAt,
        playbackRate: 1.0,
        isPlaying: true,
        syncVersion: ++syncSeq,
        rendezvousAt
      };

      jamSyncEngine.updateAnchor(syncAnchor);

      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'play-track',
        userId,
        userName,
        currentTrack: playableTrack,
        isPlaying: true,
        currentTime: 0,
        trackOverrideAt: now,
        rendezvousAt,
        syncAnchor,
        queue: nextQueue.slice(0, 30),
        message: sysMsg,
        updatedAt: now
      });

      // Set the track on player immediately so local YouTubeEmbed also sets audio.src, pre-buffers,
      // and holds audio.play() until rendezvousAt for simultaneous kickoff.
      player.playTrack(playableTrack, nextQueue, idx);
    },

    togglePlayInJam: async () => {
      unlockAudioEngine();
      const { roomCode, userId, userName } = get();
      const player = usePlayerStore.getState();
      const nextPlaying = !player.isPlaying;

      if (!roomCode) {
        player.togglePlay();
        return;
      }

      const now = Date.now();
      const currentPos = getPreciseAudioTime();
      // Synchronized rendezvous: 100ms for pause, 280ms for resume
      const rendezvousAt = now + (nextPlaying ? 280 : 100);

      const syncAnchor: JamAudioAnchor = {
        trackId: player.currentTrack?.id || '',
        position: currentPos,
        hostEpoch: nextPlaying ? rendezvousAt : now,
        playbackRate: player.playbackSpeed || 1.0,
        isPlaying: nextPlaying,
        syncVersion: ++syncSeq,
        rendezvousAt: nextPlaying ? rendezvousAt : undefined
      };

      if (!get().isHost) {
        jamSyncEngine.updateAnchor(syncAnchor);
      }

      publishRealtimeEvent(roomCode, {
        roomCode,
        eventType: 'toggle-play',
        userId,
        userName,
        isPlaying: nextPlaying,
        currentTime: currentPos,
        rendezvousAt,
        syncAnchor,
        trackOverrideAt: now,
        updatedAt: now
      });

      const waitMs = Math.max(0, rendezvousAt - Date.now());
      setTimeout(() => {
        if (nextPlaying) {
          player.resume();
        } else {
          player.pause();
        }
      }, waitMs);
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

    triggerSyncClick: () => {
      const { roomCode } = get();
      const clickEpoch = jamSyncEngine.getSynchronizedHostEpoch() + 180;
      jamSyncEngine.playAcousticSyncBeep(clickEpoch);
      if (roomCode) {
        publishRealtimeEvent(roomCode, {
          roomCode,
          eventType: 'sync-beep',
          rendezvousAt: clickEpoch
        });
      }
    },

    syncNow: () => {
      unlockAudioEngine();
      sendSyncPing();
      if (latestRemoteRoomSnapshot) {
        applyRoomPayload(latestRemoteRoomSnapshot);
      }
      const player = usePlayerStore.getState();
      if (player.currentTrack && !player.isPlaying) {
        player.resume();
      }
      const anchor = jamSyncEngine.getActiveAnchor();
      if (anchor && anchor.isPlaying) {
        const hostNow = jamSyncEngine.getSynchronizedHostEpoch();
        const expected = Math.max(
          0,
          anchor.position +
            ((hostNow - anchor.hostEpoch) / 1000) * (anchor.playbackRate || 1.0) +
            jamSyncEngine.getUserLatencyOffsetMs() / 1000
        );
        seekToTime(expected);
        jamSyncEngine.startPLL();
      }
    }
  };
});

// Automatically push host playback changes immediately with precise audio anchor
usePlayerStore.subscribe((state, prevState) => {
  if (isApplyingRemoteState) return;
  const jam = useJamStore.getState();
  if (!jam.roomCode || !jam.isHost) return;

  const trackChanged = state.currentTrack?.id !== prevState.currentTrack?.id;
  const playChanged = state.isPlaying !== prevState.isPlaying;
  const timeJumped = Math.abs(state.currentTime - prevState.currentTime) > 1.2;
  const queueChanged = state.queue.length !== prevState.queue.length;

  if (trackChanged || playChanged || timeJumped || queueChanged) {
    jam.pushHostState();
  }
});
