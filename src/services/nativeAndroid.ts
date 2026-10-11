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

  // 1. Native Status Bar setup (non-overlapping, matching deep pitch-black theme)
  try {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#06060b' }).catch(() => {});
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
        startAndroidBackgroundAudio(
          state.currentTrack.title,
          state.currentTrack.artist,
          state.currentTrack.thumbnailLarge || state.currentTrack.thumbnail,
          true
        );
      }
    }
  });

  return () => {
    backListenerPromise.then((handle) => handle.remove()).catch(() => {});
    stateListenerPromise.then((handle) => handle.remove()).catch(() => {});
  };
};

declare global {
  interface Window {
    AndroidAudioBridge?: {
      startPlayback: (
        title: string,
        artist: string,
        thumbnail?: string,
        isPlaying?: boolean
      ) => void;
      stopPlayback: () => void;
    };
    __wavecraft_media_action?: (action: string) => void;
  }
}

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
  isPlaying: boolean = true
) => {
  if (typeof window !== 'undefined' && window.AndroidAudioBridge?.startPlayback) {
    try {
      window.AndroidAudioBridge.startPlayback(title, artist, thumbnail, isPlaying);
    } catch (e) {
      console.warn('Could not start Android foreground playback service:', e);
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

