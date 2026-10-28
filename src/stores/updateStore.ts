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
  windowsDownloadUrl?: string;
  windowsInstallerUrl?: string;
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
    (typeof window !== 'undefined' && getNativeAppVersion()) || '5.2.9';

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

        let current = getNativeAppVersion() || get().currentVersion || '5.0.0';
        if (typeof window !== 'undefined' && window.electronAPI?.getAppVersion) {
          try {
            const electronVer = await window.electronAPI.getAppVersion();
            if (electronVer) current = electronVer;
          } catch {}
        }

        if (versionData) {
          const updateNeeded = safeCompareVersions(versionData.version, current);
          set({
            latestVersionInfo: versionData,
            hasUpdate: updateNeeded,
            status: updateNeeded ? 'available' : 'up-to-date',
            lastCheckedTime: Date.now(),
            currentVersion: current,
            isModalOpen: updateNeeded ? true : get().isModalOpen
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

      // 1. Android Native APK Environment
      if (isAndroidNative()) {
        const resolvedApkUrl = resolveApkDownloadUrl(latestVersionInfo?.downloadUrl);
        set({ status: 'downloading', downloadProgress: 1, errorMessage: null, isModalOpen: true });
        const started = downloadAndInstallNativeUpdate(resolvedApkUrl);
        if (!started) {
          set({
            status: 'error',
            errorMessage: 'Unable to start native background updater. Please try again or download manually.'
          });
        }
        return;
      }

      // 2. Windows Desktop Electron App Environment
      if (typeof window !== 'undefined' && window.electronAPI?.downloadAndInstallUpdate) {
        const winUrl =
          latestVersionInfo?.windowsDownloadUrl ||
          latestVersionInfo?.windowsInstallerUrl ||
          'https://github.com/Pradeep28012010/WaveCraft/releases/latest/download/WaveCraft-Pro-Setup.exe';
        set({ status: 'downloading', downloadProgress: 1, errorMessage: null, isModalOpen: true });
        window.electronAPI.downloadAndInstallUpdate(winUrl).catch((err: unknown) => {
          set({
            status: 'error',
            errorMessage: err instanceof Error ? err.message : 'Windows update failed to launch'
          });
        });
        return;
      }

      // 3. Web Browser on Windows / Desktop PC
      const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent || navigator.platform);
      if (isWindows) {
        const winUrl =
          latestVersionInfo?.windowsDownloadUrl ||
          latestVersionInfo?.windowsInstallerUrl ||
          'https://github.com/Pradeep28012010/WaveCraft/releases/latest/download/WaveCraft-Pro-Setup.exe';
        const link = document.createElement('a');
        link.href = winUrl;
        link.download = 'WaveCraft-Pro-Setup.exe';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        set({ status: 'available' });
        return;
      }

      // 4. Web Browser on Mobile or generic fallback
      const resolvedApkUrl = resolveApkDownloadUrl(latestVersionInfo?.downloadUrl);
      const link = document.createElement('a');
      link.href = resolvedApkUrl;
      link.download = 'WaveCraft.apk';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      set({ status: 'available' });
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

// Register native Android & Electron Windows callbacks safely on window
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

  // Electron Windows listeners
  if (window.electronAPI) {
    window.electronAPI.onUpdateProgress?.((percent: number) => {
      useUpdateStore.getState().setProgress(percent);
    });
    window.electronAPI.onUpdateStatus?.((status: string) => {
      const store = useUpdateStore.getState();
      if (status === 'installing') {
        store.setStatus('installing');
      } else if (status === 'downloading') {
        store.setStatus('downloading');
      }
    });
    window.electronAPI.onUpdateError?.((error: string) => {
      useUpdateStore.getState().setError(error);
    });
  }
}
