import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLibraryStore } from '../stores/libraryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePlayerStore } from '../stores/playerStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useMediaSession } from './useMediaSession';
import { searchTracks, getTrending } from '../services/youtube';
import { getNewReleases } from '../services/itunes';
import { preloadTrackArtworks, preloadAlbumCovers, preloadImages } from '../utils/imagePreloader';
import { FEATURED_ARTISTS, FALLBACK_TRENDING_TRACKS } from '../utils/constants';
import { initNativeAndroid } from '../services/nativeAndroid';

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

  // Initialize stores from IndexedDB on mount + eagerly pre-warm data & artworks before scroll
  useEffect(() => {
    loadLibrary();
    loadSettings();

    // Immediately pre-cache fallback artwork and featured artist images into browser memory
    preloadTrackArtworks(FALLBACK_TRENDING_TRACKS);
    preloadImages(FEATURED_ARTISTS.map((a) => a.avatar));

    // Immediately fetch and pre-cache live trending tracks & new releases before user scrolls
    getTrending('global')
      .then((tracks) => preloadTrackArtworks(tracks))
      .catch(() => {});

    getNewReleases()
      .then((releases) => preloadAlbumCovers(releases))
      .catch(() => {});

    // Pre-warm core navigation route chunks
    const prewarmRoutes = () => {
      import('../components/library/LibraryPage').catch(() => {});
      import('../components/search/SearchResults').catch(() => {});
      import('../components/library/LikedSongs').catch(() => {});
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(prewarmRoutes, { timeout: 1500 });
      return () => {
        if ('cancelIdleCallback' in window) {
          (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(id);
        }
      };
    } else {
      const timer = setTimeout(prewarmRoutes, 600);
      return () => clearTimeout(timer);
    }
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
}
