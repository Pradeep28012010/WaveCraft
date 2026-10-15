import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { useFeedbackStore } from '../../stores/feedbackStore';
import { useOfflineVault } from '../../services/offlineVault';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import CreatePlaylist from '../library/CreatePlaylist';
import ImportPlaylistModal from '../library/ImportPlaylistModal';
import type { Playlist } from '../../types';

interface NavItem {
  name: string;
  path: string;
  badge?: string | number;
  badgeColor?: string;
  icon: (active: boolean) => React.ReactNode;
}

interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wavecraft_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const playlists = useLibraryStore((state) => state.playlists) || [];
  const likedSongs = useLibraryStore((state) => state.likedSongs) || [];
  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed) || [];
  const { offlineTracks } = useOfflineVault();

  const isPlaying = usePlayerStore((state) => state.isPlaying);

  const { isPhone, isMobileDrawerOpen, setMobileDrawerOpen } = useDevicePreset();
  const { isInstalled } = usePWAInstall();

  // Save collapsed state preference
  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('wavecraft_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Passive edge-swipe listener on mobile to open drawer from left edge
  useEffect(() => {
    if (!isPhone) return;
    let startX = 0;
    let startY = 0;
    let isTracking = false;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (touch.clientX <= 26) {
        startX = touch.clientX;
        startY = touch.clientY;
        isTracking = true;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isTracking) return;
      isTracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const diffX = touch.clientX - startX;
      const diffY = Math.abs(touch.clientY - startY);
      if (diffX > 45 && diffY < diffX * 0.8) {
        triggerAndroidHaptic('light');
        setMobileDrawerOpen(true);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPhone, setMobileDrawerOpen]);

  // Grouped Navigation Sections
  const navSections: NavSection[] = useMemo(() => [
    {
      id: 'discover',
      title: 'Discover',
      items: [
        {
          name: 'Listen Now',
          path: '/',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )
        },
        {
          name: 'Search & Explore',
          path: '/search',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )
        },
        {
          name: 'Recently Played',
          path: '/recent',
          badge: recentlyPlayed.length > 0 ? recentlyPlayed.length : undefined,
          badgeColor: 'bg-white/10 text-white/70 border-white/15',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )
        }
      ]
    },
    {
      id: 'studio',
      title: 'Studio & AI',
      items: [
        {
          name: 'AI Vibe DJ',
          path: '/vibe',
          badge: '✨ AI',
          badgeColor: 'bg-gradient-to-r from-purple-500/25 to-pink-500/25 text-pink-300 border-purple-500/35',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
            </svg>
          )
        },
        {
          name: 'Dual-Deck DJ Booth',
          path: '/dj',
          badge: 'PRO',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
              <path d="M21 16a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
              <path d="M3 16a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          )
        },
        {
          name: 'Sonic Galaxy Map',
          path: '/galaxy',
          badge: '3D',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(-45 12 12)" />
              <circle cx="5" cy="5.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="19" cy="18.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          )
        },
        {
          name: 'Live Jam Room',
          path: '/jam',
          badge: 'LIVE',
          badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          )
        }
      ]
    },
    {
      id: 'collection',
      title: 'Your Collection',
      items: [
        {
          name: 'Library',
          path: '/library',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          )
        },
        {
          name: 'Liked Songs',
          path: '/liked',
          badge: likedSongs.length > 0 ? likedSongs.length : undefined,
          badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/35',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          )
        },
        {
          name: 'Offline Vault',
          path: '/downloads',
          badge: offlineTracks.length > 0 ? offlineTracks.length : undefined,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )
        },
        {
          name: 'Analytics',
          path: '/stats',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          )
        }
      ]
    },
    {
      id: 'preferences',
      title: 'Preferences',
      items: [
        {
          name: 'Settings & Audio EQ',
          path: '/settings',
          icon: () => (
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            </svg>
          )
        },
        ...(!isInstalled
          ? [
              {
                name: 'Download Native App',
                path: '/download',
                badge: 'APK',
                badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35',
                icon: () => (
                  <svg className="w-5 h-5 block text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )
              }
            ]
          : [])
      ]
    }
  ], [recentlyPlayed.length, likedSongs.length, offlineTracks.length, isInstalled]);

  // Color generator for playlist covers
  const getPlaylistGradient = (id: string) => {
    const gradients = [
      'from-rose-500/80 to-purple-600/80',
      'from-violet-500/80 to-indigo-600/80',
      'from-cyan-500/80 to-blue-600/80',
      'from-emerald-500/80 to-teal-600/80',
      'from-amber-500/80 to-rose-600/80',
      'from-fuchsia-500/80 to-pink-600/80'
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i);
      hash |= 0;
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  // Phone UI Preset: Slide-Over iOS Sheet with drag dismiss
  if (isPhone) {
    const mobileDrawer = (
      <AnimatePresence>
        {isMobileDrawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileDrawerOpen(false)}
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex"
          >
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              drag="x"
              dragConstraints={{ right: 0, left: 0 }}
              dragElastic={{ left: 0.6, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60 || info.velocity.x < -280) {
                  triggerAndroidHaptic('light');
                  setMobileDrawerOpen(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-84 max-w-[86vw] h-full liquid-glass bg-[#070714]/98 backdrop-blur-3xl border-r border-white/20 flex flex-col select-none shadow-[0_24px_80px_rgba(0,0,0,0.95)] z-[10000] relative"
              style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)'
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 h-16 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/30">
                    <svg className="w-5.5 h-5.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M12 3v18M17 6v12M21 10v4M7 6v12M3 10v4" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-black tracking-tight text-white leading-none">
                        WaveCraft
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/20 text-[8px] font-black tracking-widest text-[var(--color-accent)] uppercase border border-[var(--color-accent)]/30">
                        PRO
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-white/45 mt-1 tracking-wide">
                      Ultra-Fidelity Studio
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    setMobileDrawerOpen(false);
                  }}
                  aria-label="Close navigation menu"
                  className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer active:scale-90"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Scrollable Navigation Body */}
              <nav className="flex-1 overflow-y-auto px-3.5 py-3 space-y-4 no-scrollbar">
                {navSections.map((section) => (
                  <div key={section.id} className="space-y-1">
                    <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-wider text-white/40">
                      {section.title}
                    </div>
                    {section.items.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        end={item.path === '/'}
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setMobileDrawerOpen(false);
                        }}
                        className={({ isActive }) =>
                          `flex items-center justify-between gap-2 px-3 h-10.5 rounded-xl transition-all ${
                            isActive
                              ? 'glass-button-primary text-white font-bold shadow-md'
                              : 'text-white/70 hover:text-white hover:bg-white/[0.06] active:scale-98'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-white/70'}`}>
                                {item.icon(isActive)}
                              </div>
                              <span className="text-xs font-semibold truncate">{item.name}</span>
                            </div>
                            {item.badge !== undefined && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.badgeColor || 'bg-white/10 text-white/70 border-white/20'}`}>
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                ))}

                {/* Playlists Section */}
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between px-2 pb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/40">
                      PLAYLISTS ({playlists.length})
                    </span>
                    <button
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setMobileDrawerOpen(false);
                        setIsCreateOpen(true);
                      }}
                      className="text-[11px] font-bold text-[var(--color-accent)] hover:underline cursor-pointer"
                    >
                      + New
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setMobileDrawerOpen(false);
                      setIsImportOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 h-9 rounded-xl glass-button text-emerald-300 text-[11px] font-bold cursor-pointer active:scale-98"
                  >
                    <span>↓ Import External Playlist</span>
                  </button>

                  <div className="space-y-0.5 max-h-44 overflow-y-auto no-scrollbar">
                    {playlists.map((playlist: Playlist) => (
                      <NavLink
                        key={playlist.id}
                        to={`/playlist/${playlist.id}`}
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setMobileDrawerOpen(false);
                        }}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 h-9 rounded-xl transition-all text-xs ${
                            isActive
                              ? 'bg-white/15 text-white font-bold'
                              : 'text-white/70 hover:text-white hover:bg-white/5'
                          }`
                        }
                      >
                        <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${getPlaylistGradient(playlist.id)} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 shadow-sm`}>
                          {playlist.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate">{playlist.name}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>

                {/* Feedback Button */}
                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    setMobileDrawerOpen(false);
                    useFeedbackStore.getState().openFeedback();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 h-10 rounded-xl text-amber-300/90 hover:text-amber-200 bg-amber-500/10 border border-amber-500/25 text-xs font-bold transition-all cursor-pointer mt-3 active:scale-98"
                >
                  <span className="text-base">🐛</span>
                  <span>Feedback & Bug Report</span>
                </button>
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    );

    return (
      <>
        {typeof document !== 'undefined' ? createPortal(mobileDrawer, document.body) : mobileDrawer}
        <CreatePlaylist isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
        <ImportPlaylistModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
      </>
    );
  }

  // Desktop / Laptop Sidebar
  return (
    <>
      <aside
        className={`flex flex-col h-full liquid-glass bg-[#06060f]/80 backdrop-blur-3xl border-r border-white/[0.08] shadow-[4px_0_30px_rgba(0,0,0,0.5)] transition-all duration-300 select-none z-30 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className={`flex items-center h-18 border-b border-white/[0.06] flex-shrink-0 transition-all ${
          collapsed ? 'justify-center px-0' : 'justify-between px-5'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative group cursor-pointer" onClick={() => handleToggleCollapse()}>
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/25 flex-shrink-0 transition-transform group-hover:scale-105 active:scale-95">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 3v18M17 6v12M21 10v4M7 6v12M3 10v4" />
                </svg>
              </div>
              {collapsed && isPlaying && (
                <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-[var(--color-accent)] border-2 border-black animate-pulse" />
              )}
            </div>

            {!collapsed && (
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-extrabold tracking-tight text-white leading-none">
                    WaveCraft
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/20 text-[8px] font-black tracking-widest text-[var(--color-accent)] uppercase border border-[var(--color-accent)]/30">
                    PRO
                  </span>
                </div>
                <span className="text-[10px] font-medium tracking-wider text-white/45 mt-1">
                  Liquid Audio Studio
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Grouped Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 no-scrollbar">
          {navSections.map((section) => (
            <div key={section.id} className="space-y-1">
              {!collapsed && (
                <div className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  {section.title}
                </div>
              )}
              {collapsed && (
                <div className="h-px w-8 mx-auto my-2 bg-white/10" />
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.path}
                  end={item.path === '/'}
                  title={collapsed ? item.name : undefined}
                  className={({ isActive }) =>
                    `relative flex items-center justify-between gap-2 h-10 rounded-xl transition-all duration-200 group ${
                      collapsed ? 'px-0 justify-center' : 'px-3.5'
                    } ${
                      isActive
                        ? 'text-white font-semibold'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.06] active:scale-98'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active-pill-desktop"
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                          style={{ position: 'absolute', inset: 0 }}
                          className="rounded-xl bg-gradient-to-r from-white/[0.14] via-white/[0.08] to-white/[0.03] backdrop-blur-xl border border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.25)] pointer-events-none z-0 overflow-hidden"
                        >
                          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
                        </motion.div>
                      )}

                      <div
                        className={`relative z-10 flex items-center gap-3.5 min-w-0 transition-transform duration-200 group-hover:translate-x-0.5 ${
                          collapsed ? 'mx-auto' : ''
                        }`}
                      >
                        <div
                          className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            isActive ? 'text-[var(--color-accent)]' : 'text-white/70'
                          }`}
                        >
                          {item.icon(isActive)}
                        </div>
                        {!collapsed && (
                          <span className="text-sm truncate font-medium">{item.name}</span>
                        )}
                      </div>

                      {!collapsed && item.badge !== undefined && (
                        <span className={`relative z-10 px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.badgeColor || 'bg-white/10 text-white/70 border-white/20'}`}>
                          {item.badge}
                        </span>
                      )}

                      {collapsed && item.badge !== undefined && (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--color-accent)] ring-2 ring-black" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}

          {/* Playlists Section */}
          <div className="pt-2 pb-1 space-y-1">
            {!collapsed && (
              <div className="flex items-center justify-between px-3 mb-2">
                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                  Playlists ({playlists.length})
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsImportOpen(true)}
                    className="p-1 rounded-lg text-emerald-400/80 hover:text-emerald-300 hover:bg-white/10 transition-colors cursor-pointer active:scale-90"
                    title="Import External Playlist (Spotify / Apple Music / YouTube)"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer active:scale-90"
                    title="Create New Playlist"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {collapsed && (
              <div className="flex justify-center mb-1">
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="w-9 h-9 rounded-xl glass-button flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer"
                  title="Create New Playlist"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            )}

            <div className="space-y-0.5">
              {(collapsed ? playlists.slice(0, 5) : playlists).map((playlist: Playlist) => (
                <NavLink
                  key={playlist.id}
                  to={`/playlist/${playlist.id}`}
                  title={collapsed ? playlist.name : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 h-9.5 rounded-xl transition-all duration-200 ${
                      collapsed ? 'justify-center px-0' : 'px-3.5'
                    } ${
                      isActive
                        ? 'bg-white/15 text-white font-medium shadow-sm'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                    }`
                  }
                >
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${getPlaylistGradient(playlist.id)} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm`}>
                    {playlist.name.charAt(0).toUpperCase()}
                  </div>
                  {!collapsed && (
                    <span className="flex-1 truncate text-xs font-medium">{playlist.name}</span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer Actions: Feedback & Collapse Controls */}
        <div className="p-2.5 pt-1 space-y-1.5 border-t border-white/[0.06] flex-shrink-0">
          <button
            onClick={() => {
              triggerAndroidHaptic('light');
              useFeedbackStore.getState().openFeedback();
            }}
            className={`flex items-center justify-center gap-2 w-full h-9 rounded-xl text-amber-300/90 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-xs font-bold transition-all cursor-pointer active:scale-95 ${
              collapsed ? 'px-0' : 'px-3'
            }`}
            title="Report a bug or suggest an idea"
          >
            <span>🐛</span>
            {!collapsed && <span>Feedback & Bugs</span>}
          </button>

          <button
            onClick={handleToggleCollapse}
            aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="flex items-center justify-center gap-2 w-full h-9 rounded-xl text-white/60 hover:text-white glass-button text-xs font-medium cursor-pointer active:scale-95 transition-all"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {!collapsed && <span>Collapse Sidebar</span>}
          </button>
        </div>
      </aside>

      <CreatePlaylist isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <ImportPlaylistModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
    </>
  );
}
