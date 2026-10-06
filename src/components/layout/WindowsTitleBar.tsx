import { useState, useEffect } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';

interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (isMax: boolean) => void) => () => void;
  updateTrack: (track: { title: string; artist: string }) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export default function WindowsTitleBar() {
  const { isPhone } = useDevicePreset();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      setIsElectron(true);
      window.electronAPI.isMaximized().then(setIsMaximized);
      const unsubscribe = window.electronAPI.onMaximizedChange(setIsMaximized);
      return unsubscribe;
    }
  }, []);

  // Update track in Electron main process / Windows taskbar
  useEffect(() => {
    if (window.electronAPI && currentTrack) {
      window.electronAPI.updateTrack({
        title: currentTrack.title,
        artist: currentTrack.artist
      });
    }
  }, [currentTrack]);

  // Hide on phone screen or native Android APK
  if (isPhone) return null;

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI) {
      window.electronAPI.maximize();
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        setIsMaximized(true);
      } else {
        document.exitFullscreen().catch(() => {});
        setIsMaximized(false);
      }
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.close();
    }
  };

  const handleOpenSearch = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
    );
  };

  return (
    <header className="relative z-50 h-9 w-full bg-[#06060b]/90 border-b border-white/[0.08] backdrop-blur-xl flex items-center justify-between select-none app-region-drag flex-shrink-0">
      {/* Left: Branding & Windows Edition Pill */}
      <div className="flex items-center gap-2.5 px-3">
        {/* Flame / Purple Wave Logo Icon */}
        <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-[var(--color-accent)] to-purple-600 flex items-center justify-center p-0.5 shadow-sm shadow-[var(--color-accent)]/30 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-3.5 h-3.5" fill="none">
            <path
              d="M28 36v28M40 26v48M52 18v64M64 26v48M76 36v28"
              stroke="white"
              strokeWidth="9"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-black tracking-tight text-white/90">
            WaveCraft <span className="text-[var(--color-accent)]">Pro</span>
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-white/[0.07] text-white/60 border border-white/10">
            Windows Studio
          </span>
        </div>
      </div>

      {/* Center: Realtime Track Ticker or Quick Search */}
      <div className="flex-1 flex justify-center max-w-md mx-2 min-w-0">
        {currentTrack ? (
          <div className="app-region-no-drag flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/80 max-w-xs truncate shadow-sm">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'
              }`}
            />
            <span className="truncate">
              <strong>{currentTrack.title}</strong>
              <span className="text-white/50"> — {currentTrack.artist}</span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleOpenSearch}
            className="app-region-no-drag flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] text-white/55 hover:text-white/85 transition-colors cursor-pointer"
            title="Click or press Ctrl+K to open Search"
          >
            <svg className="w-3 h-3 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Search tracks, artists, moods</span>
            <kbd className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/10 text-white/60 border border-white/15">
              Ctrl+K
            </kbd>
          </button>
        )}
      </div>

      {/* Right: Windows 11 Title Bar Caption Buttons */}
      <div className="flex items-center h-full app-region-no-drag">
        {/* Minimize */}
        <button
          type="button"
          onClick={handleMinimize}
          className="w-11 h-9 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Minimize"
          aria-label="Minimize Window"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor">
            <rect y="5.5" width="11" height="1" rx="0.5" />
          </svg>
        </button>

        {/* Maximize / Restore */}
        <button
          type="button"
          onClick={handleMaximize}
          className="w-11 h-9 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title={isMaximized ? 'Restore Down' : 'Maximize'}
          aria-label={isMaximized ? 'Restore Window' : 'Maximize Window'}
        >
          {isMaximized ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2.5" y="0.5" width="8" height="8" rx="1" />
              <path d="M0.5 3.5v7a1 1 0 001 1h7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="1" y="1" width="10" height="10" rx="1" />
            </svg>
          )}
        </button>

        {/* Close (Windows Red Hover Accent) */}
        <button
          type="button"
          onClick={handleClose}
          className="w-11 h-9 flex items-center justify-center text-white/70 hover:text-white hover:bg-[#e81123] transition-colors cursor-pointer"
          title="Close"
          aria-label="Close Window"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" strokeLinecap="round" />
            <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}
