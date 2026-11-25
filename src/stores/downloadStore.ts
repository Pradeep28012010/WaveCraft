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

// Per-job cancellation and pause tokens so starting a new batch cleanly supersedes any paused prior batch
interface JobControl {
  cancelled: boolean;
  pauseResolvers: Set<() => void>;
}
let activeJobControl: JobControl | null = null;

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

    // Deduplicate incoming tracks by ID so totals and queue counts are accurate
    const uniqueTracks: Track[] = [];
    const seenIds = new Set<string>();
    for (const t of tracks) {
      if (t && t.id && !seenIds.has(t.id)) {
        seenIds.add(t.id);
        uniqueTracks.push(t);
      }
    }
    if (uniqueTracks.length === 0) {
      return { success: 0, failed: 0 };
    }

    // Cleanly cancel and unblock any prior paused/running batch before starting a new one
    if (activeJobControl) {
      activeJobControl.cancelled = true;
      activeJobControl.pauseResolvers.forEach((res) => res());
      activeJobControl.pauseResolvers.clear();
    }
    const jobControl: JobControl = {
      cancelled: false,
      pauseResolvers: new Set<() => void>()
    };
    activeJobControl = jobControl;

    const alreadyOfflineCount = uniqueTracks.filter((t) => isTrackOffline(t.id)).length;
    const missingTracks = uniqueTracks.filter((t) => !isTrackOffline(t.id));

    const initialJob: DownloadBatchJob = {
      id,
      name,
      total: uniqueTracks.length,
      completed: alreadyOfflineCount,
      failed: 0,
      currentTrackTitle: missingTracks[0]?.title || '',
      isDownloading: missingTracks.length > 0,
      isPaused: false,
      isCancelled: false,
      startedAt: Date.now(),
      tracks: uniqueTracks
    };

    set({ activeJob: initialJob });
    triggerAndroidHaptic('light');

    if (missingTracks.length === 0) {
      // All tracks already offline
      set((s) => {
        if (activeJobControl !== jobControl) return s;
        return {
          activeJob: s.activeJob
            ? { ...s.activeJob, isDownloading: false, completedAt: Date.now() }
            : null
        };
      });
      if (activeJobControl === jobControl) activeJobControl = null;
      return { success: 0, failed: 0 };
    }

    let completed = alreadyOfflineCount;
    let failed = 0;
    const concurrency = 2;
    let queueIdx = 0;

    async function worker() {
      while (queueIdx < missingTracks.length) {
        if (jobControl.cancelled || activeJobControl !== jobControl) break;

        // Handle pause
        if (get().activeJob?.isPaused) {
          await new Promise<void>((resolve) => {
            jobControl.pauseResolvers.add(resolve);
          });
        }
        if (jobControl.cancelled || activeJobControl !== jobControl) break;

        const track = missingTracks[queueIdx++];
        if (!track) break;

        set((s) => {
          if (activeJobControl !== jobControl || !s.activeJob || s.activeJob.id !== id) return s;
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
          if (jobControl.cancelled || activeJobControl !== jobControl) break;
          if (ok) {
            completed++;
          } else {
            failed++;
          }
        } catch {
          if (jobControl.cancelled || activeJobControl !== jobControl) break;
          failed++;
        }

        set((s) => {
          if (activeJobControl !== jobControl || !s.activeJob || s.activeJob.id !== id) return s;
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

    const isCancelled = jobControl.cancelled;
    const isOwner = activeJobControl === jobControl;
    if (isOwner) {
      activeJobControl = null;
    }
    const completedAt = Date.now();

    if (isOwner) {
      set((s) => {
        if (!s.activeJob || s.activeJob.id !== id) return s;
        const finishedJob: DownloadBatchJob = {
          ...s.activeJob,
          isDownloading: false,
          isCancelled,
          completed,
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
    if (activeJobControl) {
      activeJobControl.pauseResolvers.forEach((res) => res());
      activeJobControl.pauseResolvers.clear();
    }
    triggerAndroidHaptic('light');
  },

  cancelBatchDownload: () => {
    if (activeJobControl) {
      activeJobControl.cancelled = true;
      activeJobControl.pauseResolvers.forEach((res) => res());
      activeJobControl.pauseResolvers.clear();
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
