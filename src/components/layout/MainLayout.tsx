import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MiniPlayer from './MiniPlayer';
import MobileBottomNav from './MobileBottomNav';
import CommandPalette from './CommandPalette';
import StudioFXModal from '../player/StudioFXModal';
import { usePlayerStore } from '../../stores/playerStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import AnimatedBackground from '../ui/AnimatedBackground';
import YouTubeEmbed from '../player/YouTubeEmbed';
import { useColorExtract } from '../../hooks/useColorExtract';

export default function MainLayout() {
  const location = useLocation();
  const hasCurrentTrack = usePlayerStore((s) => Boolean(s.currentTrack));
  const currentThumbnail = usePlayerStore((s) => s.currentTrack?.thumbnail);
  const { colors } = useColorExtract(currentThumbnail);
  const { isPhone } = useDevicePreset();

  return (
    <div className="h-[100dvh] w-screen flex flex-col overflow-hidden text-white bg-black">
      {/* GPU-composited Ambient Background layer */}
      <AnimatedBackground colors={colors} />

      {/* Hidden YouTube & Web Audio DSP Player */}
      <YouTubeEmbed />

      {/* Global Ctrl+K Command Palette & Studio FX / Focus Hub */}
      <CommandPalette />
      <StudioFXModal />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
          <TopBar />

          <main
            className={`flex-1 overflow-y-auto scroll-smooth will-change-scroll ${
              isPhone ? 'p-3.5' : 'p-6'
            }`}
          >
            <div className="max-w-7xl mx-auto pb-24">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10, scale: 0.994 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.997 }}
                  transition={{
                    type: 'spring',
                    stiffness: 380,
                    damping: 32,
                    mass: 0.6
                  }}
                  className="will-change-transform"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      {hasCurrentTrack && <MiniPlayer />}
      <MobileBottomNav />
    </div>
  );
}
