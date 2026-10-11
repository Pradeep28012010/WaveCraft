import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { searchSuggestions } from '../../services/youtube';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { useJamStore } from '../../stores/jamStore';
import { useStudioStore, STUDIO_FX_MODES } from '../../stores/studioStore';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { useSearchHistory } from '../../utils/searchHistory';
import { useSettingsStore } from '../../stores/settingsStore';

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
      className="hidden md:flex items-center gap-1.5 px-3 h-9 rounded-full glass-button-amber text-xs font-extrabold hover:scale-105 transition-all cursor-pointer tabular-nums"
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
      className="hidden md:flex items-center gap-1.5 px-3 h-9 rounded-full glass-button-purple text-xs font-extrabold text-purple-200 hover:scale-105 transition-all cursor-pointer tabular-nums"
      title="Sleep Timer Active — Click to manage"
    >
      <span>🌙</span>
      <span>{sleepEndAtTrack ? 'End of Track' : formatClock(sleepSeconds)}</span>
    </button>
  );
});

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { history, saveSearchTerm, clearSearchHistory, removeSearchTerm } = useSearchHistory();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);
  const lastPushedQueryRef = useRef<string>(urlQuery);
  const isFocusedRef = useRef<boolean>(false);

  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSuggestions) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        (desktopSearchRef.current && desktopSearchRef.current.contains(target)) ||
        (mobileSearchRef.current && mobileSearchRef.current.contains(target))
      ) {
        return;
      }
      setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showSuggestions]);

  const { isInstalled, showInstallGuide, setShowInstallGuide, triggerInstall } = usePWAInstall();
  const { isPhone, toggleMobileDrawer } = useDevicePreset();
  const roomCode = useJamStore((s) => s.roomCode);

  const fxMode = useStudioStore((s) => s.fxMode);
  const ambientVolumes = useStudioStore((s) => s.ambientVolumes);
  const pomodoroActive = useStudioStore((s) => s.pomodoroActive);
  const sleepActive = useStudioStore((s) => s.sleepActive);
  const setStudioModalOpen = useStudioStore((s) => s.setStudioModalOpen);

  const hasActiveAmbient = Object.values(ambientVolumes).some((v) => v > 0.01);
  const activeFxLabel =
    fxMode !== 'normal'
      ? STUDIO_FX_MODES.find((m) => m.id === fxMode)?.name || 'Studio FX'
      : hasActiveAmbient
      ? 'Ambient Mix'
      : 'Studio FX';

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const offlineModeOnly = useSettingsStore((s) => s.offlineModeOnly ?? false);
  const toggleOfflineModeOnly = useSettingsStore((s) => s.toggleOfflineModeOnly);

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
    // If the URL query matches what this component pushed, ignore to avoid feedback loop
    if (urlQuery === lastPushedQueryRef.current) {
      return;
    }
    // If the user has the search bar focused and is actively typing, do not clobber their live text
    if (isFocusedRef.current) {
      return;
    }
    setSearchQuery(urlQuery);
    lastPushedQueryRef.current = urlQuery;
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

    type SpeechRecConstructor = new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onstart: (() => void) | null;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
      abort: () => void;
    };

    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: SpeechRecConstructor;
      webkitSpeechRecognition?: SpeechRecConstructor;
    };
    const SpeechRec = windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;
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
      rec.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const cleaned = transcript.trim();
        if (cleaned) {
          lastPushedQueryRef.current = cleaned;
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

    const reqId = ++searchRequestIdRef.current;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = val.trim();
    if (!trimmed) {
      setSuggestions([]);
      setShowSuggestions(false);
      lastPushedQueryRef.current = '';
      navigate('/search', { replace: true });
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      if (reqId !== searchRequestIdRef.current) return;
      lastPushedQueryRef.current = trimmed;
      navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true });
      try {
        const sugs = await searchSuggestions(trimmed);
        if (reqId === searchRequestIdRef.current && isFocusedRef.current) {
          setSuggestions(sugs.slice(0, 5));
          setShowSuggestions(true);
        }
      } catch {
        if (reqId === searchRequestIdRef.current) {
          setSuggestions([]);
        }
      }
    }, 280);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setShowSuggestions(false);
      const trimmed = searchQuery.trim();
      lastPushedQueryRef.current = trimmed;
      if (trimmed) {
        saveSearchTerm(trimmed);
        navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true });
      } else {
        navigate('/search', { replace: true });
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleClear = () => {
    searchRequestIdRef.current++;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    lastPushedQueryRef.current = '';
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    navigate('/search', { replace: true });
  };

  const getMobileTitle = (path: string) => {
    if (path === '/library') return 'Your Library';
    if (path === '/liked') return 'Liked Songs';
    if (path === '/downloads') return 'Offline Vault';
    if (path === '/settings') return 'Settings & Audio EQ';
    if (path === '/recent') return 'Recently Played';
    if (path === '/vibe') return 'AI Vibe DJ Studio';
    if (path === '/dj') return 'DJ Booth Mixer';
    if (path === '/galaxy') return 'Sonic Galaxy Map';
    if (path === '/stats') return 'Listening Stats';
    if (path === '/jam') return 'Live Jam Room';
    if (path.startsWith('/playlist')) return 'Playlist';
    if (path.startsWith('/album')) return 'Album';
    if (path.startsWith('/artist')) return 'Artist';
    return 'WaveCraft';
  };

  // Phone UI Preset: Native App Bar with Pure Liquid Glass Styling
  if (isPhone) {
    const isRoot = location.pathname === '/';
    const isSearch = location.pathname.startsWith('/search');

    return (
      <header
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)'
        }}
        className="flex items-center justify-between gap-2 px-3.5 pb-2.5 sticky top-0 z-40 liquid-glass bg-[#06060b]/85 backdrop-blur-3xl border-b border-white/12 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all"
      >
        {isRoot ? (
          /* Native App Home Bar: WaveCraft Brand + Pro Badge */
          <div className="flex items-center gap-2.5 py-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[var(--color-accent)] to-purple-600 flex items-center justify-center shadow-[0_4px_16px_rgba(250,45,72,0.4)]">
              <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-lg tracking-tight text-white">WaveCraft</span>
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[9px] font-black tracking-wider text-[var(--color-accent)] uppercase">
                PRO
              </span>
            </div>
          </div>
        ) : isSearch ? (
          /* Focused Search Bar on /search page */
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                navigate(-1);
              }}
              aria-label="Go Back"
              className="w-9 h-9 rounded-full liquid-glass border border-white/15 flex items-center justify-center text-white/90 hover:text-white shadow-md flex-shrink-0 active:scale-90 transition-transform cursor-pointer"
            >
              <svg className="w-4.5 h-4.5 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="flex-1 relative min-w-0" ref={mobileSearchRef}>
              <div className="relative flex items-center">
                <div className="absolute left-3 pointer-events-none text-white/40">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <input
                  type="text"
                  autoFocus={!urlQuery}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    isFocusedRef.current = true;
                    setShowSuggestions(true);
                  }}
                  onBlur={() => {
                    isFocusedRef.current = false;
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={
                    isListeningVoice ? '🎙️ Listening...' : 'Search songs, albums, artists...'
                  }
                  className="w-full h-9.5 liquid-glass rounded-full pl-9 pr-14 text-xs text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-all shadow-inner"
                />
                <div className="absolute right-1.5 inset-y-0 flex items-center gap-1">
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={handleClear}
                      aria-label="Clear search"
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white/50 hover:text-white active:scale-90 transition-transform cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={toggleVoiceSearch}
                    aria-label="Voice search"
                    title="Voice search"
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isListeningVoice
                        ? 'bg-[var(--color-accent)] text-white animate-pulse shadow-[0_0_12px_var(--color-accent)]'
                        : 'text-white/50 hover:text-white active:scale-90'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                </div>
              </div>

              {showSuggestions && (
                searchQuery.trim().length > 0 && suggestions.length > 0 ? (
                  <div className="absolute left-0 right-0 top-11.5 bg-[#090a10]/98 backdrop-blur-3xl rounded-2xl p-2 shadow-[0_24px_64px_rgba(0,0,0,0.92)] border border-white/20 z-50">
                    <button
                      onMouseDown={() => {
                        triggerAndroidHaptic('light');
                        navigate(`/vibe?prompt=${encodeURIComponent(searchQuery.trim())}&auto=1`);
                        setShowSuggestions(false);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold text-white glass-button-primary mb-1 cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span>✨</span>
                        <span className="truncate">AI DJ Mix for “{searchQuery.trim()}”</span>
                      </span>
                      <span className="text-[10px] uppercase font-black flex-shrink-0">Mix →</span>
                    </button>
                    {suggestions.map((sug, i) => (
                      <button
                        key={i}
                        onMouseDown={() => {
                          const clean = sug.split(' - ')[0];
                          saveSearchTerm(clean);
                          lastPushedQueryRef.current = clean;
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
                ) : !searchQuery.trim() && history.length > 0 ? (
                  <div className="absolute left-0 right-0 top-11.5 bg-[#090a10]/98 backdrop-blur-3xl rounded-2xl p-2 shadow-[0_24px_64px_rgba(0,0,0,0.92)] border border-white/20 z-50">
                    <div className="flex items-center justify-between px-2.5 py-1 text-[10px] text-white/45 font-bold border-b border-white/10 mb-1">
                      <span>RECENT SEARCHES</span>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          clearSearchHistory();
                        }}
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    {history.slice(0, 5).map((term) => (
                      <div
                        key={term}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-xs text-white/80 hover:bg-white/10 cursor-pointer"
                        onMouseDown={() => {
                          lastPushedQueryRef.current = term;
                          setSearchQuery(term);
                          navigate(`/search?q=${encodeURIComponent(term)}`);
                          setShowSuggestions(false);
                        }}
                      >
                        <span className="truncate">{term}</span>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            removeSearchTerm(term);
                          }}
                          className="text-white/40 hover:text-white px-1 text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null
              )}
            </div>
          </div>
        ) : (
          /* Sub-Page Header with Back Button and Title */
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                navigate(-1);
              }}
              aria-label="Go Back"
              className="w-9 h-9 rounded-full liquid-glass border border-white/15 flex items-center justify-center text-white/90 hover:text-white shadow-md flex-shrink-0 active:scale-90 transition-transform cursor-pointer"
            >
              <svg className="w-4.5 h-4.5 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h1 className="font-extrabold text-base text-white truncate">
              {getMobileTitle(location.pathname)}
            </h1>
          </div>
        )}

        {/* Right Action Icons (Studio FX, Active Timers & Drawer) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(offlineModeOnly || !isOnline) && (
            <button
              onClick={() => {
                triggerAndroidHaptic('medium');
                toggleOfflineModeOnly();
              }}
              className={`h-7 px-2.5 rounded-full text-[10px] font-black flex items-center gap-1 cursor-pointer transition-all ${
                offlineModeOnly
                  ? 'glass-button-emerald text-emerald-200'
                  : 'glass-button-amber text-amber-200 animate-pulse'
              }`}
              title={offlineModeOnly ? "Offline Vault Mode Active — Click to turn off" : "Device offline — Click to toggle Offline Mode"}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${offlineModeOnly ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span>{offlineModeOnly ? 'Vault Only' : 'Vault'}</span>
            </button>
          )}

          {sleepActive && <MobileSleepCountdown />}

          {/* Studio Audio FX & EQ Button */}
          <button
            onClick={() => {
              triggerAndroidHaptic('light');
              setStudioModalOpen(true);
            }}
            aria-label="Open Studio FX"
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 cursor-pointer ${
              fxMode !== 'normal' || hasActiveAmbient || sleepActive || pomodoroActive
                ? 'glass-button-primary text-white shadow-[0_0_12px_rgba(250,45,72,0.4)]'
                : 'glass-button text-white/80 hover:text-white'
            }`}
            title="Studio FX (8D Audio, EQ & Spatial Radar)"
          >
            <svg className="w-4 h-4 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
            </svg>
          </button>

          {/* Mobile Drawer Menu Button (Available on all mobile screens) */}
          <button
            onClick={() => {
              triggerAndroidHaptic('light');
              toggleMobileDrawer();
            }}
            aria-label="Open Navigation Menu"
            className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-transform cursor-pointer"
            title="Menu & Features"
          >
            <svg className="w-4 h-4 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="16" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        </div>
      </header>
    );
  }

  return (
    <>
      <header
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)'
        }}
        className="h-20 flex items-center justify-between px-6 lg:px-8 sticky top-0 z-40 bg-gradient-to-b from-[#06060b]/80 via-[#06060b]/30 to-transparent backdrop-blur-xl transition-all"
      >
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
        <div className="flex-1 max-w-xl mx-4 sm:mx-6 relative" ref={desktopSearchRef}>
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
              onFocus={() => {
                isFocusedRef.current = true;
                setShowSuggestions(true);
              }}
              onBlur={() => {
                isFocusedRef.current = false;
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                isListeningVoice
                  ? '🎙️ Listening... say a song title, artist, or lyric line...'
                  : 'Search songs, artists, lyrics, or moods...'
              }
              className={`w-full liquid-glass rounded-full py-2.5 pl-11 ${
                searchQuery.trim() ? 'pr-44 sm:pr-48' : 'pr-14 sm:pr-16'
              } text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-all duration-300`}
            />
            <div className="absolute right-2.5 inset-y-0 flex items-center gap-2">
              {searchQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    navigate(`/vibe?prompt=${encodeURIComponent(searchQuery.trim())}&auto=1`);
                  }}
                  title="Curate an instant AI DJ Mix from this query"
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full glass-button-primary text-white text-[10px] font-black tracking-wide transition-all cursor-pointer whitespace-nowrap active:scale-95"
                >
                  <span>✨ AI DJ Mix</span>
                </button>
              ) : null}
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
            </div>
          </div>

          {/* Search Suggestions & History Dropdown */}
          {showSuggestions && (
            searchQuery.trim().length > 0 && suggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-13.5 bg-[#090a10]/98 backdrop-blur-3xl rounded-2xl p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.92)] border border-white/20 z-50">
                <button
                  onMouseDown={() => {
                    triggerAndroidHaptic('light');
                    navigate(`/vibe?prompt=${encodeURIComponent(searchQuery.trim())}&auto=1`);
                    setShowSuggestions(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-xs font-bold text-white glass-button-primary mb-1.5 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span>✨</span>
                    <span className="truncate">Curate AI DJ Mix for “{searchQuery.trim()}”</span>
                  </span>
                  <span className="text-[10px] uppercase font-black flex-shrink-0">Launch Mix →</span>
                </button>
                {suggestions.map((sug, i) => (
                  <button
                    key={i}
                    onMouseDown={() => {
                      const clean = sug.split(' - ')[0];
                      saveSearchTerm(clean);
                      lastPushedQueryRef.current = clean;
                      setSearchQuery(clean);
                      navigate(`/search?q=${encodeURIComponent(clean)}`);
                      setShowSuggestions(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm text-white/80 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span className="truncate">{sug}</span>
                  </button>
                ))}
              </div>
            ) : !searchQuery.trim() && history.length > 0 ? (
              <div className="absolute left-0 right-0 top-13.5 bg-[#090a10]/98 backdrop-blur-3xl rounded-2xl p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.92)] border border-white/20 z-50">
                <div className="flex items-center justify-between px-3 py-1.5 text-xs text-white/45 font-bold border-b border-white/10 mb-1">
                  <span>RECENT SEARCHES</span>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      clearSearchHistory();
                    }}
                    className="text-[var(--color-accent)] hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
                {history.slice(0, 6).map((term) => (
                  <div
                    key={term}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm text-white/80 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                    onMouseDown={() => {
                      lastPushedQueryRef.current = term;
                      setSearchQuery(term);
                      navigate(`/search?q=${encodeURIComponent(term)}`);
                      setShowSuggestions(false);
                    }}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="truncate">{term}</span>
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        removeSearchTerm(term);
                      }}
                      className="text-white/40 hover:text-white px-1 text-sm cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Offline Mode Indicator & Instant Toggle */}
          {(offlineModeOnly || !isOnline) && (
            <button
              onClick={() => {
                triggerAndroidHaptic('medium');
                toggleOfflineModeOnly();
              }}
              className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-extrabold transition-all cursor-pointer flex-shrink-0 ${
                offlineModeOnly
                  ? 'glass-button-emerald text-emerald-200'
                  : 'glass-button-amber text-amber-200 animate-pulse'
              }`}
              title={
                offlineModeOnly
                  ? 'Offline Mode Active (Playing strictly from local Vault) — Click to go online'
                  : 'Device is offline — Click to toggle Offline Mode'
              }
            >
              <span className={`w-2 h-2 rounded-full ${offlineModeOnly ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span>{offlineModeOnly ? '⚡ Offline Vault Only' : 'Offline • Vault Ready'}</span>
            </button>
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
