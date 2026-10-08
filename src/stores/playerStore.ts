import { create } from 'zustand';
import type { Track, PlayerState } from '../types';
import { shuffleArray } from '../utils/shuffle';
import { seekToTime } from '../components/player/YouTubeEmbed';
import { useSettingsStore } from './settingsStore';
import { getSmartRecommendations } from '../services/recommendationEngine';
import { getOfflineTracks } from '../services/offlineVault';

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
      repeatMode: 'off',
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

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  nextTrack: () => {
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
                  const currentQ = get().queue;
                  const existingIds = new Set(currentQ.map((t) => t.id));
                  const fresh = recommended.filter((t) => !existingIds.has(t.id));
                  if (fresh.length > 0) {
                    const newQueue = [...currentQ, ...fresh];
                    set({
                      queue: newQueue,
                      originalQueue: [...get().originalQueue, ...fresh],
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
    const dur = get().duration || 1;
    seekToTime(time);
    set({ currentTime: time, progress: (time / dur) * 100 });
  },

  setProgress: (progress, currentTime) => set({ progress, currentTime }),
  setDuration: (duration) => set({ duration }),

  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)), isMuted: volume === 0 });
    savePlayerSessionSync(get());
  },
  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
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
      const removed = newQueue.splice(index, 1)[0];
      const newOriginalQueue = state.originalQueue.filter((t) => t.id !== removed?.id);

      let newIndex = state.queueIndex;
      if (index < state.queueIndex) {
        newIndex--;
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
      newQueue.splice(toIndex, 0, moved);

      let newIndex = state.queueIndex;
      if (state.queueIndex === fromIndex) {
        newIndex = toIndex;
      } else if (fromIndex < state.queueIndex && toIndex >= state.queueIndex) {
        newIndex--;
      } else if (fromIndex > state.queueIndex && toIndex <= state.queueIndex) {
        newIndex++;
      }

      return { queue: newQueue, queueIndex: newIndex };
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
