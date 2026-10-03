import { create } from 'zustand';
import type { Track, PlayerState } from '../types';
import { shuffleArray } from '../utils/shuffle';
import { seekToTime } from '../components/player/YouTubeEmbed';

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
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  repeatMode: 'off',
  isShuffled: false,
  queue: [],
  originalQueue: [],
  queueIndex: -1,
  crossfadeDuration: 0,
  playbackSpeed: 1,
  isLoading: false,

  setTrack: (track) => set({ currentTrack: track, duration: track.duration || 0 }),

  playTrack: (track, queue, startIndex) =>
    set((state) => {
      const targetQueue = queue && queue.length > 0 ? queue : state.queue.length > 0 ? state.queue : [track];
      const foundIdx =
        startIndex !== undefined
          ? startIndex
          : Math.max(0, targetQueue.findIndex((t) => t.id === track.id));
      return {
        currentTrack: { ...track },
        queue: targetQueue,
        originalQueue: queue && queue.length > 0 ? queue : state.originalQueue.length > 0 ? state.originalQueue : targetQueue,
        queueIndex: foundIdx,
        isPlaying: true,
        isLoading: true,
        progress: 0,
        currentTime: 0,
        duration: track.duration || 0
      };
    }),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  nextTrack: () =>
    set((state) => {
      const { queue, queueIndex, repeatMode, currentTrack } = state;
      if (queue.length === 0) return {};

      if (repeatMode === 'one' && currentTrack) {
        seekToTime(0);
        return { progress: 0, currentTime: 0, isPlaying: true };
      }

      let nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextIndex = 0;
        } else {
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
    }),

  prevTrack: () =>
    set((state) => {
      const { queue, queueIndex, currentTime, repeatMode } = state;

      if (currentTime > 3) {
        seekToTime(0);
        return { progress: 0, currentTime: 0 };
      }

      if (queue.length === 0) {
        seekToTime(0);
        return { progress: 0, currentTime: 0 };
      }

      let prevIndex = queueIndex - 1;
      if (prevIndex < 0) {
        if (repeatMode === 'all') {
          prevIndex = queue.length - 1;
        } else {
          prevIndex = 0;
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
    }),

  seekTo: (time) => {
    const dur = get().duration || 1;
    seekToTime(time);
    set({ currentTime: time, progress: (time / dur) * 100 });
  },

  setProgress: (progress, currentTime) => set({ progress, currentTime }),
  setDuration: (duration) => set({ duration }),

  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)), isMuted: volume === 0 ? true : false }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  toggleShuffle: () =>
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
    }),

  cycleRepeat: () =>
    set((state) => {
      const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
      const currentIndex = modes.indexOf(state.repeatMode);
      const nextMode = modes[(currentIndex + 1) % modes.length];
      return { repeatMode: nextMode };
    }),

  setQueue: (tracks) => set({ queue: tracks, originalQueue: tracks }),

  addToQueue: (track) =>
    set((state) => {
      const newQueue = [...state.queue, track];
      const newOriginalQueue = [...state.originalQueue, track];
      return { queue: newQueue, originalQueue: newOriginalQueue };
    }),

  addNext: (track) =>
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
    }),

  removeFromQueue: (index) =>
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
    }),

  reorderQueue: (fromIndex, toIndex) =>
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
    }),

  clearQueue: () => set({ queue: [], originalQueue: [], queueIndex: -1 }),

  setCrossfade: (duration) => set({ crossfadeDuration: duration }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setIsLoading: (loading) => set({ isLoading: loading })
}));
