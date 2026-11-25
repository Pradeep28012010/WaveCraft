import { Component, Suspense, type ReactNode, type ErrorInfo } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Link } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';

import MainLayout from './components/layout/MainLayout';
import HomePage from './components/discover/HomePage';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { isAndroidNative, isElectronApp } from './services/apiConfig';

// Code-split route components with resilient network-failure retry
const GenreBrowser = lazyWithRetry(() => import('./components/search/GenreBrowser'));
const SearchResults = lazyWithRetry(() => import('./components/search/SearchResults'));
const LibraryPage = lazyWithRetry(() => import('./components/library/LibraryPage'));
const LikedSongs = lazyWithRetry(() => import('./components/library/LikedSongs'));
const RecentlyPlayed = lazyWithRetry(() => import('./components/library/RecentlyPlayed'));
const PlaylistView = lazyWithRetry(() => import('./components/library/PlaylistView'));
const StatsPage = lazyWithRetry(() => import('./components/stats/StatsPage'));
const SettingsPage = lazyWithRetry(() => import('./components/settings/SettingsPage'));
const JamRoomPage = lazyWithRetry(() => import('./components/jam/JamRoomPage'));
const SonicGalaxyPage = lazyWithRetry(() => import('./components/galaxy/SonicGalaxyPage'));
const LandingPage = lazyWithRetry(() => import('./components/landing/LandingPage'));
const DownloadsPage = lazyWithRetry(() => import('./components/library/DownloadsPage'));
const SetupPage = lazyWithRetry(() => import('./components/setup/SetupPage'));
const DownloadPage = lazyWithRetry(() => import('./components/download/DownloadPage'));

const shouldUseHashRouter =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' ||
    Boolean((window as unknown as { electronAPI?: unknown }).electronAPI) ||
    isElectronApp() ||
    isAndroidNative() ||
    (window.location.protocol === 'https:' && window.location.hostname === 'localhost'));

const RouterComponent = shouldUseHashRouter ? HashRouter : BrowserRouter;

interface StandaloneBoundaryState {
  hasError: boolean;
}

class StandaloneRouteErrorBoundary extends Component<
  { children: ReactNode },
  StandaloneBoundaryState
> {
  state: StandaloneBoundaryState = { hasError: false };

  static getDerivedStateFromError(): StandaloneBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Standalone route error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#06060b] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-3xl bg-white/[0.04] backdrop-blur-2xl text-center shadow-2xl space-y-4">
            <h1 className="text-xl font-black tracking-tight text-white">Unable to Load View</h1>
            <p className="text-sm text-white/60 leading-relaxed">
              This view encountered an unexpected error. You can retry or return to the main player.
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold text-white transition cursor-pointer"
              >
                Try Again
              </button>
              <Link
                to="/"
                className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#fa2d48] to-[#ff5b79] text-sm font-bold text-white shadow-lg shadow-rose-500/25 hover:opacity-90 transition"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  // Global lifecycle hooks: platform shortcuts, IndexedDB sync, media session, preloading
  useAppLifecycle();

  return (
    <Routes>
      {/* Standalone setup page — liquid glass custom installer window */}
      <Route
        path="/setup"
        element={
          <StandaloneRouteErrorBoundary>
            <Suspense
              fallback={
                <div className="fixed inset-0 bg-[#06060b] flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-white/15 border-t-[#fa2d48] rounded-full animate-spin" />
                </div>
              }
            >
              <SetupPage />
            </Suspense>
          </StandaloneRouteErrorBoundary>
        }
      />

      {/* Standalone landing page — no sidebar, topbar, or player chrome */}
      <Route
        path="/welcome"
        element={
          <StandaloneRouteErrorBoundary>
            <Suspense
              fallback={
                <div className="fixed inset-0 bg-[#050508] flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-white/15 border-t-[#fa2d48] rounded-full animate-spin" />
                </div>
              }
            >
              <LandingPage />
            </Suspense>
          </StandaloneRouteErrorBoundary>
        }
      />

      {/* Main App Routes — wrapped in layout with sidebar, topbar, player */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
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
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/get-app" element={<DownloadPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <MotionConfig reducedMotion="user">
        <RouterComponent>
          <AppContent />
        </RouterComponent>
      </MotionConfig>
    </AppErrorBoundary>
  );
}
