import { create } from 'zustand';
import type { Track, PlayerState } from '../types';
import { shuffleArray } from '../utils/shuffle';
import { seekToTime, cancelActiveCrossfade } from '../components/player/YouTubeEmbed';
import { unlockAudioEngine, playVinylBackspin } from '../services/audioEngine';
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
    const queue = Array.isArray(parsed.queue) ? parsed.queue.slice(0, 150) : [];
    const originalQueue = Array.isArray(parsed.originalQueue)
      ? parsed.originalQueue.slice(0, 150)
      : [];
    const rawIndex = typeof parsed.queueIndex === 'number' ? parsed.queueIndex : -1;
    const clampedQueueIndex =
      queue.length === 0 ? -1 : Math.max(-1, Math.min(queue.length - 1, rawIndex));
    return {
      currentTrack: parsed.currentTrack || null,
      queue,
      originalQueue,
      queueIndex: clampedQueueIndex,
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
  window.addEventListener('pagehide', flushPlayerSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPlayerSession();
  });
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
  nextTrack: (options?: { silent?: boolean }) => void;
  prevTrack: (options?: { silent?: boolean }) => void;
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
  shuffleUpcoming: () => void;
  clearUpcoming: () => void;
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
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set({ currentTrack: track, duration: track.duration || 0 });
    savePlayerSessionSync(get());
  },

  playTrack: (track, queue, startIndex) => {
    try {
      unlockAudioEngine();
    } catch {}
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) {
      // Guest picked a track; delegate to Jam room queue
      handleJamGuestPlayTrack(track);
      return;
    }

    set((state) => {
      const hasExplicitQueue = Boolean(queue && queue.length > 0);
      let targetQueue = hasExplicitQueue
        ? [...queue!]
        : state.queue.length > 0
        ? [...state.queue]
        : [{ ...track }];
      let foundIdx =
        startIndex !== undefined
          ? Math.max(0, Math.min(targetQueue.length - 1, startIndex))
          : targetQueue.findIndex((t) => t.id === track.id);

      if (foundIdx === -1) {
        targetQueue = [{ ...track }, ...targetQueue];
        foundIdx = 0;
      }

      return {
        currentTrack: { ...track },
        queue: targetQueue,
        originalQueue: hasExplicitQueue
          ? [...targetQueue]
          : state.originalQueue.length > 0
          ? state.originalQueue
          : [...targetQueue],
        isShuffled: hasExplicitQueue ? false : state.isShuffled,
        queueIndex: foundIdx,
        isPlaying: true,
        isLoading: true,
        progress: 0,
        currentTime: 0,
        duration: track.duration || 0,
        playTriggerId: Date.now()
      };
    });
    savePlayerSessionSync(get());
  },

  togglePlay: () => {
    if (isJamGuestBlocked('pause') && !isJamRemoteApplying()) return;
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

  nextTrack: (options) => {
    if (isJamGuestBlocked('skip') && !isJamRemoteApplying()) return;
    if (!options?.silent) {
      try {
        playVinylBackspin();
      } catch {}
    }

    const state = get();
    const { queue, queueIndex, repeatMode } = state;
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        // Infinite queue autoplay recommendation trigger
        const settings = useSettingsStore.getState();
        if (settings.autoplay && state.currentTrack && !isJamGuestBlocked('skip')) {
          if (settings.offlineModeOnly) {
            const offline = getOfflineTracks();
            const existingIds = new Set(queue.map((t) => t.id));
            const unplayed = offline.filter((t) => !existingIds.has(t.id));
            if (unplayed.length > 0) {
              const newQueue = [...queue, ...unplayed];
              set({
                queue: newQueue,
                originalQueue: [...state.originalQueue, ...unplayed],
                currentTrack: unplayed[0],
                queueIndex: queue.length,
                progress: 0,
                currentTime: 0,
                duration: unplayed[0].duration || 0,
                isPlaying: true,
                isLoading: true,
                playTriggerId: Date.now()
              });
              savePlayerSessionSync(get());
              return;
            }
          } else {
            const track = state.currentTrack;
            const prevIdx = state.queueIndex;
            set({ isPlaying: false, isLoading: false, progress: 0, currentTime: 0 });
            savePlayerSessionSync(get());
            getSmartRecommendations(track, queue, 8)
              .then((recommended) => {
                const currentStore = get();
                // Guard against zombie overwrite: check if user hasn't already switched tracks
                if (
                  currentStore.currentTrack?.id !== track.id ||
                  currentStore.queueIndex !== prevIdx
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
                    isLoading: true,
                    playTriggerId: Date.now()
                  });
                  savePlayerSessionSync(get());
                }
              })
              .catch(() => {});
            return;
          }
        }

        set({ isPlaying: false, isLoading: false, progress: 0, currentTime: 0 });
        savePlayerSessionSync(get());
        return;
      }
    }

    const next = queue[nextIndex];
    set({
      currentTrack: next,
      queueIndex: nextIndex,
      progress: 0,
      currentTime: 0,
      duration: next?.duration || 0,
      isPlaying: true,
      isLoading: true,
      playTriggerId: Date.now()
    });
    savePlayerSessionSync(get());
  },

  prevTrack: (options) => {
    if (isJamGuestBlocked('skip') && !isJamRemoteApplying()) return;
    if (!options?.silent) {
      try {
        playVinylBackspin();
      } catch {}
    }

    const state = get();
    const { queue, queueIndex, currentTime, repeatMode } = state;

    if (currentTime > 3 || queue.length === 0) {
      seekToTime(0);
      set({ progress: 0, currentTime: 0, isPlaying: state.isPlaying });
      savePlayerSessionSync(get());
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      if (repeatMode === 'all') {
        prevIndex = queue.length - 1;
      } else {
        seekToTime(0);
        set({ progress: 0, currentTime: 0, isPlaying: state.isPlaying });
        savePlayerSessionSync(get());
        return;
      }
    }

    const prev = queue[prevIndex];
    set({
      currentTrack: prev,
      queueIndex: prevIndex,
      progress: 0,
      currentTime: 0,
      duration: prev?.duration || 0,
      isPlaying: true,
      isLoading: true,
      playTriggerId: Date.now()
    });
    savePlayerSessionSync(get());
  },

  seekTo: (time) => {
    if (isJamGuestBlocked('seek') && !isJamRemoteApplying()) return;

    cancelActiveCrossfade();
    const safeDuration = Number.isFinite(get().duration) && get().duration > 0 ? get().duration : 1;
    const safeTime = Number.isFinite(time) ? Math.max(0, Math.min(safeDuration, time)) : 0;
    seekToTime(safeTime);
    set({ currentTime: safeTime, progress: Math.min(100, Math.max(0, (safeTime / safeDuration) * 100)) });
  },

  setProgress: (progress, currentTime) => {
    const safeP = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
    const safeT = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
    set({ progress: safeP, currentTime: safeT });
  },

  setDuration: (duration) => {
    if (Number.isFinite(duration) && duration >= 0 && Math.abs(get().duration - duration) > 0.5) {
      set({ duration });
    }
  },

  setVolume: (volume) => {
    const safeVol = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
    set({ volume: safeVol, isMuted: safeVol === 0 });
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
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set((state) => {
      if (!state.isShuffled) {
        const originalQueue = [...state.queue];
        const activeIdx =
          state.queueIndex >= 0 && state.queueIndex < state.queue.length
            ? state.queueIndex
            : state.currentTrack
            ? state.queue.findIndex((t) => t.id === state.currentTrack?.id)
            : -1;
        const activeTrack = activeIdx >= 0 ? state.queue[activeIdx] : state.currentTrack;
        const rest =
          activeIdx >= 0 ? state.queue.filter((_, idx) => idx !== activeIdx) : [...state.queue];
        const shuffled = shuffleArray(rest);
        const newQueue = activeTrack ? [activeTrack, ...shuffled] : shuffled;

        return {
          isShuffled: true,
          originalQueue,
          queue: newQueue,
          queueIndex: activeTrack ? 0 : -1
        };
      } else {
        const currentTrack = state.currentTrack;
        const origIdx = currentTrack
          ? state.originalQueue.findIndex((t) => t.id === currentTrack.id)
          : -1;

        return {
          isShuffled: false,
          queue: [...state.originalQueue],
          queueIndex:
            state.originalQueue.length === 0 ? -1 : origIdx !== -1 ? origIdx : 0
        };
      }
    });
    savePlayerSessionSync(get());
  },

  cycleRepeat: () => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set((state) => {
      const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
      const currentIndex = modes.indexOf(state.repeatMode);
      const nextMode = modes[(currentIndex + 1) % modes.length];
      return { repeatMode: nextMode };
    });
    savePlayerSessionSync(get());
  },

  setQueue: (tracks) => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set({ queue: tracks, originalQueue: tracks });
    savePlayerSessionSync(get());
  },

  addToQueue: (track) => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set((state) => {
      const newQueue = [...state.queue, track];
      const newOriginalQueue = [...state.originalQueue, track];
      return { queue: newQueue, originalQueue: newOriginalQueue };
    });
    savePlayerSessionSync(get());
  },

  addNext: (track) => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
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
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set((state) => {
      if (index < 0 || index >= state.queue.length) return state;
      const newQueue = [...state.queue];
      const [removed] = newQueue.splice(index, 1);
      if (!removed) return state;

      // Remove matching item from originalQueue by occurrence index when possible
      const newOriginalQueue = [...state.originalQueue];
      const origIndex = newOriginalQueue.findIndex((t) => t.id === removed.id);
      if (origIndex !== -1) {
        newOriginalQueue.splice(origIndex, 1);
      }

      let newIndex = state.queueIndex;
      let newCurrentTrack = state.currentTrack;
      let nextProgress = state.progress;
      let nextCurrentTime = state.currentTime;
      let nextDuration = state.duration;
      let nextIsLoading = state.isLoading;
      let nextPlayTriggerId = state.playTriggerId;

      if (index < state.queueIndex) {
        newIndex--;
      } else if (index === state.queueIndex) {
        if (newQueue.length === 0) {
          newIndex = -1;
          newCurrentTrack = null;
          nextProgress = 0;
          nextCurrentTime = 0;
          nextDuration = 0;
          nextIsLoading = false;
          nextPlayTriggerId = undefined;
        } else {
          newIndex = Math.min(newIndex, newQueue.length - 1);
          newCurrentTrack = newQueue[newIndex];
          nextProgress = 0;
          nextCurrentTime = 0;
          nextDuration = newCurrentTrack?.duration || 0;
          nextIsLoading = state.isPlaying;
          nextPlayTriggerId = state.isPlaying ? Date.now() : state.playTriggerId;
        }
      }

      return {
        queue: newQueue,
        originalQueue: newOriginalQueue,
        queueIndex: newIndex,
        currentTrack: newCurrentTrack,
        isPlaying: newQueue.length === 0 ? false : state.isPlaying,
        progress: nextProgress,
        currentTime: nextCurrentTime,
        duration: nextDuration,
        isLoading: nextIsLoading,
        playTriggerId: nextPlayTriggerId
      };
    });
    savePlayerSessionSync(get());
  },

  reorderQueue: (fromIndex, toIndex) => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set((state) => {
      if (
        fromIndex < 0 ||
        fromIndex >= state.queue.length ||
        toIndex < 0 ||
        toIndex >= state.queue.length ||
        fromIndex === toIndex
      ) {
        return state;
      }

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

      const currentTrack =
        newIndex >= 0 && newIndex < newQueue.length ? newQueue[newIndex] : state.currentTrack;

      return {
        queue: newQueue,
        originalQueue: newOriginalQueue,
        queueIndex: newIndex,
        currentTrack
      };
    });
    savePlayerSessionSync(get());
  },

  clearQueue: () => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set({
      queue: [],
      originalQueue: [],
      queueIndex: -1,
      currentTrack: null,
      isPlaying: false,
      isLoading: false,
      progress: 0,
      currentTime: 0,
      duration: 0,
      playTriggerId: undefined
    });
    savePlayerSessionSync(get());
  },

  shuffleUpcoming: () => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set((state) => {
      const effectiveIdx =
        state.queueIndex >= 0
          ? state.queueIndex
          : state.currentTrack
          ? state.queue.findIndex((t) => t.id === state.currentTrack?.id)
          : -1;
      const splitAt = effectiveIdx >= 0 ? effectiveIdx + 1 : 0;
      if (state.queue.length - splitAt <= 1) return state;
      const beforeAndCurrent = state.queue.slice(0, splitAt);
      const upcoming = state.queue.slice(splitAt);
      const nextQueue = [...beforeAndCurrent, ...shuffleArray(upcoming)];
      return {
        originalQueue: state.isShuffled ? state.originalQueue : [...state.queue],
        queue: nextQueue,
        isShuffled: true
      };
    });
    savePlayerSessionSync(get());
  },

  clearUpcoming: () => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set((state) => {
      const effectiveIdx =
        state.queueIndex >= 0
          ? state.queueIndex
          : state.currentTrack
          ? state.queue.findIndex((t) => t.id === state.currentTrack?.id)
          : -1;
      const keepCurrent = effectiveIdx >= 0 ? state.queue.slice(0, effectiveIdx + 1) : [];
      if (keepCurrent.length === state.queue.length) return state;
      return {
        queue: keepCurrent,
        originalQueue: keepCurrent,
        queueIndex: keepCurrent.length > 0 ? Math.min(state.queueIndex, keepCurrent.length - 1) : -1
      };
    });
    savePlayerSessionSync(get());
  },

  setCrossfade: (duration) => {
    set({ crossfadeDuration: duration });
    useSettingsStore.getState().setCrossfade(duration);
  },
  setPlaybackSpeed: (speed) => {
    if (isJamGuestBlocked('play') && !isJamRemoteApplying()) return;
    set({ playbackSpeed: speed });
    savePlayerSessionSync(get());
  },
  setIsLoading: (loading) => set({ isLoading: loading })
}));
