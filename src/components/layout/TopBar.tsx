import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { searchSuggestions } from '../../services/youtube';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { useJamStore } from '../../stores/jamStore';
import { useStudioStore, STUDIO_FX_MODES } from '../../stores/studioStore';

const formatClock = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const MobileSleepCountdown = memo(function MobileSleepCountdown() {
  const sleepSeconds = useStudioStore((s) => s.sleepSeconds);
  const sleepEndAtTrack = useStudioStore((s) => s.sleepEndAtTrack);
  if (sleepEndAtTrack) return null;
  return <span className="text-[10px] tabular-nums">{formatClock(sleepSeconds)}</span>;
});

const PomodoroTimerPill = memo(function PomodoroTimerPill({
  onOpenStudio
}: {
  onOpenStudio: () => void;
}) {
  const pomodoroMode = useStudioStore((s) => s.pomodoroMode);
  const pomodoroSeconds = useStudioStore((s) => s.pomodoroSeconds);
  return (
    <button
      onClick={onOpenStudio}
      className="hidden md:flex items-center gap-1.5 px-3 h-9 rounded-full bg-amber-500/20 border border-amber-400/40 text-xs font-extrabold text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer tabular-nums"
      title="Focus Pomodoro Timer Active"
    >
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
      <span>
        {pomodoroMode === 'focus' ? 'Focus' : 'Break'} {formatClock(pomodoroSeconds)}
      </span>
    </button>
  );
});

const SleepTimerPill = memo(function SleepTimerPill({
  onOpenStudio
}: {
  onOpenStudio: () => void;
}) {
  const sleepSeconds = useStudioStore((s) => s.sleepSeconds);
  const sleepEndAtTrack = useStudioStore((s) => s.sleepEndAtTrack);
  return (
    <button
      onClick={onOpenStudio}
      className="hidden md:flex items-center gap-1.5 px-3 h-9 rounded-full bg-purple-500/20 border border-purple-400/40 text-xs font-extrabold text-purple-200 hover:bg-purple-500/30 transition-colors cursor-pointer tabular-nums"
      title="Sleep Timer Active — Click to manage"
    >
      <span>🌙</span>
      <span>{sleepEndAtTrack ? 'End of Track' : formatClock(sleepSeconds)}</span>
    </button>
  );
});

export default function TopBar() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  const { isInstalled, showInstallGuide, setShowInstallGuide, triggerInstall } = usePWAInstall();
  const { isPhone, toggleMobileDrawer } = useDevicePreset();
  const roomCode = useJamStore((s) => s.roomCode);

  const fxMode = useStudioStore((s) => s.fxMode);
  const vocalMode = useStudioStore((s) => s.vocalMode);
  const ambientVolumes = useStudioStore((s) => s.ambientVolumes);
  const pomodoroActive = useStudioStore((s) => s.pomodoroActive);
  const sleepActive = useStudioStore((s) => s.sleepActive);
  const setStudioModalOpen = useStudioStore((s) => s.setStudioModalOpen);
  const setCommandPaletteOpen = useStudioStore((s) => s.setCommandPaletteOpen);

  const hasActiveAmbient = Object.values(ambientVolumes).some((v) => v > 0.01);
  const activeFxLabel =
    vocalMode === 'karaoke'
      ? 'Karaoke Mode'
      : vocalMode === 'acapella'
      ? 'Acapella Mode'
      : fxMode !== 'normal'
      ? STUDIO_FX_MODES.find((m) => m.id === fxMode)?.name || 'Studio FX'
      : hasActiveAmbient
      ? 'Ambient Mix'
      : 'Studio FX';

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const toggleVoiceSearch = () => {
    if (isListeningVoice) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListeningVoice(false);
      return;
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      navigate('/search');
      return;
    }

    try {
      const rec = new SpeechRec();
      recognitionRef.current = rec;
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => setIsListeningVoice(true);
      rec.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const cleaned = transcript.trim();
        if (cleaned) {
          setSearchQuery(cleaned);
          navigate(`/search?q=${encodeURIComponent(cleaned)}`);
        }
      };
      rec.onerror = () => setIsListeningVoice(false);
      rec.onend = () => setIsListeningVoice(false);
      rec.start();
    } catch {
      setIsListeningVoice(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      if (val.trim().length > 0) {
        navigate(`/search?q=${encodeURIComponent(val.trim())}`);
        const sugs = await searchSuggestions(val.trim());
        setSuggestions(sugs.slice(0, 5));
      } else {
        setSuggestions([]);
      }
    }, 180);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setShowSuggestions(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleClear = () => {
    setSearchQuery('');
    setSuggestions([]);
    navigate('/search');
  };

  // Phone UI Preset Header (clean, thumb-friendly, zero horizontal crowding)
  if (isPhone) {
    return (
      <header className="h-14 flex items-center justify-between gap-2.5 px-3.5 sticky top-0 z-40 bg-black/65 backdrop-blur-2xl border-b border-white/[0.08]">
        {/* Left: Drawer Trigger + WaveCraft Icon */}
        <button
          onClick={toggleMobileDrawer}
          aria-label="Open Navigation Menu"
          className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] via-rose-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0 active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="16" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>

        {/* Center: Full-Width Mobile Search Bar */}
        <div className="flex-1 relative min-w-0">
          <div className="relative flex items-center">
            <div className="absolute left-3.5 pointer-events-none text-white/45">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              placeholder={
                isListeningVoice ? '🎙️ Say a song or lyric...' : 'Search songs, lyrics, moods...'
              }
              className="w-full liquid-glass rounded-full py-2 pl-9 pr-14 text-xs text-white placeholder-white/45 focus:outline-none focus:border-white/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search query"
                className="absolute right-8 p-1 rounded-full text-white/60 hover:text-white"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              onClick={toggleVoiceSearch}
              aria-label="Voice search"
              title="Voice / Lyric-Line Song Finder"
              className={`absolute right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                isListeningVoice
                  ? 'bg-[var(--color-accent)] text-white animate-pulse shadow-[0_0_12px_var(--color-accent)]'
                  : 'text-white/55 hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-11 glass-heavy rounded-2xl p-1.5 shadow-2xl border border-white/15 z-50">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onMouseDown={() => {
                    const clean = sug.split(' - ')[0];
                    setSearchQuery(clean);
                    navigate(`/search?q=${encodeURIComponent(clean)}`);
                    setShowSuggestions(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-white/85 hover:bg-white/10"
                >
                  <span className="truncate">{sug}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Offline Mode Badge */}
        {!isOnline && (
          <span
            className="h-10 px-2.5 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] font-black flex items-center gap-1.5 flex-shrink-0 animate-pulse"
            title="Offline Mode — Playing from Vault"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Vault</span>
          </span>
        )}

        {/* Right: Studio FX & Sleep Timer Hub Button */}
        <button
          onClick={() => setStudioModalOpen(true)}
          aria-label="Open Studio FX & Sleep Timer Hub"
          className={`h-10 px-3 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 flex-shrink-0 border ${
            fxMode !== 'normal' || vocalMode !== 'normal' || hasActiveAmbient || sleepActive || pomodoroActive
              ? 'bg-gradient-to-r from-[var(--color-accent)] to-purple-600 text-white border-white/25 shadow-lg'
              : 'liquid-glass border-white/15 text-white/90'
          }`}
        >
          <span>{sleepActive ? '🌙' : '🎛️'}</span>
          {sleepActive ? <MobileSleepCountdown /> : null}
        </button>
      </header>
    );
  }

  return (
    <>
      <header className="h-20 flex items-center justify-between px-6 lg:px-8 sticky top-0 z-40 bg-black/25 backdrop-blur-2xl border-b border-white/[0.08]">
        {/* Navigation Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            title="Back"
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={() => navigate(1)}
            aria-label="Go forward"
            title="Forward"
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Liquid Glass Search Pill + Voice Song Finder + Ctrl+K Spotlight Trigger */}
        <div className="flex-1 max-w-xl mx-4 sm:mx-6 relative">
          <div className="relative flex items-center">
            <div className="absolute left-4 pointer-events-none text-white/45">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              placeholder={
                isListeningVoice
                  ? '🎙️ Listening... say a song title, artist, or lyric line...'
                  : 'Search songs, artists, lyrics, or moods...'
              }
              className="w-full liquid-glass rounded-full py-2.5 pl-11 pr-32 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-all duration-300"
            />
            <div className="absolute right-2.5 inset-y-0 flex items-center gap-2">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear search query"
                  title="Clear search"
                  className="w-7 h-7 rounded-full glass-button flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ) : null}
              <button
                type="button"
                onClick={toggleVoiceSearch}
                aria-label={isListeningVoice ? 'Stop voice search' : 'Start voice search'}
                title={
                  isListeningVoice
                    ? 'Stop Voice Search'
                    : 'Voice / Lyric-Line Song Finder (Say a lyric or song title)'
                }
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isListeningVoice
                    ? 'glass-button-primary text-white animate-pulse'
                    : 'glass-button text-white/75 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                title="Open Spotlight Command Palette (Ctrl+K)"
                className="h-7 px-2.5 rounded-full glass-button flex items-center justify-center text-[11px] font-extrabold text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                ⌘K
              </button>
            </div>
          </div>

          {/* Search Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-13 glass-heavy rounded-2xl p-2 shadow-2xl border border-white/15 z-50">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onMouseDown={() => {
                    const clean = sug.split(' - ')[0];
                    setSearchQuery(clean);
                    navigate(`/search?q=${encodeURIComponent(clean)}`);
                    setShowSuggestions(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span className="truncate">{sug}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Offline Mode Indicator */}
          {!isOnline && (
            <span
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-amber-500/20 border border-amber-400/40 text-xs font-extrabold text-amber-200 animate-pulse flex-shrink-0"
              title="No internet connection — Playing tracks saved in Offline Vault"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Offline • Vault Ready</span>
            </span>
          )}

          {/* Active Focus Pomodoro Pill */}
          {pomodoroActive && (
            <PomodoroTimerPill onOpenStudio={() => setStudioModalOpen(true)} />
          )}

          {/* Unified Active Sleep Timer Pill */}
          {sleepActive && (
            <SleepTimerPill onOpenStudio={() => setStudioModalOpen(true)} />
          )}

          {/* Active Jam Room Pill */}
          {roomCode && (
            <button
              onClick={() => navigate('/jam')}
              className="hidden md:flex items-center gap-2 px-3.5 h-9 rounded-full glass-button-emerald text-xs font-extrabold cursor-pointer"
              title="Open Active Jam Room"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{roomCode}</span>
            </button>
          )}

          {/* Unified Studio FX, Ambient Soundscape & Timers Hub Button */}
          <button
            onClick={() => setStudioModalOpen(true)}
            title="Studio Audio FX, Ambient Mixer, Focus & Sleep Timer"
            className={`flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
              fxMode !== 'normal' || hasActiveAmbient || sleepActive
                ? 'glass-button-primary text-white'
                : 'glass-button text-white/90 hover:text-white'
            }`}
          >
            <span>🎛️</span>
            <span className="hidden sm:inline">{activeFxLabel}</span>
          </button>

          {/* Install App (PWA) Button */}
          {!isInstalled && (
            <button
              onClick={triggerInstall}
              title="Install WaveCraft as Desktop / Mobile App"
              className="hidden xl:flex items-center gap-1.5 px-3.5 h-9 rounded-full glass-button text-xs font-bold text-white/90 hover:text-white cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Install App</span>
            </button>
          )}

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-medium text-white/80">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            <span>Studio 320k</span>
          </div>
        </div>
      </header>

      {/* Fallback PWA Install Instructions Modal */}
      {showInstallGuide &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 modal-backdrop-blur backdrop-blur-xl backdrop-saturate-150"
              onClick={() => setShowInstallGuide(false)}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-md rounded-3xl modal-glass-panel backdrop-blur-2xl backdrop-saturate-150 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-white">Install WaveCraft App</h3>
                <button
                  onClick={() => setShowInstallGuide(false)}
                  className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-white/65 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-white/65 leading-relaxed">
                Install WaveCraft as a standalone Desktop or Mobile app for full hardware media-key support (AirPods / Keyboard Play-Pause) and lock-screen controls:
              </p>
              <div className="space-y-2.5 text-xs text-white/85">
                <div className="p-3 rounded-2xl bg-white/[0.06] border border-white/10">
                  <strong className="text-white block mb-0.5">💻 Chrome / Edge / Brave (Desktop):</strong>
                  Click the <strong>Install icon (⊕)</strong> on the right side of your browser address bar, or open the browser menu (⋮) → <strong>Install WaveCraft</strong>.
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.06] border border-white/10">
                  <strong className="text-white block mb-0.5">📱 iOS Safari / Android Chrome:</strong>
                  Tap <strong>Share</strong> (or ⋮ menu) and select <strong>Add to Home Screen</strong>.
                </div>
              </div>
              <button
                onClick={() => setShowInstallGuide(false)}
                className="w-full py-2.5 rounded-full glass-button-primary text-white font-bold text-xs cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
