import { create } from 'zustand';
import {
  isAndroidNative,
  getNativeAppVersion,
  openNativeInstallSettings,
  downloadAndInstallNativeUpdate,
  triggerNativePendingInstall
} from '../services/nativeAndroid';

export interface AppVersionInfo {
  version: string;
  versionCode: number;
  releaseDate: string;
  downloadUrl: string;
  title: string;
  releaseNotes: string[];
  forceUpdate?: boolean;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'permission_needed'
  | 'up-to-date'
  | 'error';

interface UpdateState {
  currentVersion: string;
  latestVersionInfo: AppVersionInfo | null;
  hasUpdate: boolean;
  status: UpdateStatus;
  downloadProgress: number;
  errorMessage: string | null;
  isModalOpen: boolean;
  lastCheckedTime: number | null;

  openModal: () => void;
  closeModal: () => void;
  setProgress: (percent: number) => void;
  setStatus: (status: UpdateStatus) => void;
  setError: (error: string) => void;
  checkForUpdates: (manual?: boolean) => Promise<boolean>;
  startInstallUpdate: () => void;
  retryPendingInstall: () => void;
  openPermissionSettings: () => void;
}

import { isVersionGreater } from '../utils/versionUtils';
export { isVersionGreater };

export const useUpdateStore = create<UpdateState>((set, get) => {
  const detectedCurrent =
    (typeof window !== 'undefined' && getNativeAppVersion()) || '5.0.0';

  return {
    currentVersion: detectedCurrent,
    latestVersionInfo: null,
    hasUpdate: false,
    status: 'idle',
    downloadProgress: 0,
    errorMessage: null,
    isModalOpen: false,
    lastCheckedTime: null,

    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false, errorMessage: null }),

    setProgress: (percent: number) =>
      set({ downloadProgress: Math.min(100, Math.max(0, percent)), status: 'downloading' }),

    setStatus: (status: UpdateStatus) => set({ status, errorMessage: null }),

    setError: (error: string) => set({ status: 'error', errorMessage: error }),

    checkForUpdates: async (manual = false) => {
      set({ status: 'checking', errorMessage: null });
      if (manual) {
        set({ isModalOpen: true });
      }

      try {
        let versionData: AppVersionInfo | null = null;

        // 1. Try local version API
        try {
          const res = await fetch('/api/music?action=version', { cache: 'no-store' });
          if (res.ok) {
            versionData = await res.json();
          }
        } catch {}

        // 2. Try static public/version.json
        if (!versionData) {
          try {
            const res = await fetch('/version.json', { cache: 'no-store' });
            if (res.ok) {
              versionData = await res.json();
            }
          } catch {}
        }

        // 3. Fallback to GitHub Release API
        if (!versionData) {
          try {
            const res = await fetch(
              'https://api.github.com/repos/Pradeep28012010/WaveCraft/releases/latest',
              { headers: { Accept: 'application/vnd.github.v3+json' } }
            );
            if (res.ok) {
              const gh = await res.json();
              const tag = (gh.tag_name || '5.0.0').replace(/^v/, '');
              const apkAsset = gh.assets?.find((a: { name: string; browser_download_url: string }) =>
                a.name.endsWith('.apk')
              );
              versionData = {
                version: tag,
                versionCode: 5,
                releaseDate: gh.published_at?.split('T')[0] || new Date().toISOString().split('T')[0],
                downloadUrl: apkAsset?.browser_download_url || '/WaveCraft.apk',
                title: gh.name || `WaveCraft v${tag}`,
                releaseNotes: gh.body
                  ? gh.body.split('\n').filter((l: string) => l.trim().length > 0)
                  : ['Performance enhancements and bug fixes'],
                forceUpdate: false
              };
            }
          } catch {}
        }

        const current = getNativeAppVersion() || get().currentVersion || '5.0.0';

        if (versionData) {
          const updateNeeded = isVersionGreater(versionData.version, current);
          set({
            latestVersionInfo: versionData,
            hasUpdate: updateNeeded,
            status: updateNeeded ? 'available' : 'up-to-date',
            lastCheckedTime: Date.now(),
            currentVersion: current
          });
          return updateNeeded;
        } else {
          set({
            status: 'up-to-date',
            lastCheckedTime: Date.now()
          });
          return false;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not check for updates';
        set({ status: 'error', errorMessage: message });
        return false;
      }
    },

    startInstallUpdate: () => {
      const { latestVersionInfo } = get();
      const rawUrl = latestVersionInfo?.downloadUrl || '/WaveCraft.apk';
      const fullUrl = rawUrl.startsWith('http')
        ? rawUrl
        : `${window.location.origin}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;

      if (isAndroidNative()) {
        set({ status: 'downloading', downloadProgress: 1, errorMessage: null, isModalOpen: true });
        const started = downloadAndInstallNativeUpdate(fullUrl);
        if (!started) {
          set({
            status: 'error',
            errorMessage: 'Unable to start native background updater. Please try again or download manually.'
          });
        }
      } else {
        // Desktop / Web PWA fallback
        const link = document.createElement('a');
        link.href = fullUrl;
        link.download = 'WaveCraft.apk';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        set({ status: 'available' });
      }
    },

    retryPendingInstall: () => {
      if (isAndroidNative()) {
        triggerNativePendingInstall();
      }
    },

    openPermissionSettings: () => {
      if (isAndroidNative()) {
        openNativeInstallSettings();
      }
    }
  };
});

// Register native Android callbacks safely on window
if (typeof window !== 'undefined') {
  window.__wavecraft_update_progress = (percent: number) => {
    useUpdateStore.getState().setProgress(percent);
  };

  window.__wavecraft_update_status = (status: string) => {
    const store = useUpdateStore.getState();
    if (status === 'permission_needed') {
      store.setStatus('permission_needed');
    } else if (status === 'installing') {
      store.setStatus('installing');
    } else if (status === 'downloading') {
      store.setStatus('downloading');
    }
  };

  window.__wavecraft_update_error = (error: string) => {
    useUpdateStore.getState().setError(error);
  };
}
