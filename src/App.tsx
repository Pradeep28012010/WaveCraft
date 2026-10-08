import { BrowserRouter, HashRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { Component, Suspense, useEffect, useRef, lazy, type ReactNode, type ErrorInfo } from 'react';
import { MotionConfig } from 'framer-motion';
import MainLayout from './components/layout/MainLayout';
import HomePage from './components/discover/HomePage';
import GenreBrowser from './components/search/GenreBrowser';
import { useLibraryStore } from './stores/libraryStore';
import { useSettingsStore } from './stores/settingsStore';
import { usePlayerStore } from './stores/playerStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMediaSession } from './hooks/useMediaSession';
import { searchTracks, getTrending } from './services/youtube';
import { initNativeAndroid } from './services/nativeAndroid';

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Root application crash caught by AppErrorBoundary:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#06060b] text-white flex items-center justify-center p-6 z-[999999]">
          <div className="max-w-md w-full p-8 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-2xl text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-2xl">
              🎵
            </div>
            <h1 className="text-xl font-black tracking-tight text-white">WaveCraft Recovered</h1>
            <p className="text-sm text-white/60 leading-relaxed">
              An unexpected render issue occurred. Your saved playlists and audio settings remain safe.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full py-3 rounded-full bg-gradient-to-r from-[#fa2d48] to-[#ff5b79] text-white font-bold text-sm shadow-lg shadow-rose-500/25 hover:opacity-90 active:scale-[0.98] transition cursor-pointer"
            >
              Relaunch WaveCraft
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SearchResults = lazy(() => import('./components/search/SearchResults'));
const LibraryPage = lazy(() => import('./components/library/LibraryPage'));
const LikedSongs = lazy(() => import('./components/library/LikedSongs'));
const RecentlyPlayed = lazy(() => import('./components/library/RecentlyPlayed'));
const PlaylistView = lazy(() => import('./components/library/PlaylistView'));
const StatsPage = lazy(() => import('./components/stats/StatsPage'));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));
const VibeDJPage = lazy(() => import('./components/vibe/VibeDJPage'));
const JamRoomPage = lazy(() => import('./components/jam/JamRoomPage'));
const DJConsolePage = lazy(() => import('./components/dj/DJConsolePage'));
const SonicGalaxyPage = lazy(() => import('./components/galaxy/SonicGalaxyPage'));
const LandingPage = lazy(() => import('./components/landing/LandingPage'));
const DownloadsPage = lazy(() => import('./components/library/DownloadsPage'));

const isElectronOrFile =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || Boolean(window.electronAPI));

const RouterComponent = isElectronOrFile ? HashRouter : BrowserRouter;

function AppContent() {
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

  // Initialize stores from IndexedDB on mount + idle pre-warm route chunks & trending feed
  useEffect(() => {
    loadLibrary();
    loadSettings();

    const prewarm = () => {
      getTrending().catch(() => {});
      // Pre-warm only lightweight core navigation pages to avoid mobile GC spikes
      import('./components/library/LibraryPage').catch(() => {});
      import('./components/search/SearchResults').catch(() => {});
      import('./components/library/LikedSongs').catch(() => {});
    };

    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(prewarm, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    } else {
      const timer = setTimeout(prewarm, 1200);
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

  return (
    <Routes>
      {/* Standalone landing page — no sidebar, topbar, or player chrome */}
      <Route
        path="/welcome"
        element={
          <Suspense
            fallback={
              <div className="fixed inset-0 bg-[#050508] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/15 border-t-[#fa2d48] rounded-full animate-spin" />
              </div>
            }
          >
            <LandingPage />
          </Suspense>
        }
      />

      {/* Main App Routes — wrapped in layout with sidebar, topbar, player */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/vibe" element={<VibeDJPage />} />
        <Route path="/dj" element={<DJConsolePage />} />
        <Route path="/galaxy" element={<SonicGalaxyPage />} />
        <Route path="/jam" element={<JamRoomPage />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/genres" element={<GenreBrowser />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/liked" element={<LikedSongs />} />
        <Route path="/recent" element={<RecentlyPlayed />} />
        <Route path="/playlist/:id" element={<PlaylistView />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <MotionConfig reducedMotion="never">
        <RouterComponent>
          <AppContent />
        </RouterComponent>
      </MotionConfig>
    </AppErrorBoundary>
  );
}
