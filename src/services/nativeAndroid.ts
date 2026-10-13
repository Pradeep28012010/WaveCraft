import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { usePlayerStore } from '../stores/playerStore';
import { useStudioStore } from '../stores/studioStore';
import { useContextMenuStore } from '../stores/contextMenuStore';

/**
 * Returns true if the application is running inside the native Android APK wrapper.
 */
export const isAndroidNative = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

/**
 * Native Android subtle tactile haptic feedback for user interactions.
 */
export const triggerAndroidHaptic = async (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const style =
      type === 'heavy'
        ? ImpactStyle.Heavy
        : type === 'medium'
        ? ImpactStyle.Medium
        : ImpactStyle.Light;
    await Haptics.impact({ style });
  } catch {}
};

/**
 * Initializes native Android optimizations:
 * - Edge-to-edge transparent immersive status bar
 * - Intelligent Hardware Back Button handler (closes modals/panels first before navigating/minimizing)
 * - App State change audio continuity
 */
export const initNativeAndroid = (navigate?: (to: number) => void) => {
  if (!Capacitor.isNativePlatform()) return () => {};

  // 1. Native Status Bar setup (immersive edge-to-edge fullscreen)
  try {
    StatusBar.hide().catch(() => {});
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  } catch {}

  // 2. Hardware Back Button Navigation Stack
  const backListenerPromise = CapApp.addListener('backButton', () => {
    // Level 1: Close Context Menu if open
    if (useContextMenuStore.getState().isOpen) {
      useContextMenuStore.getState().closeMenu();
      return;
    }

    // Level 2: Close Studio FX Modal if open
    if (useStudioStore.getState().isStudioModalOpen) {
      useStudioStore.getState().setStudioModalOpen(false);
      return;
    }

    // Level 3: Close Queue Panel if open
    if (usePlayerStore.getState().isQueueOpen) {
      usePlayerStore.getState().setIsQueueOpen(false);
      return;
    }

    // Level 4: Close Fullscreen Now Playing if open
    if (usePlayerStore.getState().isNowPlayingOpen) {
      usePlayerStore.getState().setIsNowPlayingOpen(false);
      return;
    }

    // Level 5: Navigate back in history if not on root, otherwise minimize
    if (window.location.pathname !== '/' && navigate) {
      navigate(-1);
    } else {
      CapApp.minimizeApp();
    }
  });

  // 3. App state change background audio continuity
  const stateListenerPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      const state = usePlayerStore.getState();
      if (state.isPlaying && state.currentTrack) {
        updateAndroidPlaybackState(true, state.currentTime || 0, state.duration || 0);
      }
    }
  });

  return () => {
    backListenerPromise.then((handle) => handle.remove()).catch(() => {});
    stateListenerPromise.then((handle) => handle.remove()).catch(() => {});
  };
};

import { seekToTime } from './audioEngine';

declare global {
  interface Window {
    AndroidAudioBridge?: {
      startPlayback: (
        title: string,
        artist: string,
        thumbnail?: string,
        isPlaying?: boolean,
        positionSec?: number,
        durationSec?: number
      ) => void;
      updatePlaybackState?: (
        isPlaying: boolean,
        positionSec: number,
        durationSec: number
      ) => void;
      stopPlayback: () => void;
      fetchUrlNative?: (url: string) => string | null;
      getAppVersion?: () => string;
      getAppVersionCode?: () => number;
      canInstallPackages?: () => boolean;
      openInstallPermissionSettings?: () => void;
      downloadAndInstallUpdate?: (url: string) => void;
      triggerPendingInstall?: () => void;
    };
    __wavecraft_media_action?: (action: string) => void;
    __wavecraft_update_progress?: (percent: number) => void;
    __wavecraft_update_status?: (status: string) => void;
    __wavecraft_update_error?: (error: string) => void;
  }
}

/**
 * Fetches an external URL directly using Android native Java HttpURLConnection.
 * Completely bypasses browser CORS restrictions and avoids serverless proxy latencies on Android APK.
 */
export const fetchAndroidNativeUrl = (url: string): string | null => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.fetchUrlNative) {
    try {
      return window.AndroidAudioBridge.fetchUrlNative(url);
    } catch (e) {
      console.warn('Native URL fetch error:', e);
      return null;
    }
  }
  return null;
};

// Global media action bridge for native Android notification playback controls
if (typeof window !== 'undefined') {
  window.__wavecraft_media_action = (action: string) => {
    const store = usePlayerStore.getState();
    if (action === 'play_pause') {
      store.togglePlay();
    } else if (action === 'next') {
      store.nextTrack();
    } else if (action === 'prev') {
      store.prevTrack();
    } else if (action.startsWith('seek:')) {
      const time = parseFloat(action.replace('seek:', ''));
      if (!isNaN(time)) {
        store.seekTo(time);
        seekToTime(time);
      }
    }
  };
}

/**
 * Starts Android native Foreground Service with notification and WakeLock,
 * ensuring continuous audio streaming when app is minimized or screen is locked.
 */
export const startAndroidBackgroundAudio = (
  title: string,
  artist: string,
  thumbnail?: string,
  isPlaying: boolean = true,
  positionSec: number = 0,
  durationSec: number = 0
) => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.startPlayback) {
    try {
      window.AndroidAudioBridge.startPlayback(title, artist, thumbnail, isPlaying, positionSec, durationSec);
    } catch (e) {
      console.warn('Could not start Android foreground playback service:', e);
    }
  }
};

/**
 * Updates Android native PlaybackState and MediaSession with live position and duration
 * so phone lock screen and notification seekbars animate smoothly in real-time.
 */
export const updateAndroidPlaybackState = (
  isPlaying: boolean,
  positionSec: number,
  durationSec: number
) => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.updatePlaybackState) {
    try {
      window.AndroidAudioBridge.updatePlaybackState(isPlaying, positionSec, durationSec);
    } catch (e) {
      console.warn('Could not update Android playback state:', e);
    }
  }
};

/**
 * Stops Android native Foreground Service and releases WakeLock.
 */
export const stopAndroidBackgroundAudio = () => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.stopPlayback) {
    try {
      window.AndroidAudioBridge.stopPlayback();
    } catch (e) {
      console.warn('Could not stop Android foreground playback service:', e);
    }
  }
};

/**
 * Returns native app version string (e.g. "5.0.0") if running inside Android APK.
 */
export const getNativeAppVersion = (): string | null => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.getAppVersion) {
    try {
      return window.AndroidAudioBridge.getAppVersion();
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Returns true if the Android app has permission to install package updates.
 */
export const canNativeInstallPackages = (): boolean => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.canInstallPackages) {
    try {
      return window.AndroidAudioBridge.canInstallPackages();
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Opens system settings for user to toggle "Install Unknown Apps" permission.
 */
export const openNativeInstallSettings = (): void => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.openInstallPermissionSettings) {
    try {
      window.AndroidAudioBridge.openInstallPermissionSettings();
    } catch {}
  }
};

/**
 * Triggers background download of updated APK and launches package installer directly on completion.
 */
export const downloadAndInstallNativeUpdate = (apkUrl: string): boolean => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.downloadAndInstallUpdate) {
    try {
      window.AndroidAudioBridge.downloadAndInstallUpdate(apkUrl);
      return true;
    } catch (e) {
      console.warn('Failed to invoke native update installer:', e);
      return false;
    }
  }
  return false;
};

/**
 * Re-triggers installation for an already-downloaded update package.
 */
export const triggerNativePendingInstall = (): void => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.triggerPendingInstall) {
    try {
      window.AndroidAudioBridge.triggerPendingInstall();
    } catch {}
  }
};


