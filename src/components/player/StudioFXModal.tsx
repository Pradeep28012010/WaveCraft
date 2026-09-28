import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useStudioStore,
  STUDIO_FX_MODES,
  AMBIENT_LAYERS,
  type AmbientLayerId
} from '../../stores/studioStore';
import { useSleepTimer } from '../../hooks/useSleepTimer';

export default function StudioFXModal() {
  const {
    fxMode,
    ambientVolumes,
    isStudioModalOpen,
    pomodoroActive,
    pomodoroMode,
    pomodoroSeconds,
    completedSessions,
    setFxMode,
    setAmbientVolume,
    stopAllAmbient,
    setStudioModalOpen,
    startPomodoro,
    stopPomodoro
  } = useStudioStore();

  const {
    isActive: sleepActive,
    timeRemaining: sleepRemaining,
    endAtTrack: sleepEndAtTrack,
    startTimer: startSleepTimer,
    stopTimer: stopSleepTimer,
    setEndAtTrack
  } = useSleepTimer();

  if (typeof document === 'undefined') return null;

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const hasAnyAmbient = Object.values(ambientVolumes).some((v) => v > 0.01);

  return createPortal(
    <AnimatePresence>
      {isStudioModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setStudioModalOpen(false)}
          className="fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-2xl select-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[88vh] overflow-y-auto no-scrollbar rounded-3xl liquid-glass border border-white/20 p-6 sm:p-8 shadow-[0_30px_100px_rgba(0,0,0,0.85)] text-white space-y-8"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-accent)] mb-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-ping" />
                  WAVECRAFT DSP AUDIO WORKSTATION
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Studio Audio FX, Ambient Mixer & Focus Hub
                </h2>
                <p className="text-xs sm:text-sm text-white/60 mt-1">
                  Transform any song in real time with Web Audio DSP, layer cozy ambient soundscapes, or start a Focus session.
                </p>
              </div>
              <button
                onClick={() => setStudioModalOpen(false)}
                className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center text-white/70 hover:text-white cursor-pointer flex-shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Section 1: Real-Time Studio Audio FX */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-white/85 flex items-center gap-2">
                  <span>🎛️ 1-Click Real-Time Audio FX</span>
                  {fxMode !== 'normal' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--color-accent)] text-white">
                      ACTIVE
                    </span>
                  )}
                </h3>
                {fxMode !== 'normal' && (
                  <button
                    onClick={() => setFxMode('normal')}
                    className="text-xs font-bold text-white/55 hover:text-white cursor-pointer"
                  >
                    Reset to Studio Flat
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {STUDIO_FX_MODES.map((mode) => {
                  const active = fxMode === mode.id;
                  return (
                    <motion.button
                      key={mode.id}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setFxMode(mode.id)}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                        active
                          ? 'bg-white/[0.14] border-white/35 shadow-[0_12px_32px_rgba(0,0,0,0.45)]'
                          : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                      }`}
                    >
                      {active && (
                        <div
                          className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${mode.accent}`}
                        />
                      )}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-extrabold text-white">{mode.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                            active
                              ? `bg-gradient-to-r ${mode.accent} text-white shadow`
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {mode.badge}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed">{mode.description}</p>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Procedural Ambient Soundscape Mixer */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-white/85">
                    🌧️ Ambient Soundscape Layer Mixer
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Synthesized live via Web Audio DSP — plays underneath your music or on its own for deep focus.
                  </p>
                </div>
                {hasAnyAmbient && (
                  <button
                    onClick={stopAllAmbient}
                    className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-white/80 cursor-pointer"
                  >
                    Mute All Layers
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {AMBIENT_LAYERS.map((layer) => {
                  const vol = ambientVolumes[layer.id] || 0;
                  const isLayerActive = vol > 0.01;
                  return (
                    <div
                      key={layer.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isLayerActive
                          ? 'bg-emerald-500/12 border-emerald-400/35 shadow-lg'
                          : 'bg-white/[0.04] border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{layer.icon}</span>
                          <div>
                            <div className="text-xs font-extrabold text-white">{layer.name}</div>
                            <div className="text-[10px] text-white/50">{layer.subtitle}</div>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setAmbientVolume(layer.id as AmbientLayerId, isLayerActive ? 0 : 0.45)
                          }
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${
                            isLayerActive
                              ? 'bg-emerald-400 text-black'
                              : 'bg-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          {isLayerActive ? `${Math.round(vol * 100)}%` : 'OFF'}
                        </button>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        value={vol}
                        onChange={(e) =>
                          setAmbientVolume(layer.id as AmbientLayerId, parseFloat(e.target.value))
                        }
                        className="w-full mt-1"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Focus Pomodoro & Sleep Timer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/10">
              {/* Focus Pomodoro Timer */}
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <span>⏱️ Focus Pomodoro Timer</span>
                      {completedSessions > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
                          🔥 {completedSessions} Done
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-white/55 mt-0.5">
                      25-minute deep work intervals with 5-minute recharge breaks.
                    </p>
                  </div>
                  <div className="text-2xl font-black tabular-nums text-[var(--color-accent)]">
                    {formatClock(pomodoroSeconds)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {pomodoroActive ? (
                    <button
                      onClick={stopPomodoro}
                      className="flex-1 py-2.5 rounded-xl bg-red-500/25 border border-red-400/40 text-red-200 text-xs font-extrabold cursor-pointer hover:bg-red-500/35"
                    >
                      Stop {pomodoroMode === 'focus' ? 'Focus' : 'Break'} Timer
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => startPomodoro('focus')}
                        className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-xs font-extrabold cursor-pointer hover:opacity-95 shadow-lg"
                      >
                        Start 25m Focus
                      </button>
                      <button
                        onClick={() => startPomodoro('break')}
                        className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/85 text-xs font-bold cursor-pointer"
                      >
                        5m Break
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Unified Sleep Fade-Out Timer */}
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-extrabold text-white">🌙 Sleep Fade-Out Timer</h4>
                    <p className="text-xs text-white/55 mt-0.5">
                      Smoothly fades out volume and pauses playback when your timer completes.
                    </p>
                  </div>
                  {sleepActive && (
                    <div className="text-base sm:text-xl font-black tabular-nums text-purple-300">
                      {sleepEndAtTrack ? 'End of Song' : formatClock(sleepRemaining)}
                    </div>
                  )}
                </div>

                {sleepActive ? (
                  <button
                    onClick={stopSleepTimer}
                    className="w-full py-2.5 rounded-xl bg-purple-500/25 border border-purple-400/40 text-purple-200 text-xs font-extrabold cursor-pointer hover:bg-purple-500/35"
                  >
                    Cancel Sleep Timer ({sleepEndAtTrack ? 'End of Song' : formatClock(sleepRemaining)})
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {[15, 30, 45, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => startSleepTimer(mins)}
                        className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
                      >
                        {mins}m
                      </button>
                    ))}
                    <button
                      onClick={() => setEndAtTrack(true)}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white/80 cursor-pointer"
                    >
                      End of Song
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
