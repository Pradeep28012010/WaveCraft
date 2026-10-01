import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useStudioStore,
  STUDIO_FX_MODES,
  AMBIENT_LAYERS,
  type AmbientLayerId,
  type VocalStemMode
} from '../../stores/studioStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useSleepTimer } from '../../hooks/useSleepTimer';
import { getAudioFrequencyData } from '../../services/audioEngine';

const VOCAL_STEM_MODES: Array<{
  id: VocalStemMode;
  name: string;
  icon: string;
  badge: string;
  desc: string;
  accent: string;
}> = [
  {
    id: 'normal',
    name: 'Full Studio Mix',
    icon: '🎚️',
    badge: 'VOCALS + INST',
    desc: 'Original bit-accurate 320kbps stereo master with full lead vocals and instrumentation.',
    accent: 'from-emerald-400 to-teal-500'
  },
  {
    id: 'karaoke',
    name: 'Karaoke Vocal Remover',
    icon: '🎤',
    badge: 'INSTRUMENTAL',
    desc: 'Strips center-panned lead vocals in real time via Mid/Side phase cancellation while preserving <155Hz sub-bass.',
    accent: 'from-rose-500 to-pink-600'
  },
  {
    id: 'acapella',
    name: 'Acapella Vocal Isolate',
    icon: '✨',
    badge: 'LEAD VOCAL',
    desc: 'Spotlights human vocal fundamentals & 1.65kHz formant harmonics while attenuating deep sub-bass and cymbals.',
    accent: 'from-violet-500 to-fuchsia-600'
  }
];

const AMBIENT_SCENE_PRESETS: Array<{
  id: string;
  label: string;
  icon: string;
  mix: Partial<Record<AmbientLayerId, number>>;
}> = [
  {
    id: 'rainy-vinyl',
    label: 'Rainy Vinyl Loft',
    icon: '🌧️',
    mix: { rain: 0.5, vinyl: 0.35 }
  },
  {
    id: 'campfire-coast',
    label: 'Coastal Campfire',
    icon: '🔥',
    mix: { campfire: 0.55, waves: 0.28 }
  },
  {
    id: 'study-cafe',
    label: 'Deep Focus Cafe',
    icon: '☕',
    mix: { cafe: 0.45, binaural: 0.35, rain: 0.22 }
  },
  {
    id: 'ocean-sleep',
    label: 'Ocean Sleep Sanctuary',
    icon: '🌊',
    mix: { waves: 0.55, rain: 0.25 }
  }
];

type StudioTab = 'presets' | 'mastering' | 'spatial' | 'ambient' | 'all';

function StudioFXModalContent() {
  const {
    fxMode,
    vocalMode,
    spatialOrbitAuto,
    spatialOrbitSpeed,
    spatialRoomSize,
    spatialManualPos,
    subBassBoost,
    harmonicDrive,
    stereoWidth,
    reverbMix,
    trebleAir,
    preservePitch,
    ambientVolumes,
    pomodoroActive,
    pomodoroMode,
    pomodoroSeconds,
    completedSessions,
    setFxMode,
    setVocalMode,
    setSpatialOrbitAuto,
    setSpatialOrbitSpeed,
    setSpatialRoomSize,
    setSpatialManualPos,
    setSubBassBoost,
    setHarmonicDrive,
    setStereoWidth,
    setReverbMix,
    setTrebleAir,
    setPreservePitch,
    resetMasteringRack,
    setAmbientVolume,
    applyAmbientPreset,
    stopAllAmbient,
    setStudioModalOpen,
    startPomodoro,
    stopPomodoro
  } = useStudioStore();

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = usePlayerStore((s) => s.setPlaybackSpeed);

  const {
    isActive: sleepActive,
    timeRemaining: sleepRemaining,
    endAtTrack: sleepEndAtTrack,
    startTimer: startSleepTimer,
    stopTimer: stopSleepTimer,
    setEndAtTrack
  } = useSleepTimer();

  const [activeTab, setActiveTab] = useState<StudioTab>('presets');
  const radarRef = useRef<HTMLDivElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDraggingRadar, setIsDraggingRadar] = useState(false);
  const [liveOrbitAngle, setLiveOrbitAngle] = useState(0);

  // Live 60fps Real-Time Mastering Spectrum & Stereo Level Telemetry Canvas
  useEffect(() => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const freqData = new Uint8Array(64);
    let raf = 0;
    let phase = 0;

    const renderSpectrum = () => {
      phase += 0.045;
      const hasLive = getAudioFrequencyData(freqData);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = 36;
      const gap = 3;
      const barW = (w - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        let norm = 0.08;
        if (hasLive) {
          const bin = Math.min(freqData.length - 1, Math.floor((i / barCount) * 42));
          norm = Math.max(0.08, freqData[bin] / 255);
        } else if (isPlaying) {
          norm =
            0.18 +
            0.35 * Math.abs(Math.sin(phase + i * 0.28)) * Math.cos(phase * 0.6 - i * 0.12);
        }

        const barH = Math.max(4, norm * (h - 6));
        const x = i * (barW + gap);
        const y = h - barH;

        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, 'rgba(250, 45, 72, 0.85)');
        grad.addColorStop(0.55, 'rgba(168, 85, 247, 0.9)');
        grad.addColorStop(1, 'rgba(34, 211, 238, 0.95)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(renderSpectrum);
    };

    raf = requestAnimationFrame(renderSpectrum);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // Animate the live 360° orbit indicator on the radar pad when Auto-Orbit is active
  useEffect(() => {
    if (!spatialOrbitAuto) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setLiveOrbitAngle((prev) => (prev + dt * spatialOrbitSpeed * Math.PI * 2) % (Math.PI * 2));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spatialOrbitAuto, spatialOrbitSpeed]);

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const updateRadarPosFromPointer = (clientX: number, clientY: number) => {
    if (!radarRef.current) return;
    const rect = radarRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2 - 14;
    let dx = (clientX - cx) / radius;
    let dz = (clientY - cy) / radius;
    const dist = Math.hypot(dx, dz);
    if (dist > 1) {
      dx /= dist;
      dz /= dist;
    }
    if (fxMode !== '8d-orbit') {
      setFxMode('8d-orbit');
    }
    if (spatialOrbitAuto) {
      setSpatialOrbitAuto(false);
    }
    setSpatialManualPos({ x: dx, z: dz });
  };

  const orbX = spatialOrbitAuto ? Math.sin(liveOrbitAngle) * 0.78 : spatialManualPos.x;
  const orbZ = spatialOrbitAuto ? -Math.cos(liveOrbitAngle) * 0.78 : spatialManualPos.z;
  const azimuthDeg = Math.round(((Math.atan2(orbX, -orbZ) * 180) / Math.PI + 360) % 360);
  const distanceMeters = (Math.hypot(orbX, orbZ) * 2.5).toFixed(2);
  const leftEarLevel = Math.round(Math.min(100, Math.max(18, 72 - orbX * 38)));
  const rightEarLevel = Math.round(Math.min(100, Math.max(18, 72 + orbX * 38)));
  const stageZoneLabel =
    azimuthDeg >= 315 || azimuthDeg < 45
      ? 'Front Center Stage'
      : azimuthDeg < 135
      ? 'Right Acoustic Wing'
      : azimuthDeg < 225
      ? 'Rear Surround Halo'
      : 'Left Acoustic Wing';

  const hasAnyAmbient = Object.values(ambientVolumes).some((v) => v > 0.01);
  const hasCustomRack =
    subBassBoost > 0 ||
    harmonicDrive > 0.01 ||
    stereoWidth > 0.01 ||
    reverbMix > 0.01 ||
    Math.abs(trebleAir) > 0.1 ||
    playbackSpeed !== 1;

  const handleResetAllDSP = () => {
    setFxMode('normal');
    setVocalMode('normal');
    resetMasteringRack();
    setPlaybackSpeed(1);
    stopAllAmbient();
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6 select-none">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        onClick={() => setStudioModalOpen(false)}
        className="absolute inset-0 modal-backdrop-blur backdrop-blur-xl backdrop-saturate-150"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-5xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-3xl modal-glass-panel backdrop-blur-2xl backdrop-saturate-150 p-5 sm:p-7 text-white space-y-5"
      >
        {/* ================= MASTERING WORKSTATION TOP BAR ================= */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/12">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[10px] font-black uppercase tracking-widest text-[var(--color-accent)] whitespace-nowrap flex-shrink-0 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-ping" />
                64-BIT DSP STUDIO RACK
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-extrabold text-emerald-300 whitespace-nowrap flex-shrink-0">
                -0.8 dBTP Brickwall
              </span>
              {vocalMode !== 'normal' && (
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-[10px] font-extrabold text-purple-200 uppercase whitespace-nowrap flex-shrink-0">
                  Stem: {vocalMode}
                </span>
              )}
              {fxMode !== 'normal' && (
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-[10px] font-extrabold text-cyan-200 uppercase whitespace-nowrap flex-shrink-0">
                  FX: {STUDIO_FX_MODES.find((m) => m.id === fxMode)?.name}
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-white via-rose-100 to-cyan-200 bg-clip-text text-transparent truncate">
              Studio FX & Analog Mastering Console
            </h2>
            <p className="text-xs text-white/55 leading-relaxed">
              Zero-latency Web Audio mastering chain: 2x oversampled tube warmth, HRTF 360° soundstage, Mid/Side vocal isolation, and 6-channel soundscapes.
            </p>
          </div>

          {/* Right: Live 60fps Audio Spectrum Monitor + Master Actions */}
          <div className="flex items-center gap-2.5 self-start lg:self-center flex-shrink-0">
            <div className="px-3.5 py-1.5 rounded-2xl bg-black/60 border border-white/15 flex items-center gap-3 shadow-inner">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-wider text-white/45 whitespace-nowrap">
                  LIVE SPECTRUM
                </span>
                <span className="text-xs font-black text-cyan-300 whitespace-nowrap">
                  {isPlaying ? 'ACTIVE STREAM' : 'STANDBY'}
                </span>
              </div>
              <canvas
                ref={spectrumCanvasRef}
                width={130}
                height={32}
                className="w-[130px] h-[32px] block rounded"
              />
            </div>

            {(fxMode !== 'normal' || vocalMode !== 'normal' || hasCustomRack || hasAnyAmbient) && (
              <button
                onClick={handleResetAllDSP}
                className="px-3.5 h-10 rounded-full glass-button text-xs font-extrabold text-rose-300 hover:text-white cursor-pointer whitespace-nowrap flex-shrink-0 shadow-sm"
                title="Bypass and reset all Studio FX, Mastering Knobs, Stems & Ambient Layers"
              >
                ↺ Reset All
              </button>
            )}

            <button
              onClick={() => setStudioModalOpen(false)}
              className="w-10 h-10 rounded-full glass-button flex items-center justify-center text-white/75 hover:text-white cursor-pointer flex-shrink-0 transition-transform active:scale-95"
              title="Close Studio Console"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ================= HARDWARE SEGMENTED NAVIGATION ================= */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 rounded-2xl bg-black/45 border border-white/12">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'presets', label: '🎛️ Acoustic Presets' },
              { id: 'mastering', label: '🎚️ Analog Mastering' },
              { id: 'spatial', label: '🪐 360° Spatial & Stems' },
              { id: 'ambient', label: '🌧️ Ambient & Timers' },
              { id: 'all', label: '⚡ Full Rack' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as StudioTab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'glass-button-primary text-white shadow-md'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2 pr-2 text-[11px] font-bold text-white/50 whitespace-nowrap">
            <span>Speed: <strong className="text-white">{playbackSpeed}x</strong></span>
            <span>•</span>
            <span>Bass: <strong className="text-emerald-300">+{subBassBoost.toFixed(1)}dB</strong></span>
            <span>•</span>
            <span>Warmth: <strong className="text-amber-300">{Math.round(harmonicDrive * 100)}%</strong></span>
          </div>
        </div>

        {/* ================= TAB 1: 8 ACOUSTIC MASTERING PRESETS ================= */}
        {(activeTab === 'presets' || activeTab === 'all') && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <span>🎛️ 1-Click Acoustic Mastering Presets</span>
                  {fxMode !== 'normal' && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] glass-button-primary text-white whitespace-nowrap flex-shrink-0">
                      ACTIVE: {STUDIO_FX_MODES.find((m) => m.id === fxMode)?.name}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Instant hardware DSP configurations fine-tuned for high-end studio monitors, car audio systems, and headphones.
                </p>
              </div>
              {fxMode !== 'normal' && (
                <button
                  onClick={() => setFxMode('normal')}
                  className="px-3 py-1 rounded-full glass-button text-xs font-bold text-white/75 hover:text-white cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  Flat Reference
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {STUDIO_FX_MODES.map((mode) => {
                const active = fxMode === mode.id;
                return (
                  <motion.button
                    key={mode.id}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setFxMode(mode.id)}
                    className={`text-left p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-2 ${
                      active
                        ? 'liquid-glass border-white/40 shadow-[0_12px_32px_rgba(0,0,0,0.55)] ring-1 ring-white/20'
                        : 'bg-white/[0.035] border-white/10 hover:bg-white/[0.07] hover:border-white/20'
                    }`}
                  >
                    {active && (
                      <div
                        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${mode.accent}`}
                      />
                    )}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-2xl">{mode.icon}</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider whitespace-nowrap flex-shrink-0 ${
                            active
                              ? `bg-gradient-to-r ${mode.accent} text-white shadow`
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {mode.badge}
                        </span>
                      </div>
                      <div className="text-sm font-extrabold text-white truncate">{mode.name}</div>
                      <p className="text-[11px] text-white/55 leading-relaxed mt-1 line-clamp-2">
                        {mode.description}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 2: ANALOG MASTERING CHANNEL STRIP ================= */}
        {(activeTab === 'mastering' || activeTab === 'all') && (
          <div className="p-5 sm:p-6 rounded-3xl bg-white/[0.035] border border-white/15 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <span>🎚️ Analog Mastering Channel Strip</span>
                  {hasCustomRack && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] glass-button-emerald text-emerald-200 whitespace-nowrap flex-shrink-0">
                      CUSTOM TUNED
                    </span>
                  )}
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Fine-tune sub-bass punch, 2x oversampled tube harmonics, binaural Haas stereo expansion, and hall convolution reverb.
                </p>
              </div>

              {hasCustomRack && (
                <button
                  onClick={() => {
                    resetMasteringRack();
                    setPlaybackSpeed(1);
                  }}
                  className="px-3 py-1 rounded-full glass-button text-xs font-bold text-white/75 hover:text-white cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  Reset Knobs
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* 1. Sub-Bass Punch Enhancer */}
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-white/90">🔊 54Hz Sub-Bass Punch</span>
                  <span className="font-black text-rose-300 tabular-nums whitespace-nowrap">
                    +{subBassBoost.toFixed(1)} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="9"
                  step="0.5"
                  value={subBassBoost}
                  onChange={(e) => setSubBassBoost(parseFloat(e.target.value))}
                  className="w-full accent-rose-400"
                />
                <div className="flex justify-between text-[10px] text-white/60 font-bold">
                  <button type="button" onClick={() => setSubBassBoost(0)} className="hover:text-white cursor-pointer">0dB (Flat)</button>
                  <button type="button" onClick={() => setSubBassBoost(4.5)} className="hover:text-white cursor-pointer">+4.5dB (Club)</button>
                  <button type="button" onClick={() => setSubBassBoost(9)} className="hover:text-white cursor-pointer">+9dB (Max)</button>
                </div>
              </div>

              {/* 2. Analog Tube Harmonic Drive */}
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-white/90">🔥 Tube Warmth & Drive</span>
                  <span className="font-black text-amber-300 tabular-nums whitespace-nowrap">
                    {Math.round(harmonicDrive * 100)}% Drive
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={harmonicDrive}
                  onChange={(e) => setHarmonicDrive(parseFloat(e.target.value))}
                  className="w-full accent-amber-400"
                />
                <div className="flex justify-between text-[10px] text-white/60 font-bold">
                  <button type="button" onClick={() => setHarmonicDrive(0)} className="hover:text-white cursor-pointer">Clean</button>
                  <button type="button" onClick={() => setHarmonicDrive(0.35)} className="hover:text-white cursor-pointer">Warm Tape</button>
                  <button type="button" onClick={() => setHarmonicDrive(0.85)} className="hover:text-white cursor-pointer">Saturated</button>
                </div>
              </div>

              {/* 3. Binaural Stereo Field Expander */}
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-white/90">↔️ Binaural Stereo Width</span>
                  <span className="font-black text-cyan-300 tabular-nums whitespace-nowrap">
                    {Math.round(stereoWidth * 100)}% Wide
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={stereoWidth}
                  onChange={(e) => setStereoWidth(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] text-white/60 font-bold">
                  <button type="button" onClick={() => setStereoWidth(0)} className="hover:text-white cursor-pointer">100% Stereo</button>
                  <button type="button" onClick={() => setStereoWidth(0.5)} className="hover:text-white cursor-pointer">Haas Stage</button>
                  <button type="button" onClick={() => setStereoWidth(1)} className="hover:text-white cursor-pointer">Panoramic</button>
                </div>
              </div>

              {/* 4. Cathedral Convolution Reverb Mix */}
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-white/90">🏛️ Hall Reverb Wet Mix</span>
                  <span className="font-black text-purple-300 tabular-nums whitespace-nowrap">
                    {Math.round((reverbMix / 0.75) * 100)}% Hall
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.75"
                  step="0.02"
                  value={reverbMix}
                  onChange={(e) => setReverbMix(parseFloat(e.target.value))}
                  className="w-full accent-purple-400"
                />
                <div className="flex justify-between text-[10px] text-white/60 font-bold">
                  <button type="button" onClick={() => setReverbMix(0)} className="hover:text-white cursor-pointer">Dry Studio</button>
                  <button type="button" onClick={() => setReverbMix(0.24)} className="hover:text-white cursor-pointer">Warm Plate</button>
                  <button type="button" onClick={() => setReverbMix(0.6)} className="hover:text-white cursor-pointer">Cathedral</button>
                </div>
              </div>

              {/* 5. 11kHz Silk Air / Lo-Fi High Filter */}
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-white/90">✨ 11kHz Silk Air / Cut</span>
                  <span className="font-black text-emerald-300 tabular-nums whitespace-nowrap">
                    {trebleAir > 0 ? `+${trebleAir.toFixed(1)}` : trebleAir.toFixed(1)} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="-6"
                  max="6"
                  step="0.5"
                  value={trebleAir}
                  onChange={(e) => setTrebleAir(parseFloat(e.target.value))}
                  className="w-full accent-emerald-400"
                />
                <div className="flex justify-between text-[10px] text-white/60 font-bold">
                  <button type="button" onClick={() => setTrebleAir(-6)} className="hover:text-white cursor-pointer">-6dB (Lo-Fi)</button>
                  <button type="button" onClick={() => setTrebleAir(0)} className="hover:text-white cursor-pointer">0dB (Flat)</button>
                  <button type="button" onClick={() => setTrebleAir(6)} className="hover:text-white cursor-pointer">+6dB (Silk Air)</button>
                </div>
              </div>

              {/* 6. Fine Varispeed & Pitch-Lock Control */}
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-white/90">⚡ Varispeed & Tape Rate</span>
                  <button
                    type="button"
                    onClick={() => setPreservePitch(!preservePitch)}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase whitespace-nowrap flex-shrink-0 cursor-pointer ${
                      preservePitch
                        ? 'glass-button-cyan text-cyan-200'
                        : 'glass-button-purple text-purple-200'
                    }`}
                  >
                    {preservePitch ? '🔒 Pitch Lock' : '📼 Tape Pitch Shift'}
                  </button>
                </div>
                <input
                  type="range"
                  min="0.70"
                  max="1.35"
                  step="0.01"
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <div className="flex items-center justify-between text-[10px] text-white/60 font-bold">
                  <button
                    type="button"
                    onClick={() => setPlaybackSpeed(0.88)}
                    className="hover:text-white cursor-pointer"
                  >
                    0.88x Slow
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaybackSpeed(1.0)}
                    className="text-white hover:text-cyan-300 cursor-pointer font-black"
                  >
                    {playbackSpeed.toFixed(2)}x (1.0x Reset)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaybackSpeed(1.18)}
                    className="hover:text-white cursor-pointer"
                  >
                    1.18x Fast
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: 360° HRTF SPATIAL RADAR & STEM ISOLATOR ================= */}
        {(activeTab === 'spatial' || activeTab === 'all') && (
          <div className="space-y-5">
            {/* Holographic 360° Radar Stage */}
            <div
              className={`p-5 sm:p-6 rounded-3xl border transition-all relative overflow-hidden ${
                fxMode === '8d-orbit'
                  ? 'bg-gradient-to-br from-cyan-500/[0.14] via-slate-900/85 to-indigo-600/[0.14] border-cyan-400/40 shadow-[0_20px_60px_rgba(6,182,212,0.2)]'
                  : 'bg-white/[0.03] border-white/12'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 pb-4 mb-5 border-b border-white/10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)] animate-pulse" />
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                      360° HRTF Spatial Soundstage & Binaural Radar
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                        fxMode === '8d-orbit'
                          ? 'bg-cyan-500/25 border border-cyan-400/45 text-cyan-200'
                          : 'bg-white/10 border border-white/15 text-white/60'
                      }`}
                    >
                      {fxMode === '8d-orbit'
                        ? spatialOrbitAuto
                          ? '● AUTO 360° ORBIT ACTIVE'
                          : '● MANUAL 3D VECTOR LOCKED'
                        : 'STANDBY • CLICK TO ENGAGE'}
                    </span>
                  </div>
                  <p className="text-xs text-white/55">
                    Position the 3D emitter in real time anywhere in a binaural hemisphere while keeping &lt;95Hz sub-bass phase-locked in the center.
                  </p>
                </div>

                {/* Trajectory Switcher */}
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-black/60 border border-white/12 self-start lg:self-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                      setSpatialOrbitAuto(true);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      fxMode === '8d-orbit' && spatialOrbitAuto
                        ? 'glass-button-cyan text-white shadow-md'
                        : 'text-white/65 hover:text-white'
                    }`}
                  >
                    <span>🔄 Auto 360° Orbit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                      setSpatialOrbitAuto(false);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      fxMode === '8d-orbit' && !spatialOrbitAuto
                        ? 'glass-button-cyan text-white shadow-md'
                        : 'text-white/65 hover:text-white'
                    }`}
                  >
                    <span>🕹️ Manual 3D Pad</span>
                  </button>
                  {fxMode === '8d-orbit' && (
                    <button
                      type="button"
                      onClick={() => setFxMode('normal')}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-300 hover:bg-rose-500/15 cursor-pointer transition-all whitespace-nowrap"
                    >
                      Bypass
                    </button>
                  )}
                </div>
              </div>

              {/* 2-Column Spatial Radar Console */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                {/* Left: Holographic Radar Soundfield */}
                <div className="lg:col-span-5 p-4 rounded-2xl bg-black/60 border border-white/12 flex flex-col items-center justify-between gap-3.5">
                  <div className="w-full flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-extrabold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      {stageZoneLabel}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-white/[0.06] border border-white/10 font-mono font-bold text-white/85 tabular-nums whitespace-nowrap">
                      {azimuthDeg}° AZ • {distanceMeters}m
                    </span>
                  </div>

                  {/* 224x224 Radar Pad */}
                  <div
                    ref={radarRef}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setIsDraggingRadar(true);
                      updateRadarPosFromPointer(e.clientX, e.clientY);
                    }}
                    onPointerMove={(e) => {
                      if (!isDraggingRadar) return;
                      updateRadarPosFromPointer(e.clientX, e.clientY);
                    }}
                    onPointerUp={() => setIsDraggingRadar(false)}
                    onPointerCancel={() => setIsDraggingRadar(false)}
                    className="relative w-56 h-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18)_0%,rgba(15,23,42,0.9)_62%,rgba(0,0,0,0.98)_100%)] border border-cyan-400/40 shadow-[inset_0_0_36px_rgba(34,211,238,0.2),0_12px_32px_rgba(0,0,0,0.65)] flex items-center justify-center cursor-crosshair touch-none overflow-hidden select-none"
                  >
                    <svg
                      viewBox="0 0 224 224"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      <defs>
                        <linearGradient id="spatialBeamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="rgba(34, 211, 238, 0.48)" />
                          <stop offset="100%" stopColor="rgba(59, 130, 246, 0.04)" />
                        </linearGradient>
                      </defs>
                      <circle cx="112" cy="112" r="84" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                      <circle cx="112" cy="112" r="56" fill="none" stroke="rgba(255,255,255,0.10)" />
                      <circle cx="112" cy="112" r="28" fill="none" stroke="rgba(34,211,238,0.18)" />
                      <line x1="112" y1="8" x2="112" y2="216" stroke="rgba(255,255,255,0.08)" />
                      <line x1="8" y1="112" x2="216" y2="112" stroke="rgba(255,255,255,0.08)" />

                      {/* Wavefront Projection */}
                      {(() => {
                        const ex = 112 + orbX * 86;
                        const ez = 112 + orbZ * 86;
                        const angle = Math.atan2(112 - ez, 112 - ex);
                        const spread = 0.42;
                        const wx1 = ex + Math.cos(angle - spread) * 58;
                        const wz1 = ez + Math.sin(angle - spread) * 58;
                        const wx2 = ex + Math.cos(angle + spread) * 58;
                        const wz2 = ez + Math.sin(angle + spread) * 58;
                        return (
                          <>
                            <polygon
                              points={`${ex},${ez} ${wx1},${wz1} ${wx2},${wz2}`}
                              fill="url(#spatialBeamGrad)"
                            />
                            <line
                              x1="112"
                              y1="112"
                              x2={ex}
                              y2={ez}
                              stroke="rgba(34, 211, 238, 0.65)"
                              strokeWidth="1.5"
                              strokeDasharray="3 3"
                            />
                          </>
                        );
                      })()}
                    </svg>

                    <span className="absolute top-2 text-[9px] font-black tracking-widest text-cyan-300 uppercase pointer-events-none">
                      0° FRONT
                    </span>
                    <span className="absolute bottom-2 text-[9px] font-extrabold tracking-widest text-white/45 uppercase pointer-events-none">
                      180° REAR
                    </span>
                    <span className="absolute left-2.5 text-[9px] font-extrabold tracking-widest text-white/55 uppercase pointer-events-none">
                      270° L
                    </span>
                    <span className="absolute right-2.5 text-[9px] font-extrabold tracking-widest text-white/55 uppercase pointer-events-none">
                      90° R
                    </span>

                    <div className="relative z-10 w-10 h-10 rounded-full bg-slate-900/90 border border-cyan-400/40 flex items-center justify-center text-sm shadow-[0_0_20px_rgba(34,211,238,0.25)] pointer-events-none">
                      🎧
                    </div>

                    <div
                      style={{
                        transform: `translate3d(${(orbX * 86).toFixed(1)}px, ${(orbZ * 86).toFixed(1)}px, 0)`
                      }}
                      className="pointer-events-none absolute w-8 h-8 rounded-full bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-600 border-2 border-white shadow-[0_0_28px_6px_rgba(34,211,238,0.9)] flex items-center justify-center will-change-transform z-20"
                    >
                      <span className="absolute inset-0 rounded-full border border-cyan-200 animate-ping opacity-75" />
                      <span className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  </div>

                  {/* Dual Binaural VU Meters */}
                  <div className="w-full space-y-1.5 pt-1">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                        <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                          <span className="text-white/60">L-EAR LEVEL</span>
                          <span className="text-cyan-300 tabular-nums">{leftEarLevel}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-150"
                            style={{ width: `${leftEarLevel}%` }}
                          />
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                        <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                          <span className="text-white/60">R-EAR LEVEL</span>
                          <span className="text-cyan-300 tabular-nums">{rightEarLevel}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-150"
                            style={{ width: `${rightEarLevel}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-white/45 font-semibold px-1">
                      <span>X: {(orbX * 2.5).toFixed(1)}m • Z: {(orbZ * 2.2).toFixed(1)}m</span>
                      <span className="text-emerald-300/85">● &lt;95Hz Sub Phase-Locked</span>
                    </div>
                  </div>
                </div>

                {/* Right: Controls & Position Matrix */}
                <div className="lg:col-span-7 flex flex-col justify-between gap-3.5">
                  <div className="p-4 rounded-2xl bg-black/45 border border-white/12 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-white">
                        🔄 360° Orbit Angular Velocity
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-[11px] font-black text-cyan-300 tabular-nums">
                        {(1 / spatialOrbitSpeed).toFixed(1)}s / rev
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.35"
                      step="0.01"
                      value={spatialOrbitSpeed}
                      onChange={(e) => {
                        if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                        setSpatialOrbitSpeed(parseFloat(e.target.value));
                      }}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-black/45 border border-white/12 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-white">
                        🏛️ Concert Dome Reflections
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-[11px] font-black text-cyan-300 tabular-nums">
                        {Math.round((spatialRoomSize / 0.65) * 100)}% Depth
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.65"
                      step="0.02"
                      value={spatialRoomSize}
                      onChange={(e) => {
                        if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                        setSpatialRoomSize(parseFloat(e.target.value));
                      }}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* 6-Point Acoustic Stage Quick Matrix */}
                  <div className="p-4 rounded-2xl bg-black/45 border border-white/12 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-extrabold text-white/90">
                      <span>🎯 Acoustic Stage Positions</span>
                      <span className="text-[10px] text-white/45 font-normal">Click to position sound emitter</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { icon: '🎤', label: 'Front Stage', sub: '0° Center', x: 0, z: -0.82 },
                        { icon: '🎸', label: 'Left Wing', sub: '310° Left', x: -0.65, z: -0.55 },
                        { icon: '🎹', label: 'Right Wing', sub: '50° Right', x: 0.65, z: -0.55 },
                        { icon: '🏛️', label: 'Left Balcony', sub: '270° Hard L', x: -0.85, z: 0 },
                        { icon: '🏛️', label: 'Right Balcony', sub: '90° Hard R', x: 0.85, z: 0 },
                        { icon: '🌌', label: 'Rear Halo', sub: '180° Behind', x: 0, z: 0.82 }
                      ].map((preset) => {
                        const isSelected =
                          fxMode === '8d-orbit' &&
                          !spatialOrbitAuto &&
                          Math.hypot(spatialManualPos.x - preset.x, spatialManualPos.z - preset.z) < 0.18;

                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                              setSpatialOrbitAuto(false);
                              setSpatialManualPos({ x: preset.x, z: preset.z });
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 min-w-0 ${
                              isSelected
                                ? 'bg-cyan-500/25 border-cyan-400/60 text-white shadow-md'
                                : 'bg-white/[0.04] border-white/10 text-white/75 hover:text-white hover:bg-white/[0.08]'
                            }`}
                          >
                            <span className="text-base flex-shrink-0">{preset.icon}</span>
                            <div className="min-w-0">
                              <div className="text-[11px] font-extrabold truncate">{preset.label}</div>
                              <div className="text-[9px] text-white/50 truncate">{preset.sub}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Real-Time Vocal Stem Isolator */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <span>🎤 Real-Time Vocal Remover & Stem Isolator</span>
                    {vocalMode !== 'normal' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] glass-button-primary text-white whitespace-nowrap">
                        ACTIVE: {vocalMode.toUpperCase()}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Zero-latency Web Audio Mid/Side phase cancellation and vocal formant isolation.
                  </p>
                </div>
                {vocalMode !== 'normal' && (
                  <button
                    onClick={() => setVocalMode('normal')}
                    className="px-3 py-1 rounded-full glass-button text-xs font-bold text-white/75 hover:text-white cursor-pointer whitespace-nowrap"
                  >
                    Restore Full Mix
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {VOCAL_STEM_MODES.map((m) => {
                  const active = vocalMode === m.id;
                  return (
                    <motion.button
                      key={m.id}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setVocalMode(m.id)}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-2 ${
                        active
                          ? 'liquid-glass border-white/40 shadow-xl ring-1 ring-white/20'
                          : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                      }`}
                    >
                      {active && (
                        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${m.accent}`} />
                      )}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-2xl">{m.icon}</span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${
                              active
                                ? `bg-gradient-to-r ${m.accent} text-white shadow`
                                : 'bg-white/10 text-white/60'
                            }`}
                          >
                            {m.badge}
                          </span>
                        </div>
                        <div className="text-sm font-extrabold text-white truncate">{m.name}</div>
                        <p className="text-xs text-white/60 leading-relaxed mt-1">{m.desc}</p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: AMBIENT SOUNDSCAPES & TIMERS ================= */}
        {(activeTab === 'ambient' || activeTab === 'all') && (
          <div className="space-y-5">
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    🌧️ 6-Channel Procedural Ambient Soundscapes
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Synthesized live in Web Audio — blend underneath music or listen solo for deep study & sleep.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {AMBIENT_SCENE_PRESETS.map((scene) => (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => applyAmbientPreset(scene.mix)}
                      className="px-3 py-1 rounded-full glass-button text-[11px] font-bold text-emerald-200 hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      {scene.icon} {scene.label}
                    </button>
                  ))}
                  {hasAnyAmbient && (
                    <button
                      onClick={stopAllAmbient}
                      className="px-3 py-1 rounded-full glass-button-primary text-[11px] font-bold text-white cursor-pointer whitespace-nowrap"
                    >
                      Mute All
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-2xl flex-shrink-0">{layer.icon}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-white truncate">{layer.name}</div>
                            <div className="text-[10px] text-white/50 truncate">{layer.subtitle}</div>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setAmbientVolume(layer.id as AmbientLayerId, isLayerActive ? 0 : 0.45)
                          }
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer whitespace-nowrap flex-shrink-0 ${
                            isLayerActive
                              ? 'glass-button-emerald text-emerald-200'
                              : 'glass-button text-white/60 hover:text-white'
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
                        className="w-full mt-1 accent-emerald-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pomodoro & Sleep Timer Console */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/10">
              {/* Focus Pomodoro Timer */}
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <span>⏱️ Focus Pomodoro Timer</span>
                      {completedSessions > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] whitespace-nowrap flex-shrink-0">
                          🔥 {completedSessions} Done
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-white/55 mt-0.5">
                      25-minute deep focus sessions with 5-minute restorative breaks.
                    </p>
                  </div>
                  <div className="text-2xl font-black tabular-nums text-[var(--color-accent)] whitespace-nowrap flex-shrink-0">
                    {formatClock(pomodoroSeconds)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {pomodoroActive ? (
                    <button
                      onClick={stopPomodoro}
                      className="flex-1 py-2.5 rounded-xl glass-button-primary text-red-100 text-xs font-extrabold cursor-pointer"
                    >
                      Stop {pomodoroMode === 'focus' ? 'Focus' : 'Break'} Timer
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => startPomodoro('focus')}
                        className="flex-1 py-2.5 rounded-xl glass-button-primary text-white text-xs font-extrabold cursor-pointer"
                      >
                        Start 25m Focus
                      </button>
                      <button
                        onClick={() => startPomodoro('break')}
                        className="px-4 py-2.5 rounded-xl glass-button text-white/85 hover:text-white text-xs font-bold cursor-pointer"
                      >
                        5m Break
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Sleep Fade-Out Timer */}
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-white">🌙 Sleep Fade-Out Timer</h4>
                    <p className="text-xs text-white/55 mt-0.5">
                      Smoothly fades out audio levels and pauses playback automatically.
                    </p>
                  </div>
                  {sleepActive && (
                    <div className="text-base sm:text-xl font-black tabular-nums text-purple-300 whitespace-nowrap flex-shrink-0">
                      {sleepEndAtTrack ? 'End of Song' : formatClock(sleepRemaining)}
                    </div>
                  )}
                </div>

                {sleepActive ? (
                  <button
                    onClick={stopSleepTimer}
                    className="w-full py-2.5 rounded-xl glass-button-purple text-purple-200 text-xs font-extrabold cursor-pointer"
                  >
                    Cancel Sleep Timer ({sleepEndAtTrack ? 'End of Song' : formatClock(sleepRemaining)})
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {[15, 30, 45, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => startSleepTimer(mins)}
                        className="flex-1 py-2 rounded-xl glass-button text-xs font-bold text-white cursor-pointer"
                      >
                        {mins}m
                      </button>
                    ))}
                    <button
                      onClick={() => setEndAtTrack(true)}
                      className="px-3 py-2 rounded-xl glass-button text-xs font-bold text-white/85 hover:text-white cursor-pointer"
                    >
                      End of Song
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function StudioFXModal() {
  const isStudioModalOpen = useStudioStore((s) => s.isStudioModalOpen);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>{isStudioModalOpen && <StudioFXModalContent />}</AnimatePresence>,
    document.body
  );
}
