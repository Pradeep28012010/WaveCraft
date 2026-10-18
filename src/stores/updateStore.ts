import { create } from 'zustand';
import {
  isAndroidNative,
  getNativeAppVersion,
  openNativeInstallSettings,
  downloadAndInstallNativeUpdate,
  triggerNativePendingInstall
} from '../services/nativeAndroid';
import { isVersionGreater } from '../utils/versionUtils';

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

export { isVersionGreater };

/**
 * Defensive version comparison helper that never throws
 */
export function safeCompareVersions(latest: string, current: string): boolean {
  try {
    if (typeof isVersionGreater === 'function') {
      return isVersionGreater(latest, current);
    }
  } catch {}
  try {
    const l = String(latest || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
    const c = String(current || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(l.length, c.length);
    for (let i = 0; i < len; i++) {
      const vl = l[i] ?? 0;
      const vc = c[i] ?? 0;
      if (vl > vc) return true;
      if (vl < vc) return false;
    }
  } catch {}
  return false;
}

const resolveApkDownloadUrl = (rawUrl?: string): string => {
  const url = rawUrl || '/WaveCraft.apk';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (url.includes('localhost')) {
      return 'https://wavecraft-alpha.vercel.app/WaveCraft.apk';
    }
    return url;
  }
  return `https://wavecraft-alpha.vercel.app${url.startsWith('/') ? '' : '/'}${url}`;
};

export const useUpdateStore = create<UpdateState>((set, get) => {
  const detectedCurrent =
    (typeof window !== 'undefined' && getNativeAppVersion()) || '5.2.1';

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
        const isNative = isAndroidNative();

        const t = Date.now();
        // Endpoints to check: live remote Vercel API, remote version.json, github raw, or local
        const endpoints = isNative
          ? [
              `https://wavecraft-alpha.vercel.app/version.json?_t=${t}`,
              `https://raw.githubusercontent.com/Pradeep28012010/WaveCraft/main/public/version.json?_t=${t}`,
              `https://wavecraft-alpha.vercel.app/api/music?action=version&_t=${t}`,
              `/version.json?_t=${t}`
            ]
          : [
              `/version.json?_t=${t}`,
              `https://wavecraft-alpha.vercel.app/version.json?_t=${t}`,
              `/api/music?action=version&_t=${t}`,
              `https://wavecraft-alpha.vercel.app/api/music?action=version&_t=${t}`
            ];

        for (const ep of endpoints) {
          try {
            const res = await fetch(ep, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              if (data && data.version) {
                if (!versionData || safeCompareVersions(data.version, versionData.version)) {
                  versionData = data;
                }
              }
            }
          } catch {}
        }

        // Fallback to GitHub Release API
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
                versionCode: 7,
                releaseDate: gh.published_at?.split('T')[0] || new Date().toISOString().split('T')[0],
                downloadUrl: apkAsset?.browser_download_url || 'https://wavecraft-alpha.vercel.app/WaveCraft.apk',
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
          const updateNeeded = safeCompareVersions(versionData.version, current);
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
      const resolvedApkUrl = resolveApkDownloadUrl(latestVersionInfo?.downloadUrl);

      if (isAndroidNative()) {
        set({ status: 'downloading', downloadProgress: 1, errorMessage: null, isModalOpen: true });
        const started = downloadAndInstallNativeUpdate(resolvedApkUrl);
        if (!started) {
          set({
            status: 'error',
            errorMessage: 'Unable to start native background updater. Please try again or download manually.'
          });
        }
      } else {
        // Desktop / Web PWA fallback
        const link = document.createElement('a');
        link.href = resolvedApkUrl;
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
