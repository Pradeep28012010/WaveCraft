import { create } from 'zustand';
import type { Track } from '../types';
import {
  saveTrackOffline,
  isTrackOffline
} from '../services/offlineVault';
import { triggerAndroidHaptic } from '../services/nativeAndroid';

export interface DownloadBatchJob {
  id: string; // playlist id, 'liked_songs', 'album_xxx'
  name: string; // playlist or album name
  total: number;
  completed: number;
  failed: number;
  currentTrackTitle?: string;
  isDownloading: boolean;
  isPaused: boolean;
  isCancelled: boolean;
  startedAt: number;
  completedAt?: number;
  tracks: Track[];
}

interface DownloadStore {
  activeJob: DownloadBatchJob | null;
  recentJobs: DownloadBatchJob[];
  isDrawerOpen: boolean;

  // Actions
  startBatchDownload: (
    id: string,
    name: string,
    tracks: Track[]
  ) => Promise<{ success: number; failed: number }>;
  pauseBatchDownload: () => void;
  resumeBatchDownload: () => void;
  cancelBatchDownload: () => void;
  dismissActiveJob: () => void;
  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
}

// Internal cancellation and pause tokens
let cancelRequested = false;
let pausePromiseResolve: (() => void) | null = null;

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  activeJob: null,
  recentJobs: [],
  isDrawerOpen: false,

  startBatchDownload: async (id: string, name: string, tracks: Track[]) => {
    if (!tracks || tracks.length === 0) {
      return { success: 0, failed: 0 };
    }

    // If an active download is already running for the exact same ID, do nothing
    const current = get().activeJob;
    if (current && current.id === id && current.isDownloading) {
      return { success: 0, failed: 0 };
    }

    cancelRequested = false;
    pausePromiseResolve = null;

    const alreadyOfflineCount = tracks.filter((t) => isTrackOffline(t.id)).length;
    const missingTracks = tracks.filter((t) => !isTrackOffline(t.id));

    const initialJob: DownloadBatchJob = {
      id,
      name,
      total: tracks.length,
      completed: alreadyOfflineCount,
      failed: 0,
      currentTrackTitle: missingTracks[0]?.title || '',
      isDownloading: missingTracks.length > 0,
      isPaused: false,
      isCancelled: false,
      startedAt: Date.now(),
      tracks
    };

    set({ activeJob: initialJob });
    triggerAndroidHaptic('light');

    if (missingTracks.length === 0) {
      // All tracks already offline
      set((s) => ({
        activeJob: s.activeJob
          ? { ...s.activeJob, isDownloading: false, completedAt: Date.now() }
          : null
      }));
      return { success: 0, failed: 0 };
    }

    let completed = alreadyOfflineCount;
    let failed = 0;
    const concurrency = 2;
    let queueIdx = 0;

    async function worker() {
      while (queueIdx < missingTracks.length) {
        if (cancelRequested) break;

        // Handle pause
        if (get().activeJob?.isPaused) {
          await new Promise<void>((resolve) => {
            pausePromiseResolve = resolve;
          });
        }
        if (cancelRequested) break;

        const track = missingTracks[queueIdx++];
        if (!track) break;

        set((s) => {
          if (!s.activeJob || s.activeJob.id !== id) return s;
          return {
            activeJob: {
              ...s.activeJob,
              currentTrackTitle: track.title,
              completed,
              failed
            }
          };
        });

        try {
          const ok = await saveTrackOffline(track, 'manual');
          if (ok) {
            completed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }

        set((s) => {
          if (!s.activeJob || s.activeJob.id !== id) return s;
          return {
            activeJob: {
              ...s.activeJob,
              completed,
              failed
            }
          };
        });
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, missingTracks.length) },
      () => worker()
    );

    await Promise.all(workers);

    const isCancelled = cancelRequested;
    const completedAt = Date.now();

    set((s) => {
      if (!s.activeJob || s.activeJob.id !== id) return s;
      const finalCompleted = isCancelled ? completed : s.activeJob.total;
      const finishedJob: DownloadBatchJob = {
        ...s.activeJob,
        isDownloading: false,
        isCancelled,
        completed: finalCompleted,
        failed,
        completedAt
      };
      return {
        activeJob: finishedJob,
        recentJobs: [finishedJob, ...s.recentJobs.slice(0, 9)]
      };
    });

    if (!isCancelled) {
      triggerAndroidHaptic('medium');
    }

    return { success: completed - alreadyOfflineCount, failed };
  },

  pauseBatchDownload: () => {
    set((s) => {
      if (!s.activeJob || !s.activeJob.isDownloading) return s;
      return {
        activeJob: { ...s.activeJob, isPaused: true }
      };
    });
    triggerAndroidHaptic('light');
  },

  resumeBatchDownload: () => {
    set((s) => {
      if (!s.activeJob) return s;
      return {
        activeJob: { ...s.activeJob, isPaused: false }
      };
    });
    if (pausePromiseResolve) {
      pausePromiseResolve();
      pausePromiseResolve = null;
    }
    triggerAndroidHaptic('light');
  },

  cancelBatchDownload: () => {
    cancelRequested = true;
    if (pausePromiseResolve) {
      pausePromiseResolve();
      pausePromiseResolve = null;
    }
    set((s) => {
      if (!s.activeJob) return s;
      return {
        activeJob: {
          ...s.activeJob,
          isDownloading: false,
          isCancelled: true,
          completedAt: Date.now()
        }
      };
    });
    triggerAndroidHaptic('light');
  },

  dismissActiveJob: () => {
    set({ activeJob: null });
  },

  toggleDrawer: () => {
    set((s) => ({ isDrawerOpen: !s.isDrawerOpen }));
  },

  setDrawerOpen: (open: boolean) => {
    set({ isDrawerOpen: open });
  }
}));
