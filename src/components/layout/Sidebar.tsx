import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { useOfflineVault } from '../../services/offlineVault';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { preloadRoute } from '../../utils/routePreloader';
import type { Playlist } from '../../types';

const CreatePlaylist = lazy(() => import('../library/CreatePlaylist'));
const ImportPlaylistModal = lazy(() => import('../library/ImportPlaylistModal'));

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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const playlists = useLibraryStore((state) => state.playlists) || [];
  const likedSongs = useLibraryStore((state) => state.likedSongs) || [];
  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed) || [];
  const { offlineTracks } = useOfflineVault();

  const isPlaying = usePlayerStore((state) => state.isPlaying);

  const {
    isPhone,
    isMobileDrawerOpen,
    setMobileDrawerOpen,
    isSidebarCollapsed,
    toggleSidebarCollapsed
  } = useDevicePreset();
  const { isInstalled } = usePWAInstall();

  // Close mobile navigation drawer on Escape
  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileDrawerOpen, setMobileDrawerOpen]);

  // Global Ctrl+B / Cmd+B keyboard shortcut to toggle desktop sidebar
  useEffect(() => {
    if (isPhone) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        triggerAndroidHaptic('light');
        toggleSidebarCollapsed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPhone, toggleSidebarCollapsed]);

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
          badgeColor: 'bg-white/10 text-white/70 border-0',
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
      title: 'Live & Space',
      items: [
        {
          name: 'Sonic Galaxy Map',
          path: '/galaxy',
          badge: '3D',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border-0',
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
          badgeColor: 'bg-rose-500/20 text-rose-300 border-0',
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
          badgeColor: 'bg-rose-500/20 text-rose-300 border-0',
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
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-0',
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
                badgeColor: 'bg-emerald-500/20 text-emerald-300 border-0',
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

// Apple-grade Critically Damped Transition Variants for Mobile Navigation Drawer
const drawerBackdropVariants = {
  closed: {
    opacity: 0,
    transition: {
      duration: 0.24,
      ease: [0.32, 0, 0.67, 0]
    }
  },
  open: {
    opacity: 1,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

const drawerPanelVariants = {
  closed: {
    x: '-100%',
    transition: {
      duration: 0.24,
      ease: [0.32, 0, 0.67, 0]
    }
  },
  open: {
    x: '0%',
    transition: {
      type: 'spring',
      damping: 32,
      stiffness: 340,
      mass: 0.75
    }
  }
};

  // Phone UI Preset: Slide-Over iOS Sheet with drag dismiss
  if (isPhone) {
    const mobileDrawer = (
      <AnimatePresence>
        {isMobileDrawerOpen && (
          <motion.div
            key="mobile-drawer-scrim"
            variants={drawerBackdropVariants}
            initial="closed"
            animate="open"
            exit="closed"
            onClick={() => setMobileDrawerOpen(false)}
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-xl flex"
          >
            <motion.aside
              key="mobile-drawer-panel"
              variants={drawerPanelVariants}
              initial="closed"
              animate="open"
              exit="closed"
              drag="x"
              dragConstraints={{ right: 0, left: 0 }}
              dragElastic={{ left: 0.5, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50 || info.velocity.x < -260) {
                  triggerAndroidHaptic('light');
                  setMobileDrawerOpen(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-84 max-w-[86vw] h-full liquid-glass bg-[#070714]/98 backdrop-blur-3xl border-0 flex flex-col select-none shadow-[0_24px_80px_rgba(0,0,0,0.95)] z-[10000] relative overflow-hidden"
              style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)'
              }}
            >
              {/* Right-edge Specular Glass Rim & Elevation Shadow */}
              <div className="absolute top-0 right-0 bottom-0 w-[1px] bg-gradient-to-b from-white/30 via-white/10 to-transparent pointer-events-none z-20" />
              <div className="absolute top-0 -right-6 bottom-0 w-6 bg-gradient-to-r from-black/40 to-transparent pointer-events-none z-10" />

              {/* Tactile drag affordance pill on the right border */}
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1 h-11 rounded-full bg-white/20 pointer-events-none shadow-sm z-20" />

              {/* Header */}
              <div className="flex items-center justify-between px-5 h-16 border-0 flex-shrink-0">
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
                      <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/20 text-[8px] font-black tracking-widest text-[var(--color-accent)] uppercase border-0">
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
                        onMouseEnter={() => preloadRoute(item.path)}
                        onTouchStart={() => preloadRoute(item.path)}
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setMobileDrawerOpen(false);
                        }}
                        className={({ isActive }) =>
                          `relative flex items-center justify-between gap-2 px-3 h-10.5 rounded-xl transition-all ${
                            isActive
                              ? 'text-white font-bold'
                              : 'text-white/70 hover:text-white hover:bg-white/[0.06] active:scale-98'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <motion.div
                                layoutId="sidebar-active-pill-mobile"
                                transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                                className="absolute inset-0 rounded-xl liquid-sliding-pill pointer-events-none z-0"
                              />
                            )}
                            <div className="relative z-10 flex items-center gap-3 min-w-0">
                              <div className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-white/70'}`}>
                                {item.icon(isActive)}
                              </div>
                              <span className="text-xs font-semibold truncate">{item.name}</span>
                            </div>
                            {item.badge !== undefined && (
                              <span className={`relative z-10 px-2 py-0.5 rounded-full text-[10px] font-bold border-0 ${item.badgeColor || 'bg-white/10 text-white/70'}`}>
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

  // Desktop / Laptop Sidebar (GPU-Accelerated Fixed-Rail Architecture)
  return (
    <>
      <motion.aside
        animate={{ width: isSidebarCollapsed ? 76 : 256 }}
        transition={{
          duration: 0.28,
          ease: [0.16, 1, 0.3, 1]
        }}
        className="flex flex-col h-full liquid-glass bg-[#06060f]/85 backdrop-blur-3xl shadow-[4px_0_30px_rgba(0,0,0,0.5)] select-none z-30 flex-shrink-0 overflow-hidden relative"
      >
        {/* Brand Header */}
        <div className="flex items-center h-18 px-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 w-full">
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                toggleSidebarCollapsed();
              }}
              title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
              className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/25 flex-shrink-0 transition-transform hover:scale-105 active:scale-95 cursor-pointer relative"
            >
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 3v18M17 6v12M21 10v4M7 6v12M3 10v4" />
              </svg>
              {isSidebarCollapsed && isPlaying && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] border-2 border-black animate-pulse" />
              )}
            </button>

            <motion.div
              animate={{ opacity: isSidebarCollapsed ? 0 : 1, x: isSidebarCollapsed ? -8 : 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col min-w-0 overflow-hidden whitespace-nowrap"
              style={{ pointerEvents: isSidebarCollapsed ? 'none' : 'auto' }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-white leading-none">
                  WaveCraft
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/20 text-[8px] font-black tracking-widest text-[var(--color-accent)] uppercase border-0">
                  PRO
                </span>
              </div>
              <span className="text-[10px] font-medium tracking-wider text-white/45 mt-1">
                Liquid Audio Studio
              </span>
            </motion.div>
          </div>
        </div>

        {/* Scrollable Grouped Navigation (Anchored Icon Rail) */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-3.5 no-scrollbar">
          {navSections.map((section) => (
            <div key={section.id} className="space-y-1">
              {/* Section Header or Divider */}
              <div className="h-4 flex items-center overflow-hidden">
                {isSidebarCollapsed ? (
                  <div className="h-px w-6 mx-auto bg-white/10" />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="px-3 text-[10px] font-bold uppercase tracking-wider text-white/40 whitespace-nowrap"
                  >
                    {section.title}
                  </motion.div>
                )}
              </div>

              {section.items.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.path}
                  end={item.path === '/'}
                  onMouseEnter={() => preloadRoute(item.path)}
                  onTouchStart={() => preloadRoute(item.path)}
                  title={isSidebarCollapsed ? item.name : undefined}
                  className={({ isActive }) =>
                    `relative flex items-center h-10 rounded-xl px-2.5 w-full group overflow-hidden select-none transition-colors ${
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
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          style={{ position: 'absolute', inset: 0 }}
                          className="rounded-xl bg-gradient-to-r from-white/[0.14] via-white/[0.08] to-white/[0.03] backdrop-blur-xl border-0 shadow-[0_8px_24px_rgba(0,0,0,0.4)] pointer-events-none z-0 overflow-hidden"
                        >
                          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
                        </motion.div>
                      )}

                      {/* Fixed Icon Column (ALWAYS Anchored at Exact Same Left Slot) */}
                      <div className="relative z-10 w-7 h-7 flex items-center justify-center flex-shrink-0">
                        <div
                          className={`w-5 h-5 flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${
                            isActive ? 'text-[var(--color-accent)]' : 'text-white/70'
                          }`}
                        >
                          {item.icon(isActive)}
                        </div>
                        {isSidebarCollapsed && item.badge !== undefined && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[#06060f]" />
                        )}
                      </div>

                      {/* Smooth GPU Label Container (No Layout Thrashing) */}
                      <motion.div
                        animate={{ opacity: isSidebarCollapsed ? 0 : 1, x: isSidebarCollapsed ? -6 : 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="ml-3 flex-1 min-w-0 flex items-center justify-between overflow-hidden whitespace-nowrap relative z-10"
                        style={{ pointerEvents: isSidebarCollapsed ? 'none' : 'auto' }}
                      >
                        <span className="text-sm truncate font-medium">{item.name}</span>
                        {item.badge !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border-0 ${item.badgeColor || 'bg-white/10 text-white/70'}`}>
                            {item.badge}
                          </span>
                        )}
                      </motion.div>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}

          {/* Playlists Section */}
          <div className="pt-2 pb-1 space-y-1">
            <div className="h-6 flex items-center overflow-hidden px-2 mb-1">
              {isSidebarCollapsed ? (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="w-7 h-7 mx-auto rounded-lg glass-button flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer"
                  title="Create New Playlist"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              ) : (
                <div className="flex items-center justify-between w-full px-1">
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
            </div>

            <div className="space-y-0.5">
              {(isSidebarCollapsed ? playlists.slice(0, 5) : playlists).map((playlist: Playlist) => (
                <NavLink
                  key={playlist.id}
                  to={`/playlist/${playlist.id}`}
                  title={isSidebarCollapsed ? playlist.name : undefined}
                  className={({ isActive }) =>
                    `relative flex items-center h-9.5 rounded-xl px-2.5 w-full group overflow-hidden select-none transition-colors ${
                      isActive
                        ? 'bg-white/15 text-white font-medium shadow-sm'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                    }`
                  }
                >
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${getPlaylistGradient(playlist.id)} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm`}>
                    {playlist.name.charAt(0).toUpperCase()}
                  </div>
                  <motion.div
                    animate={{ opacity: isSidebarCollapsed ? 0 : 1, x: isSidebarCollapsed ? -6 : 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="ml-3 flex-1 min-w-0 overflow-hidden whitespace-nowrap"
                    style={{ pointerEvents: isSidebarCollapsed ? 'none' : 'auto' }}
                  >
                    <span className="text-xs font-medium truncate block">{playlist.name}</span>
                  </motion.div>
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer Actions: Collapse Controls */}
        <div className="p-2.5 pt-1 space-y-1.5 flex-shrink-0">
          <button
            onClick={() => {
              triggerAndroidHaptic('light');
              toggleSidebarCollapsed();
            }}
            aria-label={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            title={isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
            className="flex items-center justify-center gap-2 w-full h-9 rounded-xl text-white/60 hover:text-white glass-button text-xs font-medium cursor-pointer active:scale-95 transition-all overflow-hidden"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${isSidebarCollapsed ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <motion.span
              animate={{ opacity: isSidebarCollapsed ? 0 : 1, width: isSidebarCollapsed ? 0 : 'auto' }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden whitespace-nowrap"
              style={{ pointerEvents: isSidebarCollapsed ? 'none' : 'auto' }}
            >
              Collapse Sidebar
            </motion.span>
          </button>
        </div>
      </motion.aside>

      {isCreateOpen && (
        <Suspense fallback={null}>
          <CreatePlaylist isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
        </Suspense>
      )}
      {isImportOpen && (
        <Suspense fallback={null}>
          <ImportPlaylistModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
