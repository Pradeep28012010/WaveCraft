import { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { preloadRoute } from '../../utils/routePreloader';
import { useIsKeyboardOpen } from '../../hooks/useIsKeyboardOpen';

function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPhone, setMobileDrawerOpen } = useDevicePreset();
  const isKeyboardOpen = useIsKeyboardOpen();

  if (!isPhone || isKeyboardOpen) return null;

  const tabs = [
    {
      name: 'Listen Now',
      path: '/',
      exact: true,
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="6 3 20 12 6 21 6 3" />
        </svg>
      )
    },
    {
      name: 'Search',
      path: '/search',
      exact: false,
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )
    },
    {
      name: 'Liked',
      path: '/liked',
      exact: false,
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      )
    },
    {
      name: 'Library',
      path: '/library',
      exact: false,
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      )
    },
    {
      name: 'Settings',
      path: '/settings',
      exact: false,
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    }
  ];

  const handleTabPress = (path: string, e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    triggerAndroidHaptic('light');
    setMobileDrawerOpen(false);

    // Dismiss virtual keyboard and blur active search input if open
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (location.pathname !== path) {
      navigate(path);
    }
  };

  return (
    <nav
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)'
      }}
      className="fixed bottom-0 inset-x-0 z-[70] px-3 pt-1 pointer-events-none select-none flex justify-center"
    >
      <div className="w-full max-w-md pointer-events-auto h-15 rounded-[24px] liquid-glass bg-[#080812]/85 backdrop-blur-3xl border-0 shadow-[0_20px_50px_rgba(0,0,0,0.85)] px-1.5 flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? location.pathname === tab.path
            : location.pathname.startsWith(tab.path);

          return (
            <button
              key={tab.path}
              type="button"
              onClick={(e) => handleTabPress(tab.path, e)}
              onPointerDown={() => preloadRoute(tab.path)}
              className={`relative flex flex-col items-center justify-center flex-1 h-12 rounded-2xl transition-colors duration-150 cursor-pointer touch-manipulation select-none active:scale-95 ${
                isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="mobile-bottom-nav-pill"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                  className="absolute inset-x-1.5 inset-y-1 rounded-2xl liquid-sliding-pill pointer-events-none"
                />
              )}
              <div
                className={`relative z-10 transition-transform ${
                  isActive ? 'scale-110 text-[var(--color-accent)] drop-shadow-[0_0_8px_rgba(250,45,72,0.4)]' : ''
                }`}
              >
                {tab.icon}
              </div>
              <span
                className={`relative z-10 text-[10px] tracking-tight mt-0.5 font-bold transition-colors ${
                  isActive ? 'text-white' : 'text-white/55'
                }`}
              >
                {tab.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

MobileBottomNav.displayName = 'MobileBottomNav';

export default memo(MobileBottomNav);
