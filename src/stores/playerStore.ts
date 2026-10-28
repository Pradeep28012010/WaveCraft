import { create } from 'zustand';
import type { Track, PlayerState } from '../types';
import { shuffleArray } from '../utils/shuffle';
import { seekToTime } from '../components/player/YouTubeEmbed';
import { unlockAudioEngine } from '../services/audioEngine';
import { useSettingsStore } from './settingsStore';
import { getSmartRecommendations } from '../services/recommendationEngine';
import { getOfflineTracks } from '../services/offlineVault';
import { isJamGuestBlocked, handleJamGuestPlayTrack, isJamRemoteApplying } from '../services/jamAuthority';

const PLAYER_SESSION_KEY = 'wavecraft_player_session_v1';

interface PersistedPlayerSession {
  currentTrack: Track | null;
  queue: Track[];
  originalQueue: Track[];
  queueIndex: number;
  volume: number;
  isMuted: boolean;
  repeatMode: 'off' | 'all' | 'one';
  isShuffled: boolean;
  playbackSpeed: number;
  duration: number;
}

function loadPlayerSessionSync(): PersistedPlayerSession {
  const defaults: PersistedPlayerSession = {
    currentTrack: null,
    queue: [],
    originalQueue: [],
    queueIndex: -1,
    volume: 0.8,
    isMuted: false,
    repeatMode: 'off',
    isShuffled: false,
    playbackSpeed: 1,
    duration: 0
  };
  try {
    const raw = localStorage.getItem(PLAYER_SESSION_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedPlayerSession>;
    return {
      currentTrack: parsed.currentTrack || null,
      queue: Array.isArray(parsed.queue) ? parsed.queue.slice(0, 150) : [],
      originalQueue: Array.isArray(parsed.originalQueue)
        ? parsed.originalQueue.slice(0, 150)
        : [],
      queueIndex: typeof parsed.queueIndex === 'number' ? parsed.queueIndex : -1,
      volume:
        typeof parsed.volume === 'number'
          ? Math.max(0, Math.min(1, parsed.volume))
          : defaults.volume,
      isMuted: typeof parsed.isMuted === 'boolean' ? parsed.isMuted : false,
      repeatMode:
        parsed.repeatMode && ['off', 'all', 'one'].includes(parsed.repeatMode)
          ? parsed.repeatMode
          : 'off',
      isShuffled: typeof parsed.isShuffled === 'boolean' ? parsed.isShuffled : false,
      playbackSpeed:
        typeof parsed.playbackSpeed === 'number' ? parsed.playbackSpeed : 1,
      duration: typeof parsed.duration === 'number' ? parsed.duration : 0
    };
  } catch {
    return defaults;
  }
}

let pendingPlayerState: PlayerState | null = null;
let playerSaveTimer: ReturnType<typeof setTimeout> | null = null;

function flushPlayerSession(): void {
  if (!pendingPlayerState) return;
  const state = pendingPlayerState;
  pendingPlayerState = null;
  if (playerSaveTimer) {
    clearTimeout(playerSaveTimer);
    playerSaveTimer = null;
  }
  try {
    const payload: PersistedPlayerSession = {
      currentTrack: state.currentTrack,
      queue: state.queue.slice(0, 150),
      originalQueue: state.originalQueue.slice(0, 150),
      queueIndex: state.queueIndex,
      volume: state.volume,
      isMuted: state.isMuted,
      repeatMode: state.repeatMode,
      isShuffled: state.isShuffled,
      playbackSpeed: state.playbackSpeed,
      duration: state.duration
    };
    localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(payload));
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPlayerSession);
}

function savePlayerSessionSync(state: PlayerState): void {
  pendingPlayerState = state;
  if (playerSaveTimer) clearTimeout(playerSaveTimer);
  playerSaveTimer = setTimeout(flushPlayerSession, 120);
}

interface PlayerStore extends PlayerState {
  setTrack: (track: Track) => void;
  playTrack: (track: Track, queue?: Track[], startIndex?: number) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (time: number) => void;
  setProgress: (progress: number, currentTime: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
  addNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  setCrossfade: (duration: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setIsLoading: (loading: boolean) => void;
  isNowPlayingOpen: boolean;
  setIsNowPlayingOpen: (open: boolean) => void;
  isQueueOpen: boolean;
  setIsQueueOpen: (open: boolean) => void;
}

const initialSession = loadPlayerSessionSync();

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTrack: initialSession.currentTrack,
  isPlaying: false,
  progress: 0,
  currentTime: 0,
  duration: initialSession.duration || initialSession.currentTrack?.duration || 0,
  volume: initialSession.volume,
  isMuted: initialSession.isMuted,
  repeatMode: initialSession.repeatMode,
  isShuffled: initialSession.isShuffled,
  queue: initialSession.queue,
  originalQueue: initialSession.originalQueue,
  queueIndex: initialSession.queueIndex,
  crossfadeDuration: 0,
  playbackSpeed: initialSession.playbackSpeed,
  isLoading: false,
  isNowPlayingOpen: false,
  setIsNowPlayingOpen: (open) => set({ isNowPlayingOpen: open }),
  isQueueOpen: false,
  setIsQueueOpen: (open) => set({ isQueueOpen: open }),

  setTrack: (track) => {
    set({ currentTrack: track, duration: track.duration || 0 });
    savePlayerSessionSync(get());
  },

  playTrack: (track, queue, startIndex) => {
    try {
      unlockAudioEngine();
    } catch {}
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) {
      // Guest picked a track; delegate to Jam room queue
      if (handleJamGuestPlayTrack(track)) return;
    }

    set((state) => {
      const targetQueue =
        queue && queue.length > 0
          ? queue
          : state.queue.length > 0
          ? state.queue
          : [track];
      const foundIdx =
        startIndex !== undefined
          ? startIndex
          : Math.max(0, targetQueue.findIndex((t) => t.id === track.id));
      return {
        currentTrack: { ...track },
        queue: targetQueue,
        originalQueue:
          queue && queue.length > 0
            ? queue
            : state.originalQueue.length > 0
            ? state.originalQueue
            : targetQueue,
        queueIndex: foundIdx,
        isPlaying: true,
        isLoading: true,
        progress: 0,
        currentTime: 0,
        duration: track.duration || 0
      };
    });
    savePlayerSessionSync(get());
  },

  togglePlay: () => {
    if (isJamGuestBlocked('pause')) return;
    set((state) => ({ isPlaying: !state.isPlaying }));
  },
  pause: () => {
    if (isJamGuestBlocked('pause') && !isJamRemoteApplying()) return;
    set({ isPlaying: false });
  },
  resume: () => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set({ isPlaying: true });
  },

  nextTrack: () => {
    if (isJamGuestBlocked('skip')) return;

    set((state) => {
      const { queue, queueIndex, repeatMode } = state;
      if (queue.length === 0) return {};

      let nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextIndex = 0;
        } else {
          // Infinite queue autoplay recommendation trigger
          const settings = useSettingsStore.getState();
          if (settings.autoplay && state.currentTrack) {
            if (settings.offlineModeOnly) {
              const offline = getOfflineTracks();
              const currentQ = get().queue;
              const existingIds = new Set(currentQ.map((t) => t.id));
              const unplayed = offline.filter((t) => !existingIds.has(t.id));
              if (unplayed.length > 0) {
                const newQueue = [...currentQ, ...unplayed];
                set({
                  queue: newQueue,
                  originalQueue: [...get().originalQueue, ...unplayed],
                  currentTrack: unplayed[0],
                  queueIndex: currentQ.length,
                  progress: 0,
                  currentTime: 0,
                  duration: unplayed[0].duration || 0,
                  isPlaying: true,
                  isLoading: true
                });
                savePlayerSessionSync(get());
                return {};
              }
            } else {
              const track = state.currentTrack;
              getSmartRecommendations(track, get().queue, 8)
                .then((recommended) => {
                  const currentStore = get();
                  // Guard against zombie overwrite: check if user hasn't already switched tracks
                  if (
                    currentStore.currentTrack?.id !== track.id ||
                    currentStore.queueIndex < currentStore.queue.length - 1
                  ) {
                    return;
                  }
                  const currentQ = currentStore.queue;
                  const existingIds = new Set(currentQ.map((t) => t.id));
                  const fresh = recommended.filter((t) => !existingIds.has(t.id));
                  if (fresh.length > 0) {
                    const newQueue = [...currentQ, ...fresh];
                    set({
                      queue: newQueue,
                      originalQueue: [...currentStore.originalQueue, ...fresh],
                      currentTrack: fresh[0],
                      queueIndex: currentQ.length,
                      progress: 0,
                      currentTime: 0,
                      duration: fresh[0].duration || 0,
                      isPlaying: true,
                      isLoading: true
                    });
                    savePlayerSessionSync(get());
                  }
                })
                .catch(() => {});
            }
          }

          return { isPlaying: false, progress: 0, currentTime: 0 };
        }
      }

      const next = queue[nextIndex];
      return {
        currentTrack: next,
        queueIndex: nextIndex,
        progress: 0,
        currentTime: 0,
        duration: next?.duration || 0,
        isPlaying: true,
        isLoading: true
      };
    });
    savePlayerSessionSync(get());
  },

  prevTrack: () => {
    if (isJamGuestBlocked('skip')) return;

    set((state) => {
      const { queue, queueIndex, currentTime, repeatMode } = state;

      if (currentTime > 3) {
        seekToTime(0);
        return { progress: 0, currentTime: 0, isPlaying: state.isPlaying };
      }

      if (queue.length === 0) {
        seekToTime(0);
        return { progress: 0, currentTime: 0, isPlaying: state.isPlaying };
      }

      let prevIndex = queueIndex - 1;
      if (prevIndex < 0) {
        if (repeatMode === 'all') {
          prevIndex = queue.length - 1;
        } else {
          seekToTime(0);
          return { progress: 0, currentTime: 0, isPlaying: state.isPlaying };
        }
      }

      const prev = queue[prevIndex];
      return {
        currentTrack: prev,
        queueIndex: prevIndex,
        progress: 0,
        currentTime: 0,
        duration: prev?.duration || 0,
        isPlaying: true,
        isLoading: true
      };
    });
    savePlayerSessionSync(get());
  },

  seekTo: (time) => {
    if (isJamGuestBlocked('seek')) return;

    const dur = get().duration || 1;
    seekToTime(time);
    set({ currentTime: time, progress: (time / dur) * 100 });
  },

  setProgress: (progress, currentTime) => set({ progress, currentTime }),
  setDuration: (duration) => {
    if (Math.abs(get().duration - duration) > 0.5) {
      set({ duration });
    }
  },

  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)), isMuted: volume === 0 });
    savePlayerSessionSync(get());
  },
  toggleMute: () => {
    set((state) => {
      const nextMuted = !state.isMuted;
      // If unmuting when volume is 0, restore to an audible level (0.25)
      const nextVolume = !nextMuted && state.volume === 0 ? 0.25 : state.volume;
      return { isMuted: nextMuted, volume: nextVolume };
    });
    savePlayerSessionSync(get());
  },

  toggleShuffle: () => {
    set((state) => {
      if (!state.isShuffled) {
        const originalQueue = [...state.queue];
        const currentTrack = state.currentTrack;
        const queueWithoutCurrent = state.queue.filter((t) => t.id !== currentTrack?.id);
        const shuffled = shuffleArray(queueWithoutCurrent);
        const newQueue = currentTrack ? [currentTrack, ...shuffled] : shuffled;

        return {
          isShuffled: true,
          originalQueue,
          queue: newQueue,
          queueIndex: currentTrack ? 0 : -1
        };
      } else {
        const currentTrack = state.currentTrack;
        const queueIndex = state.originalQueue.findIndex((t) => t.id === currentTrack?.id);

        return {
          isShuffled: false,
          queue: [...state.originalQueue],
          queueIndex: queueIndex !== -1 ? queueIndex : 0
        };
      }
    });
    savePlayerSessionSync(get());
  },

  cycleRepeat: () => {
    set((state) => {
      const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
      const currentIndex = modes.indexOf(state.repeatMode);
      const nextMode = modes[(currentIndex + 1) % modes.length];
      return { repeatMode: nextMode };
    });
    savePlayerSessionSync(get());
  },

  setQueue: (tracks) => {
    set({ queue: tracks, originalQueue: tracks });
    savePlayerSessionSync(get());
  },

  addToQueue: (track) => {
    set((state) => {
      const newQueue = [...state.queue, track];
      const newOriginalQueue = [...state.originalQueue, track];
      return { queue: newQueue, originalQueue: newOriginalQueue };
    });
    savePlayerSessionSync(get());
  },

  addNext: (track) => {
    set((state) => {
      const newQueue = [...state.queue];
      const newOriginalQueue = [...state.originalQueue];

      if (state.queueIndex >= 0) {
        newQueue.splice(state.queueIndex + 1, 0, track);
        const origIndex = newOriginalQueue.findIndex((t) => t.id === state.currentTrack?.id);
        if (origIndex >= 0) {
          newOriginalQueue.splice(origIndex + 1, 0, track);
        } else {
          newOriginalQueue.push(track);
        }
      } else {
        newQueue.push(track);
        newOriginalQueue.push(track);
      }

      return { queue: newQueue, originalQueue: newOriginalQueue };
    });
    savePlayerSessionSync(get());
  },

  removeFromQueue: (index) => {
    set((state) => {
      const newQueue = [...state.queue];
      const [removed] = newQueue.splice(index, 1);
      if (!removed) return state;

      // Find the specific instance in originalQueue rather than wiping all instances with same ID
      const newOriginalQueue = [...state.originalQueue];
      const origIndex = newOriginalQueue.findIndex((t) => t.id === removed.id);
      if (origIndex !== -1) {
        newOriginalQueue.splice(origIndex, 1);
      }

      let newIndex = state.queueIndex;
      if (index < state.queueIndex) {
        newIndex--;
      } else if (index === state.queueIndex) {
        newIndex = Math.min(newIndex, newQueue.length - 1);
      }

      return {
        queue: newQueue,
        originalQueue: newOriginalQueue,
        queueIndex: newIndex
      };
    });
    savePlayerSessionSync(get());
  },

  reorderQueue: (fromIndex, toIndex) => {
    set((state) => {
      const newQueue = [...state.queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      if (!moved) return state;
      newQueue.splice(toIndex, 0, moved);

      // Also maintain originalQueue in sync if shuffle is off
      let newOriginalQueue = state.originalQueue;
      if (!state.isShuffled) {
        newOriginalQueue = [...state.originalQueue];
        const [origMoved] = newOriginalQueue.splice(fromIndex, 1);
        if (origMoved) {
          newOriginalQueue.splice(toIndex, 0, origMoved);
        }
      }

      let newIndex = state.queueIndex;
      if (state.queueIndex === fromIndex) {
        newIndex = toIndex;
      } else if (fromIndex < state.queueIndex && toIndex >= state.queueIndex) {
        newIndex--;
      } else if (fromIndex > state.queueIndex && toIndex <= state.queueIndex) {
        newIndex++;
      }

      return { queue: newQueue, originalQueue: newOriginalQueue, queueIndex: newIndex };
    });
    savePlayerSessionSync(get());
  },

  clearQueue: () => {
    set({ queue: [], originalQueue: [], queueIndex: -1 });
    savePlayerSessionSync(get());
  },

  setCrossfade: (duration) => set({ crossfadeDuration: duration }),
  setPlaybackSpeed: (speed) => {
    set({ playbackSpeed: speed });
    savePlayerSessionSync(get());
  },
  setIsLoading: (loading) => set({ isLoading: loading })
}));
