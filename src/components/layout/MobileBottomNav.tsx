import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export default function MobileBottomNav() {
  const { isPhone, setMobileDrawerOpen } = useDevicePreset();

  if (!isPhone) return null;

  const tabs = [
    {
      name: 'Home',
      path: '/',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )
    },
    {
      name: 'Search',
      path: '/search',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )
    },
    {
      name: 'AI DJ',
      path: '/vibe',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
        </svg>
      )
    },
    {
      name: 'DJ Mix',
      path: '/dj',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
          <path d="M21 16a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
          <path d="M3 16a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      )
    },
    {
      name: 'Library',
      path: '/library',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      )
    }
  ];

  return (
    <nav
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)'
      }}
      className="w-full bg-[#06060b]/92 backdrop-blur-2xl border-t border-white/[0.08] px-2 flex-shrink-0 z-40 select-none"
    >
      <div className="h-14 w-full flex items-center justify-around">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === '/'}
          onClick={() => {
            triggerAndroidHaptic('light');
            setMobileDrawerOpen(false);
          }}
          className={({ isActive }) =>
            `relative flex flex-col items-center justify-center flex-1 h-12 rounded-2xl transition-colors ${
              isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.div
                  layoutId="mobile-bottom-nav-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute inset-x-2 inset-y-0.5 rounded-2xl bg-white/[0.11] border border-white/15 pointer-events-none"
                />
              )}
              <div className={`relative z-10 ${isActive ? 'text-[var(--color-accent)] scale-105' : ''} transition-transform`}>
                {tab.icon}
              </div>
              <span className="relative z-10 text-[10px] font-bold mt-0.5 tracking-tight">
                {tab.name}
              </span>
            </>
          )}
        </NavLink>
      ))}
      </div>
    </nav>
  );
}
