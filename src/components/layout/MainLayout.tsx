import { Component, Suspense, type ErrorInfo, type ReactNode, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
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
  const { colors } = useColorExtract(currentThumbnail);
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
    useContextMenuStore.getState().openPageMenu(e);
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      className="h-[100dvh] w-screen flex flex-col overflow-hidden text-white bg-black"
    >
      {/* GPU-composited Ambient Background layer */}
      <AnimatedBackground colors={colors} />

      {/* Hidden YouTube & Web Audio DSP Player */}
      <YouTubeEmbed />

      {/* Global Ctrl+K Command Palette, Studio FX & Context Menu */}
      <CommandPalette />
      <StudioFXModal />
      <ContextMenu />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
          <TopBar />

          <main
            ref={mainRef}
            className={`flex-1 overflow-y-auto overflow-x-hidden scroll-smooth will-change-scroll ${
              isPhone ? 'p-3.5' : 'p-6'
            }`}
          >
            <div className="max-w-7xl mx-auto pb-24">
              <RouteErrorBoundary resetKey={location.pathname}>
                <Suspense
                  fallback={
                    <div className="min-h-[55vh] flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-white/15 border-t-[var(--color-accent)] rounded-full animate-spin" />
                    </div>
                  }
                >
                  <Outlet />
                </Suspense>
              </RouteErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      {hasCurrentTrack && <MiniPlayer />}
      <MobileBottomNav />
    </div>
  );
}
