import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useStudioStore,
  STUDIO_FX_MODES,
  AMBIENT_LAYERS,
  type AmbientLayerId,
  type VocalStemMode,
  type StudioFXMode
} from '../../stores/studioStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useSleepTimer } from '../../hooks/useSleepTimer';
import { getAudioFrequencyData } from '../../services/audioEngine';

const VOCAL_STEM_MODES: Array<{
  id: VocalStemMode;
  name: string;
  icon: string;
  badge: string;
  tagline: string;
  accent: string;
  borderActive: string;
}> = [
  {
    id: 'normal',
    name: 'Full Studio Master',
    icon: '🎚️',
    badge: '320K STEREO',
    tagline: 'Bit-accurate 320kbps master with full lead vocals & dynamic headroom.',
    accent: 'from-emerald-500 to-teal-500',
    borderActive: 'border-emerald-400/80 shadow-[0_0_24px_rgba(52,211,153,0.35)]'
  },
  {
    id: 'karaoke',
    name: 'Karaoke Vocal Remover',
    icon: '🎤',
    badge: 'INSTRUMENTAL',
    tagline: 'Mid/Side phase cancellation strips center lead vocals; retains <155Hz sub-bass.',
    accent: 'from-rose-500 to-pink-600',
    borderActive: 'border-rose-400/80 shadow-[0_0_24px_rgba(244,63,94,0.35)]'
  },
  {
    id: 'acapella',
    name: 'Acapella Vocal Isolate',
    icon: '✨',
    badge: 'LEAD VOCAL ONLY',
    tagline: 'Spotlights 1.65kHz vocal formants and harmonics while filtering heavy instrumentation.',
    accent: 'from-violet-500 to-fuchsia-600',
    borderActive: 'border-purple-400/80 shadow-[0_0_24px_rgba(168,85,247,0.35)]'
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
    mix: { rain: 0.55, vinyl: 0.38 }
  },
  {
    id: 'campfire-coast',
    label: 'Coastal Campfire',
    icon: '🔥',
    mix: { campfire: 0.6, waves: 0.32 }
  },
  {
    id: 'study-cafe',
    label: 'Deep Focus Cafe',
    icon: '☕',
    mix: { cafe: 0.45, binaural: 0.4, rain: 0.25 }
  },
  {
    id: 'ocean-sleep',
    label: 'Ocean Sleep Sanctuary',
    icon: '🌊',
    mix: { waves: 0.65, rain: 0.28 }
  }
];

type StudioConsoleView = 'full' | 'mastering' | 'spatial' | 'ambient';

function StudioFXModalContent() {
  const {
    fxMode,
    vocalMode,
    spatialOrbitAuto,
    spatialOrbitSpeed,
    spatialManualPos,
    subBassBoost,
    harmonicDrive,
    stereoWidth,
    reverbMix,
    trebleAir,
    preservePitch,
    ambientVolumes,
    pomodoroActive,
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

  const [consoleView, setConsoleView] = useState<StudioConsoleView>('full');
  const [isBypassed, setIsBypassed] = useState(false);
  const [isDraggingRadar, setIsDraggingRadar] = useState(false);
  const [liveOrbitAngle, setLiveOrbitAngle] = useState(0);

  const radarRef = useRef<HTMLDivElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);

  // High-Definition 60fps Real-Time Mastering Spectrum Analyzer Canvas
  useEffect(() => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const freqData = new Uint8Array(64);
    const peakBars = new Float32Array(32);
    let raf = 0;
    let phase = 0;

    const renderSpectrum = () => {
      phase += 0.04;
      const hasLive = getAudioFrequencyData(freqData);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle horizontal dB reference grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      [-12, -24, -36].forEach((db) => {
        const y = h * (1 - (db + 48) / 48);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      });

      const barCount = 32;
      const gap = 3;
      const barW = (w - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        let norm = 0.08;
        if (hasLive) {
          const bin = Math.min(freqData.length - 1, Math.floor((i / barCount) * 44));
          norm = Math.max(0.08, freqData[bin] / 255);
        } else if (isPlaying && !isBypassed) {
          norm =
            0.15 +
            0.38 * Math.abs(Math.sin(phase + i * 0.25)) * Math.cos(phase * 0.7 - i * 0.15);
        }

        // Peak hold decay
        if (norm > peakBars[i]) {
          peakBars[i] = norm;
        } else {
          peakBars[i] = Math.max(0.08, peakBars[i] - 0.015);
        }

        const barH = Math.max(4, norm * (h - 6));
        const x = i * (barW + gap);
        const y = h - barH;

        // Audiophile multi-spectrum gradient (Sub Cyan -> Mid Purple -> Peak Coral)
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.85)');
        grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.95)');
        grad.addColorStop(1, 'rgba(250, 45, 72, 1)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();

        // Glowing peak hold dot
        const peakY = h - Math.max(4, peakBars[i] * (h - 6));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, Math.max(0, peakY - 2), barW, 2);
      }

      raf = requestAnimationFrame(renderSpectrum);
    };

    raf = requestAnimationFrame(renderSpectrum);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, isBypassed]);

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
    setIsBypassed(false);
  };

  // 1-Click Acoustic Preset Handler with parameter synchronization
  const handleSelectPreset = (modeId: StudioFXMode) => {
    setIsBypassed(false);
    setFxMode(modeId);

    // Sync physical rack faders so user sees parameters adjust in real time
    switch (modeId) {
      case 'normal':
        setSubBassBoost(0);
        setHarmonicDrive(0);
        setStereoWidth(0);
        setReverbMix(0);
        setTrebleAir(0);
        setPlaybackSpeed(1);
        setVocalMode('normal');
        break;
      case 'slowed-reverb':
        setPlaybackSpeed(0.88);
        setPreservePitch(false);
        setReverbMix(0.36);
        setHarmonicDrive(0.25);
        setSubBassBoost(2.5);
        break;
      case 'nightcore':
        setPlaybackSpeed(1.18);
        setPreservePitch(false);
        setTrebleAir(3.0);
        setStereoWidth(0.35);
        break;
      case 'bass-cinema':
        setSubBassBoost(6.5);
        setHarmonicDrive(0.2);
        setReverbMix(0.12);
        setTrebleAir(1.5);
        break;
      case 'vocal-stage':
        setTrebleAir(2.5);
        setStereoWidth(0.45);
        setReverbMix(0.18);
        setVocalMode('normal');
        break;
      case 'lofi-tape':
        setPlaybackSpeed(0.96);
        setPreservePitch(false);
        setHarmonicDrive(0.65);
        setTrebleAir(-3.5);
        setReverbMix(0.15);
        break;
      case 'arena-live':
        setReverbMix(0.52);
        setStereoWidth(0.85);
        setSubBassBoost(3.0);
        break;
      case '8d-orbit':
        setSpatialOrbitAuto(true);
        setSpatialOrbitSpeed(0.14);
        setSpatialRoomSize(0.35);
        break;
    }
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-2 sm:p-4 md:p-6 select-none overflow-hidden">
      {/* Frosted Aurora Blur Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        onClick={() => setStudioModalOpen(false)}
        className="absolute inset-0 modal-backdrop-blur backdrop-blur-2xl backdrop-saturate-200 bg-black/80"
      />

      {/* Main Studio Hardware Workstation Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-6xl max-h-[94vh] flex flex-col rounded-3xl modal-glass-panel backdrop-blur-3xl border border-white/20 shadow-[0_32px_120px_rgba(0,0,0,0.92)] text-white overflow-hidden"
      >
        {/* ================= 1. APEX CONSOLE MASTER TELEMETRY HEADER ================= */}
        <div className="px-5 py-4 sm:px-7 sm:py-5 border-b border-white/12 bg-gradient-to-b from-white/[0.06] via-transparent to-black/30 flex-shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left: Branding & Status */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/45 text-[10px] font-black uppercase tracking-widest text-[var(--color-accent)] shadow-[0_0_12px_rgba(250,45,72,0.3)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-ping" />
                  WAVECRAFT 64-BIT APEX MASTERING
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-extrabold text-emerald-300">
                  -0.8 dBTP Brickwall Limiter
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/35 text-[10px] font-extrabold text-cyan-300">
                  320 KBPS • 48 KHZ AUDIO STREAM
                </span>
                {vocalMode !== 'normal' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/45 text-[10px] font-black uppercase text-purple-200">
                    STEM: {vocalMode}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Studio FX & Analog Mastering Console</span>
              </h1>
            </div>

            {/* Right: Real-time Spectrum Analyzer & Master Utility Buttons */}
            <div className="flex items-center gap-3 self-start lg:self-center flex-shrink-0">
              {/* Luminous Master Spectrum Analyzer Deck */}
              <div className="px-4 py-2 rounded-2xl bg-black/75 border border-white/15 flex items-center gap-3 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)]">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black tracking-widest uppercase text-white/45 whitespace-nowrap">
                    LIVE SPECTRUM
                  </span>
                  <span className="text-[11px] font-black text-cyan-300 tabular-nums whitespace-nowrap">
                    {isPlaying ? (isBypassed ? 'BYPASSED' : 'ACTIVE MASTER') : 'OFFLINE'}
                  </span>
                </div>
                <canvas
                  ref={spectrumCanvasRef}
                  width={150}
                  height={34}
                  className="w-[150px] h-[34px] block rounded"
                />
              </div>

              {/* A/B Quick Bypass Comparison */}
              <button
                type="button"
                onClick={() => setIsBypassed(!isBypassed)}
                className={`px-3.5 h-10 rounded-2xl text-xs font-black tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isBypassed
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                    : 'bg-white/5 border-white/15 text-white/70 hover:text-white hover:bg-white/10'
                }`}
                title="Toggle Master DSP Bypass to compare Flat Reference vs Mastered Sound"
              >
                <span>{isBypassed ? '⚠️ BYPASS (A)' : '🎛️ MASTER (B)'}</span>
              </button>

              {/* Master Reset */}
              {(fxMode !== 'normal' || vocalMode !== 'normal' || hasCustomRack || hasAnyAmbient) && (
                <button
                  type="button"
                  onClick={handleResetAllDSP}
                  className="px-3.5 h-10 rounded-2xl glass-button text-xs font-black text-rose-300 hover:text-white cursor-pointer shadow-sm"
                  title="Reset all DSP knobs, Stems, and Ambience to flat defaults"
                >
                  ↺ Reset
                </button>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setStudioModalOpen(false)}
                className="w-10 h-10 rounded-2xl glass-button flex items-center justify-center text-white/75 hover:text-white cursor-pointer transition-transform active:scale-95"
                title="Close Studio Console"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Console View Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-white/10">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'full', label: '⚡ Unified Studio Workstation' },
                { id: 'mastering', label: '🎚️ Analog Mastering Bay' },
                { id: 'spatial', label: '🪐 360° Spatial & Stems' },
                { id: 'ambient', label: '🌧️ Ambient & Timers' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setConsoleView(tab.id as StudioConsoleView)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                    consoleView === tab.id
                      ? 'glass-button-primary text-white shadow-md'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-2.5 text-[11px] font-bold text-white/50">
              <span>Speed: <strong className="text-white">{playbackSpeed}x</strong></span>
              <span>•</span>
              <span>Sub-Bass: <strong className="text-rose-300">+{subBassBoost.toFixed(1)}dB</strong></span>
              <span>•</span>
              <span>Warmth: <strong className="text-amber-300">{Math.round(harmonicDrive * 100)}%</strong></span>
              <span>•</span>
              <span>Width: <strong className="text-cyan-300">{Math.round(stereoWidth * 100)}%</strong></span>
            </div>
          </div>
        </div>

        {/* ================= 2. SCROLLABLE CONSOLE BODY ================= */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-5 sm:p-7 space-y-7">
          {/* ================= 2A. ACOUSTIC HARDWARE PEDALS RACK ================= */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-white/80 flex items-center gap-2">
                <span>🎛️ Acoustic Mastering Pedals (1-Click DSP Engines)</span>
              </span>
              <span className="text-[11px] text-white/45 font-bold">
                Click any stompbox to engage instant mastering profile
              </span>
            </div>

            {/* 8 Machined Stompbox Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {STUDIO_FX_MODES.map((mode) => {
                const isActive = fxMode === mode.id && !isBypassed;
                return (
                  <motion.button
                    key={mode.id}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleSelectPreset(mode.id)}
                    className={`relative p-3 rounded-2xl border text-left flex flex-col justify-between h-28 cursor-pointer transition-all overflow-hidden ${
                      isActive
                        ? 'bg-gradient-to-b from-white/15 to-white/5 border-white/40 shadow-[0_10px_25px_rgba(0,0,0,0.6)] ring-1 ring-white/30'
                        : 'bg-black/40 border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                    }`}
                  >
                    {/* Active Accent Top Glow */}
                    {isActive && (
                      <div
                        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${mode.accent}`}
                      />
                    )}

                    {/* Top Row: Icon + Jewel LED */}
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{mode.icon}</span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isActive
                            ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                            : 'bg-white/20'
                        }`}
                      />
                    </div>

                    {/* Bottom Row: Name + Acoustic Badge */}
                    <div>
                      <div className="text-xs font-black text-white truncate">{mode.name}</div>
                      <span
                        className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase ${
                          isActive
                            ? `bg-gradient-to-r ${mode.accent} text-white`
                            : 'bg-white/10 text-white/50'
                        }`}
                      >
                        {mode.badge}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* ================= 2B. DUAL-BAY MASTERING WORKSTATION ================= */}
          {(consoleView === 'full' || consoleView === 'mastering' || consoleView === 'spatial') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* ================= BAY 1: ANALOG MASTERING CHANNEL STRIP (7 COLS) ================= */}
              {(consoleView === 'full' || consoleView === 'mastering') && (
                <div
                  className={`${
                    consoleView === 'mastering' ? 'lg:col-span-12' : 'lg:col-span-7'
                  } p-5 sm:p-6 rounded-3xl bg-black/45 border border-white/15 space-y-5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <span>🎚️ Analog Mastering Channel Strip</span>
                        {hasCustomRack && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                            CUSTOM TUNED
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-white/50 mt-0.5">
                        Tactile precision faders with harmonic saturation and analog tape rate.
                      </p>
                    </div>

                    {hasCustomRack && (
                      <button
                        type="button"
                        onClick={() => {
                          resetMasteringRack();
                          setPlaybackSpeed(1);
                        }}
                        className="px-2.5 py-1 rounded-xl glass-button text-[11px] font-bold text-white/70 hover:text-white"
                      >
                        Reset Strip
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1. Sub-Bass Punch Enhancer (54Hz) */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-white/90">🔊 54Hz Sub-Bass Punch</span>
                        <span className="font-black text-rose-300 tabular-nums">
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
                      <div className="flex justify-between text-[10px] text-white/50 font-bold">
                        <button type="button" onClick={() => setSubBassBoost(0)} className="hover:text-white cursor-pointer">Flat 0dB</button>
                        <button type="button" onClick={() => setSubBassBoost(4.5)} className="hover:text-rose-300 cursor-pointer">Club +4.5dB</button>
                        <button type="button" onClick={() => setSubBassBoost(9)} className="hover:text-rose-400 cursor-pointer">Cinema +9dB</button>
                      </div>
                    </div>

                    {/* 2. Analog Tube Warmth & Triode Drive */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-white/90 flex items-center gap-1.5">
                          <span>🔥 Tube Warmth & Saturation</span>
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: `rgba(245, 158, 11, ${Math.max(0.2, harmonicDrive)})`,
                              boxShadow: `0 0 8px rgba(245, 158, 11, ${harmonicDrive})`
                            }}
                          />
                        </span>
                        <span className="font-black text-amber-300 tabular-nums">
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
                      <div className="flex justify-between text-[10px] text-white/50 font-bold">
                        <button type="button" onClick={() => setHarmonicDrive(0)} className="hover:text-white cursor-pointer">Clean (0%)</button>
                        <button type="button" onClick={() => setHarmonicDrive(0.35)} className="hover:text-amber-300 cursor-pointer">Tape (35%)</button>
                        <button type="button" onClick={() => setHarmonicDrive(0.85)} className="hover:text-amber-400 cursor-pointer">Saturated (85%)</button>
                      </div>
                    </div>

                    {/* 3. Binaural Stereo Field Expander */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-white/90">↔️ Stereo Width (Haas)</span>
                        <span className="font-black text-cyan-300 tabular-nums">
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
                      <div className="flex justify-between text-[10px] text-white/50 font-bold">
                        <button type="button" onClick={() => setStereoWidth(0)} className="hover:text-white cursor-pointer">100% Stereo</button>
                        <button type="button" onClick={() => setStereoWidth(0.5)} className="hover:text-cyan-300 cursor-pointer">Haas Stage</button>
                        <button type="button" onClick={() => setStereoWidth(1)} className="hover:text-cyan-400 cursor-pointer">3D Panoramic</button>
                      </div>
                    </div>

                    {/* 4. Convolution Hall Reverb Mix */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-white/90">🏛️ Hall Reverb Wet Mix</span>
                        <span className="font-black text-purple-300 tabular-nums">
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
                      <div className="flex justify-between text-[10px] text-white/50 font-bold">
                        <button type="button" onClick={() => setReverbMix(0)} className="hover:text-white cursor-pointer">Dry Studio</button>
                        <button type="button" onClick={() => setReverbMix(0.24)} className="hover:text-purple-300 cursor-pointer">Warm Plate</button>
                        <button type="button" onClick={() => setReverbMix(0.6)} className="hover:text-purple-400 cursor-pointer">Cathedral</button>
                      </div>
                    </div>

                    {/* 5. 11kHz Silk Air / Lo-Fi High Shelf Filter */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-white/90">✨ 11kHz Silk Air / Cut</span>
                        <span className="font-black text-emerald-300 tabular-nums">
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
                      <div className="flex justify-between text-[10px] text-white/50 font-bold">
                        <button type="button" onClick={() => setTrebleAir(-6)} className="hover:text-white cursor-pointer">-6dB Lo-Fi</button>
                        <button type="button" onClick={() => setTrebleAir(0)} className="hover:text-white cursor-pointer">0dB Flat</button>
                        <button type="button" onClick={() => setTrebleAir(6)} className="hover:text-emerald-300 cursor-pointer">+6dB Silk</button>
                      </div>
                    </div>

                    {/* 6. Varispeed & Tape Rate Engine */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-white/90">⚡ Tape Varispeed Engine</span>
                        <button
                          type="button"
                          onClick={() => setPreservePitch(!preservePitch)}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase cursor-pointer ${
                            preservePitch
                              ? 'glass-button-cyan text-cyan-200'
                              : 'glass-button-purple text-purple-200'
                          }`}
                        >
                          {preservePitch ? '🔒 Pitch Lock' : '📼 Tape Drift'}
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
                      <div className="flex items-center justify-between text-[10px] text-white/50 font-bold">
                        <button type="button" onClick={() => setPlaybackSpeed(0.88)} className="hover:text-white cursor-pointer">0.88x Slow</button>
                        <button type="button" onClick={() => setPlaybackSpeed(1.0)} className="text-white hover:text-cyan-300 cursor-pointer font-black">{playbackSpeed.toFixed(2)}x (1.0x)</button>
                        <button type="button" onClick={() => setPlaybackSpeed(1.18)} className="hover:text-white cursor-pointer">1.18x Rush</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= BAY 2: 360° SPATIAL RADAR & STEM ISOLATOR (5 COLS) ================= */}
              {(consoleView === 'full' || consoleView === 'spatial') && (
                <div
                  className={`${
                    consoleView === 'spatial' ? 'lg:col-span-12' : 'lg:col-span-5'
                  } space-y-5`}
                >
                  {/* Holographic 360° HRTF Soundstage Scope */}
                  <div className="p-5 rounded-3xl bg-black/50 border border-white/15 space-y-4 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
                          <span>360° Spatial Radar Stage</span>
                        </h3>
                        <p className="text-[11px] text-white/50 mt-0.5">
                          Drag emitter or engage Auto-Orbit to move audio in 3D binaural space.
                        </p>
                      </div>

                      {/* Orbit Switcher */}
                      <button
                        type="button"
                        onClick={() => {
                          if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                          setSpatialOrbitAuto(!spatialOrbitAuto);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer border transition-all ${
                          fxMode === '8d-orbit' && spatialOrbitAuto
                            ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                            : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
                        }`}
                      >
                        {spatialOrbitAuto ? '🔄 Orbit: ON' : '🕹️ Orbit: OFF'}
                      </button>
                    </div>

                    {/* Radar Scope Visualizer (210x210) */}
                    <div className="flex flex-col items-center justify-center pt-1">
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
                        className="relative w-52 h-52 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.2)_0%,rgba(15,23,42,0.92)_60%,rgba(0,0,0,0.98)_100%)] border border-cyan-400/40 shadow-[inset_0_0_36px_rgba(34,211,238,0.22),0_12px_32px_rgba(0,0,0,0.7)] flex items-center justify-center cursor-crosshair touch-none overflow-hidden select-none"
                      >
                        <svg viewBox="0 0 208 208" className="absolute inset-0 w-full h-full pointer-events-none">
                          <circle cx="104" cy="104" r="78" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                          <circle cx="104" cy="104" r="52" fill="none" stroke="rgba(255,255,255,0.10)" />
                          <circle cx="104" cy="104" r="26" fill="none" stroke="rgba(34,211,238,0.20)" />
                          <line x1="104" y1="6" x2="104" y2="202" stroke="rgba(255,255,255,0.08)" />
                          <line x1="6" y1="104" x2="202" y2="104" stroke="rgba(255,255,255,0.08)" />

                          {/* Dynamic Wavefront Projection from Emitter to Center */}
                          {(() => {
                            const ex = 104 + orbX * 80;
                            const ez = 104 + orbZ * 80;
                            return (
                              <line
                                x1="104"
                                y1="104"
                                x2={ex}
                                y2={ez}
                                stroke="rgba(34, 211, 238, 0.75)"
                                strokeWidth="1.5"
                                strokeDasharray="3 3"
                              />
                            );
                          })()}
                        </svg>

                        <span className="absolute top-2 text-[9px] font-black tracking-widest text-cyan-300 uppercase pointer-events-none">
                          0° FRONT
                        </span>
                        <span className="absolute bottom-2 text-[9px] font-extrabold tracking-widest text-white/45 uppercase pointer-events-none">
                          180° REAR
                        </span>

                        {/* Center Listener Avatar */}
                        <div className="relative z-10 w-9 h-9 rounded-full bg-slate-900 border border-cyan-400/50 flex items-center justify-center text-sm shadow-[0_0_16px_rgba(34,211,238,0.3)] pointer-events-none">
                          🎧
                        </div>

                        {/* Emitter Orb */}
                        <div
                          style={{
                            transform: `translate3d(${(orbX * 80).toFixed(1)}px, ${(orbZ * 80).toFixed(1)}px, 0)`
                          }}
                          className="pointer-events-none absolute w-7 h-7 rounded-full bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-600 border-2 border-white shadow-[0_0_24px_5px_rgba(34,211,238,0.9)] flex items-center justify-center will-change-transform z-20"
                        >
                          <span className="absolute inset-0 rounded-full border border-cyan-200 animate-ping opacity-75" />
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                      </div>

                      {/* Radar Telemetry Readout */}
                      <div className="w-full flex items-center justify-between text-xs pt-3 font-bold">
                        <span className="text-cyan-300">{stageZoneLabel}</span>
                        <span className="font-mono text-white/80 tabular-nums">
                          {azimuthDeg}° • {distanceMeters}m
                        </span>
                      </div>

                      {/* Dual Ear Binaural VU Meters */}
                      <div className="w-full grid grid-cols-2 gap-2 pt-2">
                        <div className="p-2 rounded-xl bg-white/[0.04] border border-white/10">
                          <div className="flex justify-between text-[10px] font-bold text-white/60 mb-1">
                            <span>L-EAR</span>
                            <span className="text-cyan-300">{leftEarLevel}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${leftEarLevel}%` }} />
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-white/[0.04] border border-white/10">
                          <div className="flex justify-between text-[10px] font-bold text-white/60 mb-1">
                            <span>R-EAR</span>
                            <span className="text-cyan-300">{rightEarLevel}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${rightEarLevel}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Real-Time Vocal Stem Isolator */}
                  <div className="p-5 rounded-3xl bg-black/50 border border-white/15 space-y-3 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <span>🎤 Real-Time Vocal Stem Isolator</span>
                      </h3>
                      {vocalMode !== 'normal' && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-purple-500/25 border border-purple-400/40 text-purple-200">
                          {vocalMode}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {VOCAL_STEM_MODES.map((m) => {
                        const active = vocalMode === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setVocalMode(m.id)}
                            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                              active
                                ? `bg-white/15 ${m.borderActive} ring-1 ring-white/20`
                                : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xl">{m.icon}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${active ? 'bg-white text-black' : 'bg-white/10 text-white/50'}`}>
                                {m.badge}
                              </span>
                            </div>
                            <div>
                              <div className="text-xs font-black text-white truncate">{m.name}</div>
                              <p className="text-[10px] text-white/50 line-clamp-2 mt-0.5">{m.tagline}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= 2C. PROCEDURAL AMBIENT SOUNDSCAPES & TIMERS ================= */}
          {(consoleView === 'full' || consoleView === 'ambient') && (
            <div className="p-5 sm:p-6 rounded-3xl bg-black/45 border border-white/15 space-y-5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <span>🌧️ Procedural Ambient Soundscapes & Focus Station</span>
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Synthesized live via Web Audio — layer beneath music or listen solo for deep study & sleep.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {AMBIENT_SCENE_PRESETS.map((scene) => (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => applyAmbientPreset(scene.mix)}
                      className="px-3 py-1 rounded-full glass-button text-xs font-bold text-emerald-300 hover:text-white cursor-pointer"
                    >
                      {scene.icon} {scene.label}
                    </button>
                  ))}
                  {hasAnyAmbient && (
                    <button
                      type="button"
                      onClick={stopAllAmbient}
                      className="px-3 py-1 rounded-full glass-button-primary text-xs font-black text-white cursor-pointer"
                    >
                      Mute All Ambience
                    </button>
                  )}
                </div>
              </div>

              {/* 6 Soundscape Channels */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {AMBIENT_LAYERS.map((layer) => {
                  const vol = ambientVolumes[layer.id] || 0;
                  const isActive = vol > 0.01;
                  return (
                    <div
                      key={layer.id}
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                        isActive
                          ? 'bg-emerald-500/15 border-emerald-400/40 shadow-md'
                          : 'bg-white/[0.03] border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{layer.icon}</span>
                        <button
                          type="button"
                          onClick={() => setAmbientVolume(layer.id as AmbientLayerId, isActive ? 0 : 0.45)}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black cursor-pointer ${
                            isActive ? 'bg-emerald-400 text-black' : 'bg-white/10 text-white/50 hover:text-white'
                          }`}
                        >
                          {isActive ? `${Math.round(vol * 100)}%` : 'OFF'}
                        </button>
                      </div>
                      <div>
                        <div className="text-xs font-black text-white truncate">{layer.name}</div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          value={vol}
                          onChange={(e) => setAmbientVolume(layer.id as AmbientLayerId, parseFloat(e.target.value))}
                          className="w-full mt-1.5 accent-emerald-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Focus Pomodoro & Sleep Timer Dock */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Pomodoro */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase text-white">⏱️ Focus Pomodoro</span>
                      {completedSessions > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                          🔥 {completedSessions}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5">25m focus / 5m recharge intervals</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black font-mono text-[var(--color-accent)] tabular-nums">
                      {formatClock(pomodoroSeconds)}
                    </span>
                    {pomodoroActive ? (
                      <button
                        type="button"
                        onClick={stopPomodoro}
                        className="px-3 py-1.5 rounded-xl glass-button-primary text-xs font-black text-white cursor-pointer"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startPomodoro('focus')}
                        className="px-3 py-1.5 rounded-xl glass-button-primary text-xs font-black text-white cursor-pointer"
                      >
                        Start 25m
                      </button>
                    )}
                  </div>
                </div>

                {/* Sleep Timer */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-black uppercase text-white">🌙 Sleep Fade-Out Timer</span>
                    <p className="text-[11px] text-white/50 mt-0.5">Fades volume smoothly to sleep</p>
                  </div>
                  {sleepActive ? (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black font-mono text-purple-300 tabular-nums">
                        {sleepEndAtTrack ? 'End of Song' : formatClock(sleepRemaining)}
                      </span>
                      <button
                        type="button"
                        onClick={stopSleepTimer}
                        className="px-3 py-1.5 rounded-xl glass-button text-xs font-bold text-rose-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {[15, 30, 45].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => startSleepTimer(mins)}
                          className="px-2.5 py-1 rounded-xl glass-button text-xs font-bold text-white cursor-pointer"
                        >
                          {mins}m
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setEndAtTrack(true)}
                        className="px-2.5 py-1 rounded-xl glass-button text-xs font-bold text-white cursor-pointer"
                      >
                        End
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
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
