import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export default function MobileBottomNav() {
  const { isPhone, setMobileDrawerOpen } = useDevicePreset();

  if (!isPhone) return null;

  const tabs = [
    {
      name: 'Listen Now',
      path: '/',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="6 3 20 12 6 21 6 3" />
        </svg>
      )
    },
    {
      name: 'Search',
      path: '/search',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )
    },
    {
      name: 'AI DJ',
      path: '/vibe',
      isHighlight: true,
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
        </svg>
      )
    },
    {
      name: 'DJ Booth',
      path: '/dj',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      )
    }
  ];

  return (
    <nav
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)'
      }}
      className="fixed bottom-0 inset-x-0 z-40 px-3 pt-1 pointer-events-none select-none flex justify-center"
    >
      <div className="w-full max-w-md pointer-events-auto h-15 rounded-[24px] liquid-glass bg-[#080812]/85 backdrop-blur-3xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.3)] px-1.5 flex items-center justify-around">
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
              `relative flex flex-col items-center justify-center flex-1 h-12 rounded-2xl transition-all cursor-pointer ${
                isActive ? 'text-white' : 'text-white/50 hover:text-white/80 active:scale-95'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="mobile-bottom-nav-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-x-1.5 inset-y-1 rounded-2xl bg-gradient-to-b from-white/[0.18] to-white/[0.06] border border-white/25 shadow-[0_4px_16px_rgba(250,45,72,0.2)] pointer-events-none"
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
                  className={`relative z-10 text-[10px] tracking-tight mt-0.5 transition-colors ${
                    isActive ? 'font-extrabold text-white' : 'font-semibold text-white/55'
                  }`}
                >
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
