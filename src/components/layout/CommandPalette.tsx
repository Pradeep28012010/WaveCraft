import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../stores/studioStore';
import { usePlayerStore } from '../../stores/playerStore';
import { searchTracks } from '../../services/youtube';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import type { Track } from '../../types';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

interface CommandAction {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  badge?: string;
  icon: string;
  run: () => void;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [trackResults, setTrackResults] = useState<Track[]>([]);
  const [isSearchingTracks, setIsSearchingTracks] = useState(false);

  const {
    isCommandPaletteOpen,
    fxMode,
    ambientVolumes,
    setCommandPaletteOpen,
    setStudioModalOpen,
    setFxMode,
    setAmbientVolume,
    stopAllAmbient,
    startPomodoro
  } = useStudioStore();

  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);

  // Global Ctrl+K / Cmd+K shortcut listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!useStudioStore.getState().isCommandPaletteOpen);
      } else if (e.key === 'Escape' && useStudioStore.getState().isCommandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCommandPaletteOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTrackResults([]);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isCommandPaletteOpen]);

  // Live song search when typing > 2 chars
  useEffect(() => {
    if (!isCommandPaletteOpen || query.trim().length < 2) {
      setTrackResults([]);
      setIsSearchingTracks(false);
      return;
    }

    setIsSearchingTracks(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchTracks(query.trim());
        setTrackResults(res.slice(0, 4));
      } catch {
        setTrackResults([]);
      } finally {
        setIsSearchingTracks(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, isCommandPaletteOpen]);

  const actions: CommandAction[] = useMemo(
    () => [
      {
        id: 'fx-slowed',
        category: 'Studio Audio FX',
        title: 'Activate Slowed + Reverb Mode',
        subtitle: '0.86x analog tape pitch-drop with lush stereo hall reverb',
        badge: fxMode === 'slowed-reverb' ? 'ACTIVE' : '0.86x DSP',
        icon: '🌙',
        run: () => setFxMode(fxMode === 'slowed-reverb' ? 'normal' : 'slowed-reverb')
      },
      {
        id: 'fx-8d',
        category: 'Studio Audio FX',
        title: 'Activate 8D Spatial Audio Orbit',
        subtitle: '360° circular stereo panner orbiting around your headphones',
        badge: fxMode === '8d-orbit' ? 'ACTIVE' : '360° ORBIT',
        icon: '🎧',
        run: () => setFxMode(fxMode === '8d-orbit' ? 'normal' : '8d-orbit')
      },
      {
        id: 'fx-nightcore',
        category: 'Studio Audio FX',
        title: 'Activate Nightcore Rush (1.22x)',
        subtitle: 'High-energy sped-up pitch & tempo with crystal treble boost',
        badge: fxMode === 'nightcore' ? 'ACTIVE' : '1.22x UP',
        icon: '⚡',
        run: () => setFxMode(fxMode === 'nightcore' ? 'normal' : 'nightcore')
      },
      {
        id: 'fx-bass',
        category: 'Studio Audio FX',
        title: 'Activate Sub-Bass Cinema (+8dB)',
        subtitle: 'Deep theater sub-bass punch at 32Hz–64Hz',
        badge: fxMode === 'bass-cinema' ? 'ACTIVE' : '+8dB SUB',
        icon: '🔊',
        run: () => setFxMode(fxMode === 'bass-cinema' ? 'normal' : 'bass-cinema')
      },
      {
        id: 'fx-normal',
        category: 'Studio Audio FX',
        title: 'Reset Audio FX to 320k Studio Master',
        subtitle: 'Restore bit-accurate flat 1.0x studio playback',
        badge: fxMode === 'normal' ? 'ACTIVE' : 'FLAT',
        icon: '✨',
        run: () => setFxMode('normal')
      },
      {
        id: 'amb-rain',
        category: 'Ambient Soundscapes',
        title: 'Toggle Midnight Rain Layer',
        subtitle: 'Layer soothing window rainfall underneath your music',
        badge: ambientVolumes.rain > 0 ? 'ON' : 'AMBIENT',
        icon: '🌧️',
        run: () => setAmbientVolume('rain', ambientVolumes.rain > 0 ? 0 : 0.45)
      },
      {
        id: 'amb-vinyl',
        category: 'Ambient Soundscapes',
        title: 'Toggle Warm Vinyl Needle Crackle',
        subtitle: 'Add cozy analog vinyl dust underneath any track',
        badge: ambientVolumes.vinyl > 0 ? 'ON' : 'ANALOG',
        icon: '💿',
        run: () => setAmbientVolume('vinyl', ambientVolumes.vinyl > 0 ? 0 : 0.4)
      },
      {
        id: 'amb-focus',
        category: 'Ambient Soundscapes',
        title: 'Toggle 40Hz Deep Focus Binaural Drone',
        subtitle: 'Pure stereo gamma study pad for coding & reading',
        badge: ambientVolumes.binaural > 0 ? 'ON' : '40Hz GAMMA',
        icon: '🧠',
        run: () => setAmbientVolume('binaural', ambientVolumes.binaural > 0 ? 0 : 0.4)
      },
      {
        id: 'amb-mute',
        category: 'Ambient Soundscapes',
        title: 'Mute All Ambient Soundscape Layers',
        subtitle: 'Turn off rain, vinyl crackle, ocean surf, and focus pad',
        icon: '🔇',
        run: () => stopAllAmbient()
      },
      {
        id: 'focus-pomodoro',
        category: 'Focus & Workstation',
        title: 'Start 25-Minute Focus Pomodoro Timer',
        subtitle: 'Launch a deep-work countdown in the top bar',
        badge: '25:00',
        icon: '⏱️',
        run: () => startPomodoro('focus')
      },
      {
        id: 'open-studio-hub',
        category: 'Focus & Workstation',
        title: 'Open Studio FX, Ambient Mixer & Focus Hub',
        subtitle: 'Full control deck for DSP FX, soundscapes & sleep timer',
        badge: 'STUDIO',
        icon: '🎛️',
        run: () => setStudioModalOpen(true)
      },
      {
        id: 'nav-vibe',
        category: 'Navigation',
        title: 'Go to AI Vibe DJ',
        subtitle: 'Describe any mood to generate an instant playable mix',
        badge: 'AI DJ',
        icon: '🪄',
        run: () => navigate('/vibe')
      },
      {
        id: 'nav-jam',
        category: 'Navigation',
        title: 'Go to Live Jam Room',
        subtitle: 'Host or join a synchronized listening room with friends',
        badge: 'SYNC',
        icon: '📡',
        run: () => navigate('/jam')
      },
      {
        id: 'nav-stats',
        category: 'Navigation',
        title: 'Open WaveCraft Wrapped Passport & Badges',
        subtitle: 'View your listener aura, unlockable badges & downloadable poster',
        badge: 'WRAPPED',
        icon: '🏆',
        run: () => navigate('/stats')
      },
      {
        id: 'player-toggle',
        category: 'Playback',
        title: 'Play / Pause Current Track',
        subtitle: 'Toggle active studio playback',
        icon: '⏯️',
        run: () => togglePlay()
      },
      {
        id: 'player-next',
        category: 'Playback',
        title: 'Skip to Next Track in Queue',
        subtitle: 'Jump to the next preloaded song',
        icon: '⏭️',
        run: () => nextTrack()
      }
    ],
    [
      fxMode,
      ambientVolumes,
      setFxMode,
      setAmbientVolume,
      stopAllAmbient,
      startPomodoro,
      setStudioModalOpen,
      navigate,
      togglePlay,
      nextTrack
    ]
  );

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.subtitle.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [actions, query]);

  const totalItems = trackResults.length + filteredActions.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (totalItems > 0 ? (prev + 1) % totalItems : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (totalItems > 0 ? (prev - 1 + totalItems) % totalItems : 0));
    } else if (e.key === 'Enter' && totalItems > 0) {
      e.preventDefault();
      if (selectedIndex < trackResults.length) {
        const chosenTrack = trackResults[selectedIndex];
        unlockAudioEngine();
        playTrack(chosenTrack, trackResults, selectedIndex);
        setCommandPaletteOpen(false);
      } else {
        const action = filteredActions[selectedIndex - trackResults.length];
        if (action) {
          action.run();
          setCommandPaletteOpen(false);
        }
      }
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isCommandPaletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setCommandPaletteOpen(false)}
          className="fixed inset-0 z-[9995] flex items-start justify-center pt-[11vh] px-4 bg-black/75 backdrop-blur-2xl select-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -16 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl liquid-glass border border-white/25 shadow-[0_30px_100px_rgba(0,0,0,0.9)] overflow-hidden text-white"
          >
            {/* Search Input Header */}
            <div className="flex items-center gap-3.5 px-5 py-4 border-b border-white/12 bg-black/30">
              <svg
                className="w-5 h-5 text-[var(--color-accent)] flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Play any song, toggle Slowed + Reverb, 8D Orbit, Rain, or Focus Timer..."
                className="flex-1 bg-transparent text-sm sm:text-base font-medium text-white placeholder-white/40 focus:outline-none"
              />
              {isSearchingTracks && (
                <div className="w-4 h-4 border-2 border-white/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
              )}
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-bold text-white/50">
                ESC
              </span>
            </div>

            {/* Results List */}
            <div className="max-h-[60vh] overflow-y-auto p-2.5 no-scrollbar space-y-3">
              {/* Instant Playable Song Matches */}
              {trackResults.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-accent)]">
                    Instant Play • 320kbps Studio Tracks
                  </div>
                  <div className="space-y-1 mt-1">
                    {trackResults.map((track, idx) => {
                      const active = selectedIndex === idx;
                      return (
                        <div
                          key={track.id}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onClick={() => {
                            unlockAudioEngine();
                            playTrack(track, trackResults, idx);
                            setCommandPaletteOpen(false);
                          }}
                          className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl cursor-pointer transition-colors ${
                            active ? 'bg-white/15 border border-white/20' : 'hover:bg-white/10 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={track.thumbnail || DEFAULT_THUMBNAIL}
                              alt={track.title}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                              }}
                              className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">
                                {track.title}
                              </div>
                              <div className="text-xs text-white/55 truncate">{track.artist}</div>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-extrabold uppercase tracking-wider flex-shrink-0">
                            ▶ Play Now
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Studio Commands & Quick Actions */}
              {filteredActions.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white/45">
                    Studio Actions & Audio FX
                  </div>
                  <div className="space-y-1 mt-1">
                    {filteredActions.map((action, i) => {
                      const globalIdx = trackResults.length + i;
                      const active = selectedIndex === globalIdx;
                      return (
                        <div
                          key={action.id}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          onClick={() => {
                            action.run();
                            setCommandPaletteOpen(false);
                          }}
                          className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl cursor-pointer transition-colors ${
                            active ? 'bg-white/15 border border-white/20' : 'hover:bg-white/10 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-white/[0.07] border border-white/10 flex items-center justify-center text-base flex-shrink-0">
                              {action.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">
                                {action.title}
                              </div>
                              <div className="text-xs text-white/50 truncate">
                                {action.subtitle}
                              </div>
                            </div>
                          </div>
                          {action.badge && (
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex-shrink-0 ${
                                action.badge === 'ACTIVE' || action.badge === 'ON'
                                  ? 'bg-emerald-400 text-black'
                                  : 'bg-white/10 text-white/75'
                              }`}
                            >
                              {action.badge}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {totalItems === 0 && !isSearchingTracks && (
                <div className="py-10 text-center text-sm text-white/45">
                  No matching commands or songs found for "{query}".
                </div>
              )}
            </div>

            {/* Footer Hints */}
            <div className="px-5 py-2.5 border-t border-white/10 bg-black/35 flex items-center justify-between text-[11px] text-white/45">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Execute / Play</span>
                <span>ESC Close</span>
              </div>
              <span className="font-semibold text-white/60">WaveCraft Spotlight • Ctrl+K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
