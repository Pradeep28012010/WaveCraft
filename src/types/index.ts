export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  thumbnail: string;
  thumbnailLarge: string;
  thumbnailUrl?: string; // alias for compatibility
  youtubeId?: string;
  audioUrl?: string; // Direct 320kbps AAC/MP4 stream URL when available
  audioPreviewUrl?: string;
  encryptedMediaUrl?: string;
  genre?: string;
  year?: number;
  quality?: string;
  fileSizeBytes?: number;
}

export interface PlaylistFolder {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isCollapsed?: boolean;
  createdAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverImage?: string;
  coverUrl?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
  isSmartPlaylist?: boolean;
  folderId?: string;
  folder?: string;
  tags?: string[];
  isPinned?: boolean;
  // Live Auto-Sync Playlist fields
  isLiveSync?: boolean;
  sourceUrl?: string;
  sourcePlatform?: string;
  syncStrategy?: 'append' | 'mirror';
  syncIntervalMinutes?: number;
  lastSyncedAt?: number;
  lastSyncDelta?: number;
  remoteFingerprints?: string[];
}

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number; // 0-100
  currentTime: number; // seconds
  duration: number;
  volume: number; // 0-1
  isMuted: boolean;
  repeatMode: 'off' | 'one' | 'all';
  isShuffled: boolean;
  queue: Track[];
  originalQueue: Track[];
  queueIndex: number;
  crossfadeDuration: number;
  playbackSpeed: number;
  isLoading: boolean;
}

export interface LibraryState {
  likedSongs: Track[];
  playlists: Playlist[];
  folders: PlaylistFolder[];
  recentlyPlayed: { track: Track; playedAt: number }[];
  playHistory: { trackId: string; title?: string; artist?: string; playedAt: number; duration: number }[];
  isLoading?: boolean;
}

export interface SettingsState {
  theme: 'dark' | 'light' | 'auto';
  accentColor: string;
  dynamicAmbientGlow: boolean;
  ambientGlowIntensity: 'subtle' | 'vibrant' | 'aurora';
  crossfadeDuration: number;
  audioQuality: 'auto' | 'high' | 'medium' | 'low';
  showVisualizer: boolean;
  visualizerStyle: 'bars' | 'wave' | 'blob' | 'circular' | 'particles' | 'nebula' | 'starfield';
  equalizerPreset: string;
  equalizerBands: number[];
  autoplay: boolean;
  showLyrics: boolean;
  language: string;
}

export interface SearchResult {
  tracks: Track[];
  artists: ArtistResult[];
  albums: AlbumResult[];
}

export interface ArtistResult {
  id: string;
  name: string;
  thumbnail: string;
  imageUrl?: string;
  genre?: string;
  youtubeChannelId?: string;
}

export interface AlbumResult {
  id: string;
  name: string;
  title: string;
  artist: string;
  thumbnail: string;
  coverUrl: string;
  coverArt?: string;
  year?: number;
  trackCount?: number;
  collectionId?: number;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface StatsData {
  totalListeningTime: number;
  topTracks: { track: Track; playCount: number }[];
  topArtists: { name: string; playCount: number; totalTime: number }[];
  dailyListening: { date: string; minutes: number }[];
  genreDistribution: { genre: string; count: number }[];
}

export interface AmbientPalette {
  primary: string;         // Vibrant dominant color
  secondary: string;       // Harmonic companion color
  tertiary: string;        // Deep ambient tone
  accent: string;          // High-energy highlight
  backgroundDark: string;  // Deep dark base tint
  gradientCss: string;     // Multi-point radial gradient
  glowCss: string;         // Diffusion box-shadow
  isDynamic: boolean;      // True if extracted from artwork
}

export interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange?: (callback: (isMax: boolean) => void) => () => void;
  onMaximizedChange: (callback: (isMax: boolean) => void) => () => void;
  onMediaKey?: (callback: (action: string) => void) => () => void;
  updateTrack: (track: { title: string; artist: string }) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
