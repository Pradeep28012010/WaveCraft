import { Component, Suspense, lazy, type ErrorInfo, type ReactNode, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import WindowsTitleBar from './WindowsTitleBar';
import MiniPlayer from './MiniPlayer';
import MobileBottomNav from './MobileBottomNav';
import ContextMenu from '../ui/ContextMenu';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import AnimatedBackground from '../ui/AnimatedBackground';
import YouTubeEmbed from '../player/YouTubeEmbed';
import { useColorExtract } from '../../hooks/useColorExtract';
import GlobalDownloadIndicator from '../ui/GlobalDownloadIndicator';
import { useIsKeyboardOpen } from '../../hooks/useIsKeyboardOpen';

const CommandPalette = lazy(() => import('./CommandPalette'));
const StudioFXModal = lazy(() => import('../player/StudioFXModal'));
const FeedbackModal = lazy(() => import('../feedback/FeedbackModal'));
const UpdateModal = lazy(() => import('../updater/UpdateModal'));

function RouteLoadingFallback() {
  return (
    <div className="w-full pt-2 space-y-6 animate-pulse opacity-60">
      <div className="h-8 w-44 rounded-xl bg-white/10" />
      <div className="h-40 w-full rounded-2xl bg-white/5 border border-white/10" />
      <div className="space-y-3 pt-2">
        <div className="h-14 w-full rounded-xl bg-white/5" />
        <div className="h-14 w-full rounded-xl bg-white/5" />
        <div className="h-14 w-full rounded-xl bg-white/5" />
      </div>
    </div>
  );
}

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
        <div className="p-8 rounded-3xl liquid-glass border-0 text-center my-8 space-y-3">
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
  const isKeyboardOpen = useIsKeyboardOpen();
  const isSearch = location.pathname.startsWith('/search');
  const hideMobileBars = isPhone && (isSearch || isKeyboardOpen);

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
      className="h-screen h-[100lvh] w-screen flex flex-col overflow-hidden text-white bg-black"
    >
      {/* GPU-composited Ambient Background layer */}
      <AnimatedBackground colors={colors} palette={palette} />

      {/* Hidden YouTube & Web Audio DSP Player */}
      <YouTubeEmbed />

      {/* Global Ctrl+K Command Palette, Studio FX & Context Menu */}
      <Suspense fallback={null}>
        <CommandPalette />
        <StudioFXModal />
        <FeedbackModal />
        <UpdateModal />
      </Suspense>
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
              <div className={`flex-1 w-full max-w-7xl mx-auto min-w-0 ${
                isPhone
                  ? `px-3.5 pt-2 ${hideMobileBars ? 'pb-8' : (hasCurrentTrack ? 'pb-44' : 'pb-28')}`
                  : `px-6 lg:px-8 pt-4 ${hasCurrentTrack ? 'pb-32' : 'pb-24'}`
              }`}>
                <RouteErrorBoundary resetKey={location.pathname}>
                  <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0, y: 10, scale: 0.995 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full min-w-0"
                  >
                    <Suspense fallback={<RouteLoadingFallback />}>
                      <Outlet />
                    </Suspense>
                  </motion.div>
                </RouteErrorBoundary>
              </div>
            </main>

          </div>
        </div>
      </div>

      {hasCurrentTrack && !hideMobileBars && <MiniPlayer />}
      <GlobalDownloadIndicator />
      {!hideMobileBars && <MobileBottomNav />}
    </div>
  );
}
