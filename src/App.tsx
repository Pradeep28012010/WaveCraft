import { Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';

import MainLayout from './components/layout/MainLayout';
import HomePage from './components/discover/HomePage';
import GenreBrowser from './components/search/GenreBrowser';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { useAppLifecycle } from './hooks/useAppLifecycle';

// Code-split route components with resilient network-failure retry
const SearchResults = lazyWithRetry(() => import('./components/search/SearchResults'));
const LibraryPage = lazyWithRetry(() => import('./components/library/LibraryPage'));
const LikedSongs = lazyWithRetry(() => import('./components/library/LikedSongs'));
const RecentlyPlayed = lazyWithRetry(() => import('./components/library/RecentlyPlayed'));
const PlaylistView = lazyWithRetry(() => import('./components/library/PlaylistView'));
const StatsPage = lazyWithRetry(() => import('./components/stats/StatsPage'));
const SettingsPage = lazyWithRetry(() => import('./components/settings/SettingsPage'));
const VibeDJPage = lazyWithRetry(() => import('./components/vibe/VibeDJPage'));
const JamRoomPage = lazyWithRetry(() => import('./components/jam/JamRoomPage'));
const DJConsolePage = lazyWithRetry(() => import('./components/dj/DJConsolePage'));
const SonicGalaxyPage = lazyWithRetry(() => import('./components/galaxy/SonicGalaxyPage'));
const LandingPage = lazyWithRetry(() => import('./components/landing/LandingPage'));
const DownloadsPage = lazyWithRetry(() => import('./components/library/DownloadsPage'));
const SetupPage = lazyWithRetry(() => import('./components/setup/SetupPage'));

const isElectronOrFile =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || Boolean(window.electronAPI));

const RouterComponent = isElectronOrFile ? HashRouter : BrowserRouter;

function AppContent() {
  // Global lifecycle hooks: platform shortcuts, IndexedDB sync, media session, preloading
  useAppLifecycle();

  return (
    <Routes>
      {/* Standalone setup page — liquid glass custom installer window */}
      <Route
        path="/setup"
        element={
          <Suspense
            fallback={
              <div className="fixed inset-0 bg-[#06060b] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/15 border-t-[#fa2d48] rounded-full animate-spin" />
              </div>
            }
          >
            <SetupPage />
          </Suspense>
        }
      />

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
