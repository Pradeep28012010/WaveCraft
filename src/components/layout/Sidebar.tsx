import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import CreatePlaylist from '../library/CreatePlaylist';
import ImportPlaylistModal from '../library/ImportPlaylistModal';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const playlists = useLibraryStore((state) => state.playlists) || [];
  const { isPhone, isMobileDrawerOpen, setMobileDrawerOpen } = useDevicePreset();

  const navItems: Array<{
    name: string;
    path: string;
    icon: React.ReactNode;
  }> = [
    {
      name: 'Listen Now',
      path: '/',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )
    },
    {
      name: 'AI Vibe DJ',
      path: '/vibe',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
        </svg>
      )
    },
    {
      name: 'Dual-Deck DJ Booth',
      path: '/dj',
      icon: (
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
      icon: (
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
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      name: 'Browse & Search',
      path: '/search',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )
    },
    {
      name: 'Library',
      path: '/library',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      )
    },
    {
      name: 'Liked Songs',
      path: '/liked',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      )
    },
    {
      name: 'Offline Vault',
      path: '/downloads',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )
    },
    {
      name: 'Recently Played',
      path: '/recent',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    },
    {
      name: 'Analytics',
      path: '/stats',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      )
    },
    {
      name: 'Settings & EQ',
      path: '/settings',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        </svg>
      )
    }
  ];

  // Phone UI Preset: Slide-over Drawer (never permanently squishes the phone viewport)
  if (isPhone) {
    return (
      <>
        <AnimatePresence>
          {isMobileDrawerOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 z-[9980] bg-black/75 backdrop-blur-md flex"
            >
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                onClick={(e) => e.stopPropagation()}
                className="w-72 max-w-[82vw] h-full bg-[#0a0a12]/95 backdrop-blur-3xl border-r border-white/15 flex flex-col select-none shadow-2xl"
              >
                <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] via-rose-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 3v18M17 6v12M21 10v4M7 6v12M3 10v4" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-lg font-extrabold tracking-tight text-white leading-none">
                        WaveCraft
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-accent)] mt-1">
                        Mobile Studio Preset
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileDrawerOpen(false)}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/75"
                  >
                    ✕
                  </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1 no-scrollbar">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => setMobileDrawerOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between gap-2 px-3.5 h-11 rounded-xl transition-colors ${
                          isActive
                            ? 'bg-white/15 text-white font-bold border border-white/15'
                            : 'text-white/65 hover:text-white hover:bg-white/5'
                        }`
                      }
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-5 h-5 flex-shrink-0 text-[var(--color-accent)]">
                          {item.icon}
                        </div>
                        <span className="text-sm truncate">{item.name}</span>
                      </div>
                    </NavLink>
                  ))}

                  <div className="pt-5 pb-2">
                    <div className="flex items-center justify-between px-3 mb-2">
                      <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                        Playlists
                      </span>
                      <button
                        onClick={() => {
                          setMobileDrawerOpen(false);
                          setIsCreateOpen(true);
                        }}
                        className="text-xs font-bold text-[var(--color-accent)]"
                      >
                        + New
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        setIsImportOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 h-10 mb-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-xs font-semibold"
                    >
                      <span>↓ Import Playlist</span>
                    </button>
                    {playlists.map((playlist: any) => (
                      <NavLink
                        key={playlist.id}
                        to={`/playlist/${playlist.id}`}
                        onClick={() => setMobileDrawerOpen(false)}
                        className="flex items-center gap-3 px-3.5 h-10 rounded-xl text-white/65 hover:text-white"
                      >
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-purple-500/60 to-pink-500/60 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {playlist.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate text-sm">{playlist.name}</span>
                      </NavLink>
                    ))}
                  </div>
                </nav>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <CreatePlaylist isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
        <ImportPlaylistModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
      </>
    );
  }

  return (
    <>
      <aside
        className={`flex flex-col h-full bg-white/[0.03] backdrop-blur-3xl border-r border-white/[0.08] transition-all duration-300 select-none ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 h-16 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/25 flex-shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 3v18M17 6v12M21 10v4M7 6v12M3 10v4" />
              </svg>
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-lg font-extrabold tracking-tight text-white leading-none">
                  WaveCraft
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45 mt-1">
                  Liquid Audio
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-1.5 space-y-0.5 no-scrollbar">
          {!collapsed && (
            <div className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
              Navigation
            </div>
          )}
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `relative flex items-center justify-between gap-2 px-3.5 h-10 rounded-xl transition-colors duration-200 group ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                }`
              }
              title={collapsed ? item.name : undefined}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-pill"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      style={{ position: 'absolute', inset: 0 }}
                      className="rounded-xl bg-gradient-to-r from-white/[0.14] via-white/[0.08] to-white/[0.04] backdrop-blur-xl border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.25)] pointer-events-none z-0 overflow-hidden"
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
                        isActive ? 'text-[var(--color-accent)]' : ''
                      }`}
                    >
                      {item.icon}
                    </div>
                    {!collapsed && <span className="text-sm truncate">{item.name}</span>}
                  </div>
                </>
              )}
            </NavLink>
          ))}

          {/* Playlists Section */}
          <div className="pt-6 pb-2">
            {!collapsed && (
              <div className="flex items-center justify-between px-3 mb-2">
                <h3 className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">
                  Playlists
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsImportOpen(true)}
                    className="p-1 rounded-lg text-emerald-400/80 hover:text-emerald-300 hover:bg-white/10 transition-colors cursor-pointer"
                    title="Import External Playlist"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="New Playlist"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              {playlists.map((playlist: any) => (
                <NavLink
                  key={playlist.id}
                  to={`/playlist/${playlist.id}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 h-10 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-white/55 hover:text-white hover:bg-white/[0.05]'
                    }`
                  }
                  title={collapsed ? playlist.name : undefined}
                >
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-purple-500/60 to-pink-500/60 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {playlist.name.charAt(0).toUpperCase()}
                  </div>
                  {!collapsed && (
                    <span className="flex-1 truncate text-sm">{playlist.name}</span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        {/* Collapse Toggle */}
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.07] transition-all text-xs font-medium cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
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
