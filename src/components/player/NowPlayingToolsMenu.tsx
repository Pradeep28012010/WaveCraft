import { useState, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Track, VisualizerStyle } from '../../types';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useStudioStore, STUDIO_FX_MODES, type StudioFXMode } from '../../stores/studioStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { getShareBaseUrl } from '../../services/apiConfig';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

export const VISUALIZER_MODES: Array<{ id: VisualizerStyle; label: string }> = [
  { id: 'cyber-mesh', label: '3D Cyber Mesh' },
  { id: 'nebula', label: '3D Cosmic Nebula' },
  { id: 'quantum-tunnel', label: 'Quantum Tunnel' },
  { id: 'solar-flare', label: 'Solar Pulsar' },
  { id: 'kaleidoscope', label: 'Mandala Prism' },
  { id: 'matrix-rain', label: 'Matrix Rain' },
  { id: 'laser-oscilloscope', label: 'Laser Scope' },
  { id: 'analog-vu', label: 'Analog VU Meter' },
  { id: 'starfield', label: '3D Starfield' },
  { id: 'particles', label: 'Bio Orbs' },
  { id: 'circular', label: 'Radial Halo' },
  { id: 'blob', label: 'Liquid Blob' },
  { id: 'bars', label: 'Studio Bars' },
  { id: 'wave', label: 'Harmonic Wave' }
];

export interface NowPlayingToolsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: Track | null;
  isLiked: boolean;
  toggleLike: (track: Track) => void;
  trackIsOffline: boolean;
  isSavingOffline: boolean;
  toggleOfflineTrack: (track: Track) => Promise<void>;
  isChorusPreviewActive: (trackId?: string) => boolean;
  toggleChorusPreview: (track: Track) => void;
  isAmbientActive: boolean;
  fxMode: StudioFXMode;
  setStudioModalOpen: (open: boolean) => void;
  setShowWaveCard: (show: boolean) => void;
  setWaveCardQuote: (quote: string) => void;
  showVisualizer: boolean;
  setShowVisualizer: (show: boolean) => void;
  visualizerStyle: VisualizerStyle;
  setVisualizerStyle: (style: VisualizerStyle) => void;
  zenMode: boolean;
  setZenMode: (zen: boolean) => void;
  setNightstandOpen: (open: boolean) => void;
  sleepActive: boolean;
  sleepRemaining: number;
  sleepEndAtTrack: boolean;
  startSleepTimer: (min: number) => void;
  setEndAtTrack: (end: boolean) => void;
  stopSleepTimer: () => void;
  audioQuality: 'auto' | 'high' | 'medium' | 'low';
  setAudioQuality: (q: 'auto' | 'high' | 'medium' | 'low') => void;
  preservePitch: boolean;
  setPreservePitch: (p: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
}

export const NowPlayingToolsMenu = memo(function NowPlayingToolsMenu({
  isOpen,
  onClose,
  currentTrack,
  isLiked,
  toggleLike,
  trackIsOffline,
  isSavingOffline,
  toggleOfflineTrack,
  isChorusPreviewActive,
  toggleChorusPreview,
  isAmbientActive,
  fxMode,
  setStudioModalOpen,
  setShowWaveCard,
  setWaveCardQuote,
  showVisualizer,
  setShowVisualizer,
  visualizerStyle,
  setVisualizerStyle,
  zenMode,
  setZenMode,
  setNightstandOpen,
  sleepActive,
  sleepRemaining,
  sleepEndAtTrack,
  startSleepTimer,
  setEndAtTrack,
  stopSleepTimer,
  audioQuality,
  setAudioQuality,
  preservePitch,
  setPreservePitch,
  playbackSpeed,
  setPlaybackSpeed
}: NowPlayingToolsMenuProps) {
  const playlists = useLibraryStore((s) => s.playlists);
  const equalizerPreset = useSettingsStore((s) => s.equalizerPreset);
  const [toolsTab, setToolsTab] = useState<'track' | 'studio' | 'playback' | 'playlist'>('track');
  const [toolsToast, setToolsToast] = useState<string | null>(null);
  const [isCreatingInTools, setIsCreatingInTools] = useState(false);
  const [newPlaylistTitleInTools, setNewPlaylistTitleInTools] = useState('');
  const [toolsPlaylistSearch, setToolsPlaylistSearch] = useState('');
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToolsToast = (msg: string) => {
    setToolsToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToolsToast(null), 2200);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.92, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, scale: 0.95, filter: 'blur(8px)' }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="absolute right-0 top-12 w-[min(19rem,calc(100vw-2rem))] max-h-[82vh] overflow-y-auto no-scrollbar rounded-[22px] border-0 glass-bloom-menu p-2 z-50 text-xs shadow-[0_24px_50px_rgba(0,0,0,0.7)] flex flex-col gap-1"
        >
          {/* Feedback Toast */}
          {toolsToast && (
            <div className="px-3 py-1.5 mb-1 rounded-xl bg-[var(--color-accent)]/25 border-0 text-[11px] font-bold text-white text-center animate-pulse">
              ✓ {toolsToast}
            </div>
          )}

          {toolsTab === 'playlist' ? (
            /* INTEGRATED PLAYLIST PICKER IN FULLSCREEN PLAYER */
            <div className="flex flex-col gap-2 p-0.5">
              {/* Top nav bar */}
              <div className="flex items-center justify-between pb-1.5 border-0 px-1">
                <button
                  type="button"
                  onClick={() => setToolsTab('track')}
                  className="flex items-center gap-1 text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  <span>Back</span>
                </button>

                <span className="text-xs font-bold text-white">Add to Playlist</span>

                <button
                  type="button"
                  onClick={() => setIsCreatingInTools((prev) => !prev)}
                  className="text-xs font-bold text-[var(--color-accent)] hover:text-white px-2 py-0.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {isCreatingInTools ? 'Cancel' : '+ New'}
                </button>
              </div>

              {/* Create new playlist input */}
              {isCreatingInTools && (
                <div className="p-2 rounded-xl bg-white/[0.08] border-0 flex flex-col gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={newPlaylistTitleInTools}
                    onChange={(e) => setNewPlaylistTitleInTools(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newPlaylistTitleInTools.trim() && currentTrack) {
                        const pl = useLibraryStore.getState().createPlaylist(newPlaylistTitleInTools.trim());
                        useLibraryStore.getState().addToPlaylist(pl.id, currentTrack);
                        setNewPlaylistTitleInTools('');
                        setIsCreatingInTools(false);
                        showToolsToast(`Created & added to "${pl.name}"`);
                      }
                      if (e.key === 'Escape') setIsCreatingInTools(false);
                    }}
                    placeholder="Playlist name..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border-0 text-white text-xs outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder:text-white/40"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsCreatingInTools(false)}
                      className="px-2.5 py-1 rounded-lg text-[11px] text-white/60 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (newPlaylistTitleInTools.trim() && currentTrack) {
                          const pl = useLibraryStore.getState().createPlaylist(newPlaylistTitleInTools.trim());
                          useLibraryStore.getState().addToPlaylist(pl.id, currentTrack);
                          setNewPlaylistTitleInTools('');
                          setIsCreatingInTools(false);
                          showToolsToast(`Created & added to "${pl.name}"`);
                        }
                      }}
                      className="px-3 py-1 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-bold shadow-sm cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                    >
                      Create & Add
                    </button>
                  </div>
                </div>
              )}

              {/* Filter input */}
              {playlists.length > 3 && (
                <div className="relative px-0.5">
                  <input
                    type="text"
                    value={toolsPlaylistSearch}
                    onChange={(e) => setToolsPlaylistSearch(e.target.value)}
                    placeholder="Find playlist..."
                    className="w-full px-2.5 py-1.5 pl-7 rounded-xl bg-white/[0.06] border-0 text-white text-xs outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder:text-white/40"
                  />
                  <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-white/40 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
              )}

              {/* Playlists list */}
              <div className="max-h-[260px] overflow-y-auto no-scrollbar flex flex-col gap-1 pr-0.5">
                {playlists
                  .filter((p) => !toolsPlaylistSearch.trim() || p.name.toLowerCase().includes(toolsPlaylistSearch.toLowerCase()))
                  .map((pl) => {
                    const alreadyHasTrack = Boolean(currentTrack && Array.isArray(pl.tracks) && pl.tracks.some((t) => t.id === currentTrack.id));
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => {
                          if (currentTrack) {
                            triggerAndroidHaptic('light');
                            useLibraryStore.getState().addToPlaylist(pl.id, currentTrack);
                            showToolsToast(`Added to "${pl.name}"`);
                          }
                        }}
                        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.12] active:bg-white/[0.18] transition-all text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg overflow-hidden bg-white/10 border-0 flex-shrink-0 flex items-center justify-center">
                            {pl.coverUrl ? (
                              <img src={pl.coverUrl} alt={pl.name} className="w-full h-full object-cover" />
                            ) : (
                              <svg className="w-3.5 h-3.5 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="16" y2="18" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white group-hover:text-[var(--color-accent)] truncate">
                              {pl.name}
                            </p>
                            <p className="text-[10px] text-white/50 tabular-nums">
                              {pl.tracks?.length || 0} songs
                            </p>
                          </div>
                        </div>

                        {alreadyHasTrack ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border-0 px-2 py-0.5 rounded-full flex-shrink-0">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Added</span>
                          </span>
                        ) : (
                          <span className="text-xs text-white/30 group-hover:text-white/80 transition-colors flex-shrink-0">
                            + Add
                          </span>
                        )}
                      </button>
                    );
                  })}

                {playlists.length === 0 && (
                  <p className="text-[11px] text-white/40 py-4 text-center">No playlists created yet</p>
                )}
              </div>
            </div>
          ) : (
            /* MAIN TOOLS MENU */
            <>
              {/* Track Header Card */}
              {currentTrack && (
                <div className="flex items-center gap-2.5 p-2 mb-1 rounded-xl liquid-glass border-0">
                  <img
                    src={currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                    alt={currentTrack.title}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0 shadow-sm border-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-white text-xs truncate leading-tight">
                      {currentTrack.title}
                    </p>
                    <p className="text-[10px] text-white/60 truncate leading-tight mt-0.5">
                      {currentTrack.artist}
                    </p>
                  </div>
                </div>
              )}

              {/* 3-Tab Category Switcher: Track | Studio | Playback */}
              <div className="grid grid-cols-3 gap-1 p-1 rounded-full liquid-glass border-0 relative mb-1">
                {(['track', 'studio', 'playback'] as const).map((tab) => {
                  const isActiveTab = toolsTab === tab;
                  const label = tab === 'track' ? 'Track' : tab === 'studio' ? 'Studio' : 'Playback';
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setToolsTab(tab);
                      }}
                      className="relative py-1.5 rounded-full text-[11px] font-bold cursor-pointer select-none flex items-center justify-center"
                    >
                      {isActiveTab && (
                        <motion.div
                          layoutId="tools-menu-tab-pill"
                          transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                          className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                        />
                      )}
                      <span
                        className={`relative z-10 transition-colors duration-150 ${
                          isActiveTab
                            ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: TRACK ACTIONS */}
              {toolsTab === 'track' && (
              <div className="flex flex-col gap-0.5">
                {/* Add to Playlist */}
                <button
                  type="button"
                  onClick={() => setToolsTab('playlist')}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="16" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    <span className="font-semibold">Add to Playlist</span>
                  </div>
                  <svg className="w-3.5 h-3.5 text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* Play Next in Queue */}
                <button
                  type="button"
                  onClick={() => {
                    if (currentTrack) {
                      usePlayerStore.getState().addNext(currentTrack);
                      showToolsToast('Queued to play next');
                    }
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 4l10 8-10 8V4z" />
                      <line x1="19" y1="5" x2="19" y2="19" />
                    </svg>
                    <span className="font-semibold">Play Next in Queue</span>
                  </div>
                </button>

                {/* Add to End of Queue */}
                <button
                  type="button"
                  onClick={() => {
                    if (currentTrack) {
                      usePlayerStore.getState().addToQueue(currentTrack);
                      showToolsToast('Added to end of queue');
                    }
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span className="font-semibold">Add to End of Queue</span>
                  </div>
                </button>

                {/* Like / Favorite */}
                <button
                  type="button"
                  onClick={() => {
                    if (currentTrack) {
                      toggleLike(currentTrack);
                      showToolsToast(isLiked ? 'Removed from Liked' : 'Saved to Liked');
                    }
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {isLiked ? (
                      <svg className="w-4 h-4 text-rose-500 fill-current" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                    )}
                    <span className="font-semibold">{isLiked ? 'Liked Song' : 'Save to Liked Songs'}</span>
                  </div>
                </button>

                {/* 15s Chorus Preview */}
                <button
                  type="button"
                  onClick={() => {
                    if (currentTrack) {
                      toggleChorusPreview(currentTrack);
                      onClose();
                    }
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-amber-400 font-bold text-sm">⚡</span>
                    <span className="font-semibold">
                      {isChorusPreviewActive(currentTrack?.id) ? 'Stop 15s Chorus' : '15s Chorus Drop Preview'}
                    </span>
                  </div>
                </button>

                {/* Save to Offline Vault */}
                <button
                  type="button"
                  onClick={async () => {
                    if (currentTrack) {
                      await toggleOfflineTrack(currentTrack);
                      showToolsToast(trackIsOffline ? 'Removed from Vault' : 'Saved to Offline Vault');
                    }
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {trackIsOffline ? (
                      <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                    <span className="font-semibold">{trackIsOffline ? 'In Offline Vault' : 'Download to Offline Vault'}</span>
                  </div>
                  <span className="text-[10px] text-white/40">{isSavingOffline ? 'Saving...' : '320kbps'}</span>
                </button>

                {/* Share Song */}
                <button
                  type="button"
                  onClick={async () => {
                    if (!currentTrack) return;
                    triggerAndroidHaptic('light');
                    const shareText = `🎵 Listen to "${currentTrack.title}" by ${currentTrack.artist} on WaveCraft`;
                    const shareUrl = `${getShareBaseUrl()}/?track=${encodeURIComponent(currentTrack.title)}`;
                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: `${currentTrack.title} - ${currentTrack.artist}`,
                          text: shareText,
                          url: shareUrl
                        });
                      } else if (navigator.clipboard) {
                        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                        showToolsToast('Link copied to clipboard!');
                      }
                    } catch {
                      // User cancelled or clipboard fallback
                    }
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    <span className="font-semibold">Share / Copy Link</span>
                  </div>
                </button>

                {/* Generate Poster */}
                <button
                  type="button"
                  onClick={() => {
                    setWaveCardQuote('');
                    setShowWaveCard(true);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="font-semibold">Generate Story Poster</span>
                  </div>
                  <span className="text-[10px] text-white/45">Visual</span>
                </button>
              </div>
              )}

              {/* TAB 2: STUDIO & VISUALIZER */}
              {toolsTab === 'studio' && (
              <div className="flex flex-col gap-0.5">
                {/* Atmosphere Soundscapes */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    onClose();
                    useStudioStore.getState().openStudioWithTab('atmosphere');
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">🌧️</span>
                    <span className="font-medium">Atmosphere Mixer</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      isAmbientActive
                        ? 'glass-button-emerald text-emerald-200'
                        : 'glass-button text-white/50'
                    }`}
                  >
                    {isAmbientActive ? 'Active' : 'Off'}
                  </span>
                </button>

                {/* Studio FX & EQ */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setStudioModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[var(--color-accent)] font-bold">🎛️</span>
                    <span className="font-medium">Studio FX & EQ</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full glass-button text-[10px] font-semibold text-white/80">
                    {fxMode !== 'normal'
                      ? STUDIO_FX_MODES.find((m) => m.id === fxMode)?.name || 'Custom'
                      : equalizerPreset && equalizerPreset !== 'Flat'
                        ? equalizerPreset
                        : 'Default'}
                  </span>
                </button>

                {/* Visualizer Mode */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    if (!showVisualizer) {
                      setShowVisualizer(true);
                      setVisualizerStyle(VISUALIZER_MODES[0].id);
                      return;
                    }
                    const idx = VISUALIZER_MODES.findIndex((m) => m.id === visualizerStyle);
                    if (idx === -1) {
                      setVisualizerStyle(VISUALIZER_MODES[0].id);
                    } else if (idx === VISUALIZER_MODES.length - 1) {
                      setShowVisualizer(false);
                    } else {
                      const next = VISUALIZER_MODES[idx + 1];
                      if (next) setVisualizerStyle(next.id);
                    }
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 9v6M22 12h-2" />
                    </svg>
                    <span className="font-medium">Visualizer Mode</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    showVisualizer ? 'glass-button-cyan text-cyan-200' : 'glass-button text-white/50'
                  }`}>
                    {showVisualizer
                      ? (VISUALIZER_MODES.find((m) => m.id === visualizerStyle)?.label || '3D Cyber Mesh')
                      : 'Off'}
                  </span>
                </button>

                {/* Interactive Visualizer Mode Chips */}
                {showVisualizer && (
                  <div className="grid grid-cols-2 gap-1 p-1.5 rounded-2xl liquid-glass border-0 my-1 relative overflow-visible">
                    {VISUALIZER_MODES.map((m) => {
                      const isSel = visualizerStyle === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerAndroidHaptic('light');
                            setVisualizerStyle(m.id);
                          }}
                          className="relative px-2 py-1.5 rounded-xl text-[10px] font-bold text-center cursor-pointer select-none flex items-center justify-center"
                        >
                          {isSel && (
                            <motion.div
                              layoutId="visualizer-mode-pill"
                              transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                              className="absolute inset-0 rounded-xl liquid-sliding-pill -z-0 pointer-events-none"
                            />
                          )}
                          <span
                            className={`relative z-10 transition-colors duration-150 truncate ${
                              isSel
                                ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 3D Zen Mode */}
                <button
                  type="button"
                  onClick={() => {
                    const nextZen = !zenMode;
                    setZenMode(nextZen);
                    if (nextZen) setShowVisualizer(true);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">🧘</span>
                    <span className="font-medium">3D Zen Mode</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    zenMode ? 'glass-button-primary text-white' : 'glass-button text-white/60'
                  }`}>
                    {zenMode ? 'Active' : 'Off'}
                  </span>
                </button>

                {/* Smart DJ Console & Automix */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    onClose();
                    useStudioStore.getState().setSmartDJOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">🎧</span>
                    <span className="font-medium">Smart DJ Console</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold glass-button text-rose-300">
                    BPM & Key
                  </span>
                </button>

                {/* Bedside Nightstand Mode */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    onClose();
                    setNightstandOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">🌙</span>
                    <span className="font-medium">Nightstand Mode</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold glass-button text-purple-200">
                    OLED Clock
                  </span>
                </button>
              </div>
              )}

              {/* TAB 3: PLAYBACK SETTINGS */}
              {toolsTab === 'playback' && (
              <div className="flex flex-col gap-0.5">
                {/* Sleep Timer */}
                <button
                  type="button"
                  onClick={() => {
                    if (!sleepActive) {
                      startSleepTimer(30);
                    } else if (sleepRemaining > 15 * 60) {
                      startSleepTimer(15);
                    } else if (!sleepEndAtTrack) {
                      setEndAtTrack(true);
                    } else {
                      stopSleepTimer();
                    }
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">🌙</span>
                    <span className="font-medium">Sleep Timer</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    sleepActive ? 'glass-button-purple text-purple-200' : 'glass-button text-white/60'
                  }`}>
                    {sleepActive ? (sleepEndAtTrack ? 'End of Song' : `${Math.ceil(sleepRemaining / 60)}m`) : 'Off'}
                  </span>
                </button>

                {/* Audio Quality */}
                <button
                  type="button"
                  onClick={() => {
                    const qualities: Array<'auto' | 'high' | 'medium' | 'low'> = ['auto', 'high', 'medium', 'low'];
                    const nextQ = qualities[(qualities.indexOf(audioQuality) + 1) % qualities.length] || 'auto';
                    setAudioQuality(nextQ);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    <span className="font-medium">Audio Quality</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full glass-button text-[10px] font-semibold text-white/80 uppercase">
                    {audioQuality === 'auto' ? 'HD (Auto)' : audioQuality === 'high' ? '320k AAC' : audioQuality === 'medium' ? '160k' : '96k'}
                  </span>
                </button>

                {/* Pitch Lock / Shift */}
                <button
                  type="button"
                  onClick={() => setPreservePitch(!preservePitch)}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{preservePitch ? '🔒' : '🎵'}</span>
                    <span className="font-medium">Pitch Control</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    preservePitch ? 'glass-button text-white/70' : 'glass-button-amber text-amber-200'
                  }`}>
                    {preservePitch ? 'Pitch Locked' : 'Tape Shift'}
                  </span>
                </button>

                {/* Playback Speed */}
                <button
                  type="button"
                  onClick={() => {
                    const speeds = [0.75, 1, 1.25, 1.5];
                    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length] || 1;
                    setPlaybackSpeed(next);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">⚡</span>
                    <span className="font-medium">Playback Speed</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full glass-button text-[10px] font-semibold text-white/80">
                    {playbackSpeed}x
                  </span>
                </button>
              </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});