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
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      )
    },
    {
      name: 'Browse',
      path: '/genres',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </svg>
      )
    },
    {
      name: 'Radio',
      path: '/vibe',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.93 4.93a10 10 0 0 1 14.14 0" />
          <path d="M7.76 7.76a6 6 0 0 1 8.48 0" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <path d="M12 14v7" />
        </svg>
      )
    },
    {
      name: 'Library',
      path: '/library',
      icon: (
        <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill="currentColor" />
          <circle cx="18" cy="16" r="3" fill="currentColor" />
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
      <div className="flex items-center gap-2 w-full max-w-md pointer-events-auto">
        {/* Apple Music Floating Island Navigation Capsule (Image 2 Reference) */}
        <div className="flex-1 h-15 rounded-[26px] liquid-glass bg-[#080812]/90 backdrop-blur-3xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.25)] px-1.5 flex items-center justify-around">
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
                  isActive ? 'text-rose-400' : 'text-white/50 hover:text-white/80 active:scale-95'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="mobile-bottom-nav-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-x-1 inset-y-0.5 rounded-2xl bg-white/[0.12] border border-white/20 shadow-sm pointer-events-none"
                    />
                  )}
                  <div
                    className={`relative z-10 transition-transform ${
                      isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]' : ''
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

        {/* Separate Floating Circular Search Button (Image 2 Reference) */}
        <NavLink
          to="/search"
          onClick={() => {
            triggerAndroidHaptic('light');
            setMobileDrawerOpen(false);
          }}
          className={({ isActive }) =>
            `w-14 h-15 rounded-[24px] liquid-glass backdrop-blur-3xl border shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
              isActive
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-[0_0_16px_rgba(244,63,94,0.35)]'
                : 'bg-[#080812]/90 border-white/20 text-white/75 hover:text-white'
            }`
          }
          title="Search"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </NavLink>
      </div>
    </nav>
  );
}
