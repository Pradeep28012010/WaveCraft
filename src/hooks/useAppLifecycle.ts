import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLibraryStore } from '../stores/libraryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePlayerStore } from '../stores/playerStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useMediaSession } from './useMediaSession';
import { searchTracks } from '../services/youtube';
import { prewarmCoreRoutes } from '../utils/routePreloader';
import { initNativeAndroid } from '../services/nativeAndroid';
import { useUpdateStore } from '../stores/updateStore';

/**
 * Encapsulates global platform lifecycle hooks:
 * - Native Android hardware back button and immersive status bar
 * - Electron global media key IPC bindings
 * - IndexedDB store rehydration on mount
 * - Route chunk pre-warming & idle image preloading
 * - Shared WaveCard deep-link (?play=...) resolution
 * - OS MediaSession lockscreen controls & global keyboard shortcuts
 */
export function useAppLifecycle(): void {
  const navigate = useNavigate();
  const loadLibrary = useLibraryStore((s) => s.loadFromStorage);
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [searchParams, setSearchParams] = useSearchParams();
  const handledPlayParam = useRef<string | null>(null);

  // Initialize Native Android Hardware Back button & edge-to-edge status bar
  useEffect(() => {
    const cleanup = initNativeAndroid((step) => navigate(step));
    return cleanup;
  }, [navigate]);

  // Listen to global Windows media shortcuts from Electron main process
  useEffect(() => {
    if (window.electronAPI?.onMediaKey) {
      const cleanup = window.electronAPI.onMediaKey((action) => {
        const player = usePlayerStore.getState();
        if (action === 'togglePlay') player.togglePlay();
        else if (action === 'nextTrack') player.nextTrack();
        else if (action === 'prevTrack') player.prevTrack();
        else if (action === 'pause') player.pause();
        else if (action === 'toggleMute') player.toggleMute();
      });
      return cleanup;
    }
  }, []);

  // Initialize stores from IndexedDB on mount + pre-warm core route chunks during idle
  useEffect(() => {
    loadLibrary();
    loadSettings();

    // Pre-warm top navigation route chunks and fullscreen player during idle time
    prewarmCoreRoutes();
  }, [loadLibrary, loadSettings]);

  // Handle shared WaveCard deep-link (?play=Song+Artist)
  useEffect(() => {
    const playQuery = searchParams.get('play');
    if (playQuery && handledPlayParam.current !== playQuery) {
      handledPlayParam.current = playQuery;
      searchTracks(playQuery)
        .then((tracks) => {
          if (tracks.length > 0) {
            playTrack(tracks[0], tracks, 0);
          }
          const next = new URLSearchParams(searchParams);
          next.delete('play');
          setSearchParams(next, { replace: true });
        })
        .catch(() => {});
    }
  }, [searchParams, playTrack, setSearchParams]);

  // Global keyboard shortcuts
  useKeyboardShortcuts();

  // Hardware Media Keys & OS Lock Screen integration
  useMediaSession();

  // Background check for latest mobile app updates shortly after startup
  useEffect(() => {
    const timer = setTimeout(() => {
      useUpdateStore.getState().checkForUpdates(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
}
