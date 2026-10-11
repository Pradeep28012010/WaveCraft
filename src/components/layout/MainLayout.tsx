import { Component, Suspense, type ErrorInfo, type ReactNode, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import WindowsTitleBar from './WindowsTitleBar';
import MiniPlayer from './MiniPlayer';
import MobileBottomNav from './MobileBottomNav';
import CommandPalette from './CommandPalette';
import StudioFXModal from '../player/StudioFXModal';
import ContextMenu from '../ui/ContextMenu';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import AnimatedBackground from '../ui/AnimatedBackground';
import YouTubeEmbed from '../player/YouTubeEmbed';
import { useColorExtract } from '../../hooks/useColorExtract';
import GradualBlur from '../ui/GradualBlur';

class RouteErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route render error caught by RouteErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 rounded-3xl liquid-glass border border-white/15 text-center my-8 space-y-3">
          <h3 className="text-lg font-extrabold text-white">Refreshing Studio View...</h3>
          <p className="text-xs text-white/60">
            Click below to reload this view without interrupting your music.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 rounded-full bg-[var(--color-accent)] text-white text-xs font-extrabold cursor-pointer"
          >
            Reload View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MainLayout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const hasCurrentTrack = usePlayerStore((s) => Boolean(s.currentTrack));
  const currentThumbnail = usePlayerStore((s) => s.currentTrack?.thumbnail);
  const { palette, colors } = useColorExtract(currentThumbnail);
  const { isPhone } = useDevicePreset();

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (e.shiftKey) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }
    e.preventDefault();
    const clientX = e.clientX;
    const clientY = e.clientY;
    useContextMenuStore.getState().openPageMenu({ clientX, clientY });
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      className="h-[100dvh] w-screen flex flex-col overflow-hidden text-white bg-black"
    >
      {/* GPU-composited Ambient Background layer */}
      <AnimatedBackground colors={colors} palette={palette} />

      {/* Hidden YouTube & Web Audio DSP Player */}
      <YouTubeEmbed />

      {/* Global Ctrl+K Command Palette, Studio FX & Context Menu */}
      <CommandPalette />
      <StudioFXModal />
      <ContextMenu />

      {/* Windows 11 Acrylic Frameless Title Bar (Desktop / Electron) */}
      <WindowsTitleBar />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />

        <div className="flex-1 overflow-hidden relative min-w-0 flex flex-col">
          {/* Pinned TopBar - Stays fixed and visible at the top during scrolls */}
          <TopBar />

          <div className="relative flex-1 overflow-hidden min-h-0">
            <main
              ref={mainRef}
              className="h-full overflow-y-auto overflow-x-hidden overscroll-y-contain flex flex-col"
            >
              <div className={`flex-1 w-full max-w-7xl mx-auto ${
                isPhone
                  ? `px-3.5 pt-2 ${hasCurrentTrack ? 'pb-44' : 'pb-28'}`
                  : `px-6 lg:px-8 pt-4 ${hasCurrentTrack ? 'pb-32' : 'pb-24'}`
              }`}>
                <RouteErrorBoundary resetKey={location.pathname}>
                  <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.12 }}
                    className="w-full"
                  >
                    <Suspense
                      fallback={
                        <div className="min-h-[55vh] flex items-center justify-center">
                          <div className="w-8 h-8 border-2 border-white/15 border-t-[var(--color-accent)] rounded-full animate-spin" />
                        </div>
                      }
                    >
                      <Outlet />
                    </Suspense>
                  </motion.div>
                </RouteErrorBoundary>
              </div>
            </main>

            {/* React Bits GradualBlur: Smooth mathematical edge blur underneath TopBar without milky/whitened bands */}
            <GradualBlur
              target="parent"
              position="top"
              height={isPhone ? '0.75rem' : '2.25rem'}
              strength={isPhone ? 0.8 : 1.5}
              divCount={isPhone ? 3 : 5}
              curve="bezier"
              exponential={true}
              opacity={isPhone ? 0.6 : 1}
            />

            {/* React Bits GradualBlur: Smooth mathematical edge blur above MiniPlayer dock */}
            <GradualBlur
              target="parent"
              position="bottom"
              height={hasCurrentTrack ? (isPhone ? '4.5rem' : '3.5rem') : '1.5rem'}
              strength={1.5}
              divCount={5}
              curve="bezier"
              exponential={true}
              opacity={1}
            />
          </div>
        </div>
      </div>

      {hasCurrentTrack && <MiniPlayer />}
      <MobileBottomNav />
    </div>
  );
}
