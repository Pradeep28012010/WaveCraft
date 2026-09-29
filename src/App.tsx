import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { MotionConfig } from 'framer-motion';
import MainLayout from './components/layout/MainLayout';
import HomePage from './components/discover/HomePage';
import GenreBrowser from './components/search/GenreBrowser';
import SearchResults from './components/search/SearchResults';
import LibraryPage from './components/library/LibraryPage';
import LikedSongs from './components/library/LikedSongs';
import RecentlyPlayed from './components/library/RecentlyPlayed';
import PlaylistView from './components/library/PlaylistView';
import StatsPage from './components/stats/StatsPage';
import SettingsPage from './components/settings/SettingsPage';
import VibeDJPage from './components/vibe/VibeDJPage';
import JamRoomPage from './components/jam/JamRoomPage';
import DJConsolePage from './components/dj/DJConsolePage';
import SonicGalaxyPage from './components/galaxy/SonicGalaxyPage';
import { useLibraryStore } from './stores/libraryStore';
import { useSettingsStore } from './stores/settingsStore';
import { usePlayerStore } from './stores/playerStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMediaSession } from './hooks/useMediaSession';
import { searchTracks } from './services/youtube';

function AppContent() {
  const loadLibrary = useLibraryStore((s) => s.loadFromStorage);
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [searchParams, setSearchParams] = useSearchParams();
  const handledPlayParam = useRef<string | null>(null);

  // Initialize stores from IndexedDB on mount
  useEffect(() => {
    loadLibrary();
    loadSettings();
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
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/vibe" element={<VibeDJPage />} />
        <Route path="/dj" element={<DJConsolePage />} />
        <Route path="/galaxy" element={<SonicGalaxyPage />} />
        <Route path="/jam" element={<JamRoomPage />} />
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
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="never">
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </MotionConfig>
  );
}
