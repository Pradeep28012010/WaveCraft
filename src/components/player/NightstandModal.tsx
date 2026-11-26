import { useState, useEffect, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useStudioStore, type AmbientLayerId } from '../../stores/studioStore';
import { useJamStore } from '../../stores/jamStore';
import { isJamGuestBlocked } from '../../services/jamAuthority';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

interface NightstandModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AMBIENT_ICONS: Array<{ id: AmbientLayerId; icon: string; label: string }> = [
  { id: 'rain', icon: '🌧️', label: 'Rain' },
  { id: 'waves', icon: '🌊', label: 'Ocean' },
  { id: 'cafe', icon: '☕', label: 'Cafe' },
  { id: 'vinyl', icon: '📻', label: 'Vinyl' },
  { id: 'binaural', icon: '🧠', label: '40Hz' },
  { id: 'campfire', icon: '🔥', label: 'Fire' }
];

const DIMMER_MODES: Array<{ value: 0.25 | 0.5 | 1.0; label: string; icon: string; title: string }> = [
  { value: 0.25, label: 'Moonlight', icon: '🌙', title: 'Ultra Dim for Sleep' },
  { value: 0.5, label: 'Bedside', icon: '🕯️', title: 'Balanced Nightstand Brightness' },
  { value: 1.0, label: 'Bright', icon: '✨', title: 'Full Brightness' }
];

export const NightstandModal = memo(({ isOpen, onClose }: NightstandModalProps) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);

  const jamRoomCode = useJamStore((s) => s.roomCode);
  const jamIsHost = useJamStore((s) => s.isHost);
  const isJamGuest = Boolean(jamRoomCode && !jamIsHost) || isJamGuestBlocked('play');

  const {
    sleepActive,
    sleepSeconds,
    sleepEndAtTrack,
    startSleepTimer,
    stopSleepTimer,
    setSleepEndAtTrack,
    ambientVolumes,
    setAmbientVolume
  } = useStudioStore();

  const [hoursMinsStr, setHoursMinsStr] = useState('12:00');
  const [secondsStr, setSecondsStr] = useState('00');
  const [ampmStr, setAmpmStr] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');
  const [use24Hour, setUse24Hour] = useState(false);
  const [dimmerLevel, setDimmerLevel] = useState<0.25 | 0.5 | 0.75 | 1.0>(0.5);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Live real-time clock updating every second
  useEffect(() => {
    if (!isOpen) return;
    const updateTime = () => {
      const now = new Date();
      let h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      if (use24Hour) {
        setHoursMinsStr(`${String(h).padStart(2, '0')}:${m}`);
        setAmpmStr('');
      } else {
        const period = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        setHoursMinsStr(`${String(h).padStart(2, '0')}:${m}`);
        setAmpmStr(period);
      }
      setSecondsStr(s);
      setCurrentDateStr(
        now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [isOpen, use24Hour]);

  const sleepRemainingFormatted = useMemo(() => {
    if (!sleepActive) return null;
    if (sleepEndAtTrack) return 'Ends after track';
    const mins = Math.floor(sleepSeconds / 60);
    const secs = sleepSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }, [sleepActive, sleepEndAtTrack, sleepSeconds]);

  const artSrc = currentTrack?.thumbnailLarge || currentTrack?.thumbnail || DEFAULT_THUMBNAIL;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Nightstand Clock Mode"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[9996] bg-[#020205] text-white flex flex-col justify-between p-5 sm:p-10 select-none overflow-hidden"
          style={{
            filter:
              dimmerLevel === 0.25
                ? 'brightness(0.38) contrast(0.95)'
                : dimmerLevel === 0.5
                ? 'brightness(0.68)'
                : dimmerLevel === 0.75
                ? 'brightness(0.86)'
                : 'none'
          }}
        >
          {/* Ambient OLED Aurora Behind Clock */}
          <div
            className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-2xl h-80 rounded-full blur-[150px] pointer-events-none transition-opacity duration-1000 ${
              isPlaying ? 'opacity-25' : 'opacity-15'
            }`}
            style={{ background: 'radial-gradient(circle, #38bdf8 0%, #a855f7 50%, transparent 80%)' }}
          />

          {/* Top Bar: Liquid Glass Dimmer Modes, 12h/24h & Exit */}
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 rounded-full liquid-glass border-0 bg-white/[0.04] relative">
                {DIMMER_MODES.map((mode) => {
                  const active = dimmerLevel === mode.value;
                  return (
                    <button
                      key={mode.label}
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setDimmerLevel(mode.value);
                      }}
                      title={mode.title}
                      className={`relative px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 z-10 ${
                        active ? 'text-white' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="nightstand-dimmer-pill"
                          transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
                          className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                        />
                      )}
                      <span className="relative z-10">{mode.icon}</span>
                      <span className="relative z-10 hidden sm:inline">{mode.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setUse24Hour((prev) => !prev);
                }}
                className="px-3 py-1.5 rounded-full liquid-glass border-0 bg-white/[0.04] hover:bg-white/[0.09] text-xs font-mono font-bold text-white/65 hover:text-white cursor-pointer transition"
                title="Toggle 12-hour / 24-hour clock"
              >
                {use24Hour ? '24H' : '12H'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                onClose();
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center liquid-glass border-0 bg-white/[0.06] hover:bg-white/[0.14] text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
              title="Exit Nightstand Mode (Esc)"
              aria-label="Exit Nightstand Mode"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Center: OLED StandBy Clock & Sleep Sanctuary */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto px-2">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="flex items-baseline justify-center gap-2 sm:gap-3"
            >
              <span className="text-6xl sm:text-8xl md:text-[7.5rem] leading-none font-black tracking-tight font-mono tabular-nums text-white drop-shadow-[0_6px_32px_rgba(255,255,255,0.16)]">
                {hoursMinsStr}
              </span>
              <div className="flex flex-col items-start justify-end pb-1 sm:pb-3">
                {ampmStr && (
                  <span className="text-sm sm:text-xl font-black tracking-widest text-white/60 font-mono">
                    {ampmStr}
                  </span>
                )}
                <span className="text-lg sm:text-2xl font-bold text-cyan-300/60 font-mono tabular-nums">
                  {secondsStr}
                </span>
              </div>
            </motion.div>

            <div className="mt-3 inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-xs sm:text-sm font-medium text-white/60 tracking-wide">
              <span>{currentDateStr}</span>
            </div>

            {/* Sleep Timer Bar */}
            <div className="mt-6 flex items-center justify-center">
              {sleepActive ? (
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-full liquid-glass border border-purple-400/30 bg-purple-500/15 text-purple-100 text-xs sm:text-sm font-semibold shadow-[0_0_24px_rgba(168,85,247,0.25)]">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span className="font-mono tabular-nums">Sleep in {sleepRemainingFormatted}</span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      stopSleepTimer();
                    }}
                    className="ml-1 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[10px] text-white/80 hover:text-white cursor-pointer transition"
                    title="Cancel Sleep Timer"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 p-1 rounded-full liquid-glass border-0 bg-white/[0.04] flex-wrap justify-center">
                  <span className="text-[11px] font-semibold text-white/45 px-2.5">🌙 Sleep</span>
                  {[15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        startSleepTimer(mins);
                      }}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold text-white/75 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                    >
                      {mins}m
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setSleepEndAtTrack(true);
                    }}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold text-white/75 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                  >
                    End of Track
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Bedside Console: Ambient Mixer + Mini Player Capsule */}
          <div className="relative z-10 w-full max-w-xl mx-auto flex flex-col gap-4">
            {/* Quick Ambient Soundscape Layer Mixer */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {AMBIENT_ICONS.map((layer) => {
                const vol = ambientVolumes[layer.id] || 0;
                const isActive = vol > 0;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      if (isActive) {
                        setAmbientVolume(layer.id, 0);
                      } else {
                        setAmbientVolume(layer.id, 0.45);
                      }
                    }}
                    className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all ${
                      isActive
                        ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.28)]'
                        : 'liquid-glass border-0 bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <span>{layer.icon}</span>
                    <span className="hidden sm:inline">{layer.label}</span>
                    {isActive && (
                      <span className="text-[10px] text-emerald-300 font-mono">
                        {Math.round(vol * 100)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bedside Music Capsule */}
            {currentTrack && (
              <div className="p-3 sm:p-4 rounded-3xl liquid-glass border border-white/10 bg-white/[0.05] backdrop-blur-2xl flex items-center justify-between gap-3 shadow-2xl">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 relative bg-black/60 shadow-md ring-1 ring-white/15">
                    <img
                      src={artSrc}
                      alt={currentTrack.title}
                      className={`w-full h-full object-cover ${isPlaying ? 'animate-spin' : ''}`}
                      style={{ animationDuration: '8s' }}
                    />
                    <div className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-zinc-950 border border-white/25" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{currentTrack.title}</h4>
                    <p className="text-xs text-white/55 truncate">{currentTrack.artist}</p>
                  </div>
                </div>

                {/* Minimal Bedside Controls */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <button
                    type="button"
                    disabled={isJamGuest}
                    onClick={() => {
                      if (isJamGuest) return;
                      triggerAndroidHaptic('light');
                      prevTrack();
                    }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition ${
                      isJamGuest ? 'opacity-35 cursor-not-allowed' : 'active:scale-85 cursor-pointer'
                    }`}
                    title={isJamGuest ? 'Host controls playback in Jam' : 'Previous'}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    disabled={isJamGuest}
                    onClick={() => {
                      if (isJamGuest) return;
                      triggerAndroidHaptic('light');
                      togglePlay();
                    }}
                    className={`w-11 h-11 rounded-full bg-white text-black flex items-center justify-center font-bold shadow-lg transition ${
                      isJamGuest ? 'opacity-40 cursor-not-allowed' : 'active:scale-90 hover:scale-105 cursor-pointer'
                    }`}
                    title={isJamGuest ? 'Host controls playback in Jam' : isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <rect x="6" y="5" width="4" height="14" rx="1.5" />
                        <rect x="14" y="5" width="4" height="14" rx="1.5" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 fill-current translate-x-0.5" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isJamGuest}
                    onClick={() => {
                      if (isJamGuest) return;
                      triggerAndroidHaptic('light');
                      nextTrack();
                    }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition ${
                      isJamGuest ? 'opacity-35 cursor-not-allowed' : 'active:scale-85 cursor-pointer'
                    }`}
                    title={isJamGuest ? 'Host controls playback in Jam' : 'Next'}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
});

NightstandModal.displayName = 'NightstandModal';
export default NightstandModal;
