import { useState, useEffect, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useStudioStore, type AmbientLayerId } from '../../stores/studioStore';
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

export const NightstandModal = memo(({ isOpen, onClose }: NightstandModalProps) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);

  const {
    sleepActive,
    sleepSeconds,
    sleepEndAtTrack,
    startSleepTimer,
    stopSleepTimer,
    ambientVolumes,
    setAmbientVolume
  } = useStudioStore();

  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');
  const [dimmerLevel, setDimmerLevel] = useState<0.25 | 0.5 | 0.75 | 1.0>(0.5);
  const [activeAmbientTab, setActiveAmbientTab] = useState<AmbientLayerId | null>(null);

  // Live real-time clock updating every second
  useEffect(() => {
    if (!isOpen) return;
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
      );
      setCurrentDateStr(
        now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const sleepRemainingFormatted = useMemo(() => {
    if (!sleepActive) return null;
    if (sleepEndAtTrack) return 'Ends after track';
    const mins = Math.ceil(sleepSeconds / 60);
    return `${mins}m remaining`;
  }, [sleepActive, sleepEndAtTrack, sleepSeconds]);

  if (!isOpen) return null;

  const artSrc = currentTrack?.thumbnailLarge || currentTrack?.thumbnail || DEFAULT_THUMBNAIL;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-[110] bg-[#020205] text-white flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden"
        style={{
          filter:
            dimmerLevel === 0.25
              ? 'brightness(0.38) contrast(0.95)'
              : dimmerLevel === 0.5
              ? 'brightness(0.65)'
              : dimmerLevel === 0.75
              ? 'brightness(0.85)'
              : 'none'
        }}
      >
        {/* Subtle Ambient Glow Behind Clock */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-lg h-72 rounded-full blur-[140px] pointer-events-none opacity-20"
          style={{ background: 'radial-gradient(circle, #38bdf8 0%, #a855f7 50%, transparent 80%)' }}
        />

        {/* Top Bar: Dimmer Modes & Exit Button */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 rounded-full liquid-glass border-0 bg-white/[0.04]">
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                setDimmerLevel(0.25);
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                dimmerLevel === 0.25 ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
              title="Moonlight (Ultra Dim for Sleep)"
            >
              🌙 Dim
            </button>
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                setDimmerLevel(0.5);
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                dimmerLevel === 0.5 ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
            >
              Bedside
            </button>
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                setDimmerLevel(1.0);
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                dimmerLevel === 1.0 ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
            >
              Bright
            </button>
          </div>

          <button
            onClick={() => {
              triggerAndroidHaptic('light');
              onClose();
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center liquid-glass border-0 bg-white/[0.06] hover:bg-white/[0.14] text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
            title="Exit Nightstand Mode"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Center: OLED Bedside Clock & Sleep Counter */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto">
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tight font-mono text-white drop-shadow-[0_4px_24px_rgba(255,255,255,0.18)]"
          >
            {currentTimeStr || '12:00'}
          </motion.div>
          <div className="text-sm sm:text-lg font-medium text-white/50 mt-2 sm:mt-3 tracking-wide">
            {currentDateStr}
          </div>

          {/* Sleep Timer Bar */}
          <div className="mt-5 flex items-center gap-2">
            {sleepActive ? (
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full liquid-glass border-0 bg-purple-500/20 text-purple-200 text-xs sm:text-sm font-semibold shadow-[0_0_20px_rgba(168,85,247,0.25)]">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span>Sleep: {sleepRemainingFormatted}</span>
                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    stopSleepTimer();
                  }}
                  className="ml-1 text-white/50 hover:text-white cursor-pointer"
                  title="Cancel Sleep Timer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 p-1 rounded-full liquid-glass border-0 bg-white/[0.04]">
                <span className="text-[11px] font-semibold text-white/40 px-2.5">Sleep:</span>
                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    startSleepTimer(15);
                  }}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                >
                  15m
                </button>
                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    startSleepTimer(30);
                  }}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                >
                  30m
                </button>
                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    startSleepTimer(45);
                  }}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                >
                  45m
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bedside Console: Ambient Mixer + Mini Player Capsule */}
        <div className="relative z-10 w-full max-w-xl mx-auto flex flex-col gap-4">
          {/* Quick Ambient Soundscape Layer Mixer */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            {AMBIENT_ICONS.map((layer) => {
              const vol = ambientVolumes[layer.id] || 0;
              const isActive = vol > 0;
              return (
                <div key={layer.id} className="relative flex flex-col items-center">
                  <button
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      if (isActive) {
                        setAmbientVolume(layer.id, 0);
                        if (activeAmbientTab === layer.id) setActiveAmbientTab(null);
                      } else {
                        setAmbientVolume(layer.id, 0.45);
                        setActiveAmbientTab(layer.id);
                      }
                    }}
                    className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all ${
                      isActive
                        ? 'bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
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
                </div>
              );
            })}
          </div>

          {/* Bedside Music Capsule */}
          {currentTrack && (
            <div className="p-3 sm:p-4 rounded-2xl liquid-glass border-0 bg-white/[0.05] backdrop-blur-2xl flex items-center justify-between gap-3 shadow-2xl">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 relative bg-black/60 shadow-md">
                  <img
                    src={artSrc}
                    alt={currentTrack.title}
                    className={`w-full h-full object-cover ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '8s' }}
                  />
                  <div className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-zinc-950 border border-white/20" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">{currentTrack.title}</h4>
                  <p className="text-xs text-white/50 truncate">{currentTrack.artist}</p>
                </div>
              </div>

              {/* Minimal Bedside Controls */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    prevTrack();
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white active:scale-80 transition-transform cursor-pointer"
                  title="Previous"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                  </svg>
                </button>

                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    togglePlay();
                  }}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-bold shadow-lg active:scale-90 transition-transform cursor-pointer"
                  title={isPlaying ? 'Pause' : 'Play'}
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
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    nextTrack();
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white active:scale-80 transition-transform cursor-pointer"
                  title="Next"
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
    </AnimatePresence>
  );
});

NightstandModal.displayName = 'NightstandModal';
export default NightstandModal;
