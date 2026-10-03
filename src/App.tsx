import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import MainLayout from './components/layout/MainLayout';
import HomePage from './components/discover/HomePage';
import GenreBrowser from './components/search/GenreBrowser';
import { useLibraryStore } from './stores/libraryStore';
import { useSettingsStore } from './stores/settingsStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMediaSession } from './hooks/useMediaSession';

const SearchResults = lazy(() => import('./components/search/SearchResults'));
const LibraryPage = lazy(() => import('./components/library/LibraryPage'));
const LikedSongs = lazy(() => import('./components/library/LikedSongs'));
const RecentlyPlayed = lazy(() => import('./components/library/RecentlyPlayed'));
const PlaylistView = lazy(() => import('./components/library/PlaylistView'));
const StatsPage = lazy(() => import('./components/stats/StatsPage'));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-white/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  );
}

function AppContent() {
  const loadLibrary = useLibraryStore((s) => s.loadFromStorage);
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);

  // Initialize stores from IndexedDB on mount
  useEffect(() => {
    loadLibrary();
    loadSettings();
  }, [loadLibrary, loadSettings]);

  // Global keyboard shortcuts
  useKeyboardShortcuts();

  // Media Session API integration
  useMediaSession();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/genres" element={<GenreBrowser />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/liked" element={<LikedSongs />} />
          <Route path="/recent" element={<RecentlyPlayed />} />
          <Route path="/playlist/:id" element={<PlaylistView />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
