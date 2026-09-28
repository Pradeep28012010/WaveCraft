import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MiniPlayer from './MiniPlayer';
import CommandPalette from './CommandPalette';
import StudioFXModal from '../player/StudioFXModal';
import { usePlayerStore } from '../../stores/playerStore';
import AnimatedBackground from '../ui/AnimatedBackground';
import YouTubeEmbed from '../player/YouTubeEmbed';
import { useColorExtract } from '../../hooks/useColorExtract';

export default function MainLayout() {
  const location = useLocation();
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const { colors } = useColorExtract(currentTrack?.thumbnail);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden text-white bg-black">
      {/* Background layer */}
      <AnimatedBackground colors={colors} />

      {/* Hidden YouTube & Web Audio DSP Player */}
      <YouTubeEmbed />

      {/* Global Ctrl+K Command Palette & Studio FX / Focus Hub */}
      <CommandPalette />
      <StudioFXModal />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden relative">
          <TopBar />

          <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
            <div className="max-w-7xl mx-auto pb-24">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 14, scale: 0.992, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, scale: 0.996, filter: 'blur(2px)' }}
                  transition={{
                    type: 'spring',
                    stiffness: 310,
                    damping: 30,
                    mass: 0.7
                  }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      {currentTrack && <MiniPlayer />}
    </div>
  );
}
