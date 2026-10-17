import { useEffect, useRef, useState, useMemo, Component, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useStudioStore,
  STUDIO_FX_MODES,
  AMBIENT_LAYERS,
  type StudioFXMode,
  type AmbientLayerId
} from '../../stores/studioStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useSleepTimer } from '../../hooks/useSleepTimer';
import {
  getAudioFrequencyData,
  setLiveSpatialManualPosition,
  subscribeLiveSpatial,
  getLiveSpatialState,
  unlockAudioEngine,
  resumeAudioContextIfNeeded
} from '../../services/audioEngine';
import InteractiveEQ from './InteractiveEQ';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

type StudioTab = 'eq' | 'spatial' | 'mastering' | 'ambient';

const STUDIO_BACKDROP_TRANSITION = { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const };
const STUDIO_PANEL_VARIANTS = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    filter: 'blur(16px)'
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.36,
      ease: [0.16, 1, 0.3, 1] as const
    }
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 14,
    filter: 'blur(10px)',
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1] as const
    }
  }
};

/**
 * Minimalist Apple-Grade Fluid Gesture Slider
 * Pill-shaped track with filled gradient, elevated white thumb, and formatted readout.
 */
function AppleFluidSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  formattedValue,
  accentColor = 'cyan',
  onChange,
  onReset
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formattedValue: string;
  accentColor?: 'cyan' | 'amber' | 'indigo' | 'pink' | 'emerald';
  onChange: (val: number) => void;
  onReset?: () => void;
}) {
  const percent = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const accentGradients = {
    cyan: 'from-cyan-500 via-sky-400 to-blue-500',
    amber: 'from-amber-400 via-orange-400 to-rose-500',
    indigo: 'from-indigo-500 via-purple-500 to-pink-500',
    pink: 'from-pink-500 via-rose-500 to-red-500',
    emerald: 'from-emerald-400 via-teal-400 to-cyan-500'
  };

  const accentThumbBorders = {
    cyan: 'border-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.5)]',
    amber: 'border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)]',
    indigo: 'border-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.5)]',
    pink: 'border-pink-300 shadow-[0_0_12px_rgba(244,63,94,0.5)]',
    emerald: 'border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
  };

  return (
    <div className="space-y-1.5 select-none group">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white/80 group-hover:text-white transition-colors">
          {label}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="font-mono text-xs font-bold text-white/90 hover:text-white transition cursor-pointer"
          title={onReset ? 'Double-click to reset' : undefined}
        >
          {formattedValue}
        </button>
      </div>

      <div className="relative h-6 flex items-center">
        {/* Track Bar */}
        <div className="w-full h-2 rounded-full bg-white/10 relative overflow-hidden backdrop-blur-md">
          <div
            className={`h-full bg-gradient-to-r ${accentGradients[accentColor]} transition-all duration-75`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Elevated Thumb */}
        <div
          className={`absolute w-4.5 h-4.5 -ml-2 rounded-full bg-white border-2 ${accentThumbBorders[accentColor]} pointer-events-none transition-transform group-hover:scale-125 shadow-md`}
          style={{ left: `${percent}%` }}
        />

        {/* Native Touch & Mouse Range */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            onChange(parseFloat(e.target.value));
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

function StudioFXModalContent({ onClose }: { onClose: () => void }) {
  const {
    fxMode,
    spatialOrbitAuto,
    spatialOrbitSpeed,
    spatialRoomSize,
    spatialManualPos,
    subBassBoost,
    harmonicDrive,
    stereoWidth,
    reverbMix,
    trebleAir,
    ambientVolumes,
    pomodoroActive,
    pomodoroMode,
    pomodoroSeconds,
    completedSessions,
    setFxMode,
    setSpatialOrbitAuto,
    setSpatialOrbitSpeed,
    setSpatialRoomSize,
    setSpatialManualPos,
    setSubBassBoost,
    setHarmonicDrive,
    setStereoWidth,
    setReverbMix,
    setTrebleAir,
    resetMasteringRack,
    resetToOriginal,
    setAmbientVolume,
    applyAmbientPreset,
    stopAllAmbient,
    startPomodoro,
    stopPomodoro
  } = useStudioStore();

  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const {
    isActive: sleepActive,
    timeRemaining: sleepRemaining,
    endAtTrack: sleepEndAtTrack,
    startTimer: startSleepTimer,
    stopTimer: stopSleepTimer,
    setEndAtTrack
  } = useSleepTimer();

  // Active tab state
  const [activeTab, setActiveTab] = useState<StudioTab>(() => {
    if (fxMode === '8d-orbit' || fxMode === 'arena-live') return 'spatial';
    return 'eq';
  });

  // Permanently unlock AudioContext on mount
  useEffect(() => {
    unlockAudioEngine();
    resumeAudioContextIfNeeded();
  }, []);

  const radarRef = useRef<HTMLDivElement>(null);
  const orbDotRef = useRef<HTMLDivElement>(null);
  const stageZoneRef = useRef<HTMLDivElement>(null);
  const azimuthRef = useRef<HTMLDivElement>(null);
  const distanceRef = useRef<HTMLDivElement>(null);
  const leftEarRef = useRef<HTMLDivElement>(null);
  const rightEarRef = useRef<HTMLDivElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);

  const prevVisualsRef = useRef({ az: '', dist: '', l: '', r: '', zone: '' });

  // Update radar visuals without triggering React re-renders
  const updateRadarVisuals = (
    x: number,
    z: number,
    spatialState?: ReturnType<typeof getLiveSpatialState>
  ) => {
    if (orbDotRef.current) {
      orbDotRef.current.style.transform = `translate(${x * 68}px, ${z * 68}px)`;
    }
    const state = spatialState || getLiveSpatialState();
    const azStr = `${state.azimuthDeg}°`;
    const distStr = `${(state.distanceMeters || 0).toFixed(2)} m`;
    const lStr = `${state.leftEarPct}%`;
    const rStr = `${state.rightEarPct}%`;
    const zoneStr = state.stageZone || '';

    const p = prevVisualsRef.current;
    if (p.az !== azStr && azimuthRef.current) {
      p.az = azStr;
      azimuthRef.current.textContent = azStr;
    }
    if (p.dist !== distStr && distanceRef.current) {
      p.dist = distStr;
      distanceRef.current.textContent = distStr;
    }
    if (p.l !== lStr && leftEarRef.current) {
      p.l = lStr;
      leftEarRef.current.textContent = lStr;
    }
    if (p.r !== rStr && rightEarRef.current) {
      p.r = rStr;
      rightEarRef.current.textContent = rStr;
    }
    if (p.zone !== zoneStr && stageZoneRef.current) {
      p.zone = zoneStr;
      stageZoneRef.current.textContent = zoneStr;
    }
  };

  // Real-time 60fps 32-Band Spectrum Analyzer Canvas
  useEffect(() => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isMounted = true;
    const freqData = new Uint8Array(64);
    const peakBars = new Float32Array(32);
    let raf = 0;
    let phase = 0;

    const renderSpectrum = () => {
      if (!isMounted) return;
      phase += 0.04;
      const hasLive = getAudioFrequencyData(freqData);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle horizontal dB reference grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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
        let norm = 0.06;
        if (hasLive) {
          const bin = Math.min(freqData.length - 1, Math.floor((i / barCount) * 44));
          norm = Math.max(0.06, freqData[bin] / 255);
        } else if (isPlaying) {
          norm =
            0.12 +
            0.35 * Math.abs(Math.sin(phase + i * 0.25)) * Math.cos(phase * 0.7 - i * 0.15);
        }

        if (norm > peakBars[i]) {
          peakBars[i] = norm;
        } else {
          peakBars[i] = Math.max(0.06, peakBars[i] - 0.015);
        }

        const barH = Math.max(3, norm * (h - 4));
        const x = i * (barW + gap);
        const y = h - barH;

        // Apple-grade multi-spectrum gradient (Cyan -> Purple -> Coral)
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.85)');
        grad.addColorStop(0.55, 'rgba(168, 85, 247, 0.95)');
        grad.addColorStop(1, 'rgba(250, 45, 72, 1)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        if ('roundRect' in ctx && typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barW, barH, 2);
        } else {
          ctx.rect(x, y, barW, barH);
        }
        ctx.fill();

        // Glowing peak hold dot
        const peakY = h - Math.max(3, peakBars[i] * (h - 4));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, Math.max(0, peakY - 2), barW, 2);
      }

      raf = requestAnimationFrame(renderSpectrum);
    };

    raf = requestAnimationFrame(renderSpectrum);
    return () => {
      isMounted = false;
      cancelAnimationFrame(raf);
    };
  }, [isPlaying]);

  // Subscribe to live spatial engine
  useEffect(() => {
    if (fxMode !== '8d-orbit') return;
    const unsubscribe = subscribeLiveSpatial((state) => {
      updateRadarVisuals(state.x, state.z, state);
    });
    return unsubscribe;
  }, [fxMode]);

  // Sync manual position changes to global engine
  useEffect(() => {
    if (fxMode === '8d-orbit' && !spatialOrbitAuto) {
      const ox = spatialManualPos?.x ?? 0;
      const oz = spatialManualPos?.z ?? 0;
      setLiveSpatialManualPosition(ox, oz);
      updateRadarVisuals(ox, oz);
    }
  }, [spatialManualPos, spatialOrbitAuto, fxMode]);

  // Sync manual radar drag to audio engine
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
    setLiveSpatialManualPosition(dx, dz);
    updateRadarVisuals(dx, dz);
  };

  const initialSpatial = getLiveSpatialState();
  const initialOrbX = initialSpatial.x;
  const initialOrbZ = initialSpatial.z;
  const initialAzimuthDeg = initialSpatial.azimuthDeg;
  const initialDistanceMeters = initialSpatial.distanceMeters.toFixed(2);
  const initialLeftEarLevel = initialSpatial.leftEarPct;
  const initialRightEarLevel = initialSpatial.rightEarPct;
  const initialStageZoneLabel = initialSpatial.stageZone;

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const safeAmbientVolumes = useMemo(() => {
    return ambientVolumes || {
      rain: 0,
      vinyl: 0,
      waves: 0,
      binaural: 0,
      campfire: 0,
      cafe: 0
    };
  }, [ambientVolumes]);

  const hasCustomDSP = useMemo(() => {
    return (
      fxMode !== 'normal' ||
      subBassBoost > 0 ||
      harmonicDrive > 0 ||
      stereoWidth > 0 ||
      reverbMix > 0 ||
      trebleAir !== 0 ||
      Object.values(safeAmbientVolumes).some((v) => v > 0)
    );
  }, [fxMode, subBassBoost, harmonicDrive, stereoWidth, reverbMix, trebleAir, safeAmbientVolumes]);

  const activeAmbientCount = useMemo(() => {
    return Object.values(safeAmbientVolumes).filter((v) => v > 0.02).length;
  }, [safeAmbientVolumes]);

  return (
    <div onPointerDown={unlockAudioEngine} className="flex flex-col h-full max-h-[92vh] sm:max-h-[86vh] overflow-hidden select-none">
      {/* iOS Drag Handle */}
      <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 sm:hidden flex-shrink-0" />

      {/* ── Top Apple Floating Window Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-0 flex-shrink-0 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[var(--color-accent)] via-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/20 text-white flex-shrink-0">
            <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="studio-fx-modal-title" className="text-base font-bold tracking-tight text-white">
                Studio FX & Audio EQ
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border-0 text-cyan-300 text-[9px] font-black tracking-wider uppercase">
                32-Bit Lossless DSP
              </span>
            </div>
            <p className="text-[11px] text-white/50 font-medium">
              360° Spatial Audio • Catmull-Rom Spline EQ • 12AX7 Tube Saturation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasCustomDSP && (
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                resetToOriginal();
              }}
              className="px-3 py-1.5 rounded-full border-0 glass-button text-xs font-semibold text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Reset all effects to flat reference audio"
            >
              <span>↺</span>
              <span>Reset</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerAndroidHaptic('light');
              onClose();
            }}
            aria-label="Close Studio FX"
            className="w-8 h-8 rounded-full glass-button border-0 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer text-xs font-bold active:scale-95"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Apple-Grade Segmented Tab Pills ── */}
      <div className="px-5 pt-3 pb-1 flex-shrink-0">
        <div className="flex items-center p-1 rounded-2xl liquid-glass bg-white/[0.04] border-0 relative">
          {[
            { id: 'eq', label: '10-Band EQ', icon: '📊' },
            { id: 'spatial', label: 'Spatial Audio', icon: '🪐' },
            { id: 'mastering', label: 'Analog Master', icon: '🎚️' },
            {
              id: 'ambient',
              label: 'Ambient & Timers',
              icon: '🌧️',
              badge: activeAmbientCount > 0 ? `${activeAmbientCount}` : sleepActive ? '🌙' : null
            }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setActiveTab(tab.id as StudioTab);
                }}
                className={`relative flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer z-10 ${
                  isActive ? 'text-white' : 'text-white/55 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="studio-active-tab-pill"
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/[0.18] via-white/[0.12] to-white/[0.06] border-0 shadow-[0_4px_16px_rgba(0,0,0,0.4)] pointer-events-none"
                  />
                )}
                <span className="relative z-10 text-xs">{tab.icon}</span>
                <span className="relative z-10 text-xs font-bold truncate">{tab.label}</span>
                {tab.badge && (
                  <span className="relative z-10 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-cyan-400 text-black">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable Tab Content ── */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 no-scrollbar">
        {/* ── TAB 1: 10-BAND INTERACTIVE EQUALIZER ── */}
        {activeTab === 'eq' && (
          <div className="space-y-4">
            <InteractiveEQ />
          </div>
        )}

        {/* ── TAB 2: 3D SPATIAL AUDIO & RADAR ── */}
        {activeTab === 'spatial' && (
          <div className="space-y-4">
            {/* Soundstage Mode Selector Cards */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">
                Acoustic Soundstage
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {STUDIO_FX_MODES.map((mode) => {
                  const isSelected = fxMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setFxMode(mode.id as StudioFXMode);
                        if (mode.id === '8d-orbit') {
                          setSpatialOrbitAuto(true);
                        }
                      }}
                      className={`text-left p-3 rounded-2xl border-0 transition-all cursor-pointer relative overflow-hidden group ${
                        isSelected
                          ? 'liquid-glass bg-cyan-500/15 shadow-[0_0_24px_rgba(6,182,212,0.25)]'
                          : 'liquid-glass hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xl">{mode.icon}</span>
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            isSelected
                              ? 'bg-cyan-400 text-black shadow-sm'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {mode.badge}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-white">{mode.name}</div>
                      <p className="text-[10px] text-white/55 line-clamp-2 mt-0.5 leading-snug">
                        {mode.description}
                      </p>
                      {isSelected && (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 360° Interactive Spatial Radar Card */}
            <div className="rounded-2xl border-0 liquid-glass p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 text-lg">🪐</span>
                  <div>
                    <div className="font-bold text-sm text-white">360° Binaural Spatial Radar</div>
                    <div className="text-[11px] text-white/50">
                      Drag anywhere on the radar stage to manually steer audio in 3D binaural space.
                    </div>
                  </div>
                </div>
                <div
                  ref={stageZoneRef}
                  className="text-xs font-semibold text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-full border-0 flex-shrink-0"
                >
                  {initialStageZoneLabel}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6 my-2">
                {/* 2D Interactive Radar Display */}
                <div
                  ref={radarRef}
                  onPointerDown={(e) => {
                    updateRadarPosFromPointer(e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons === 1) {
                      updateRadarPosFromPointer(e.clientX, e.clientY);
                    }
                  }}
                  className="relative w-44 h-44 rounded-full border-0 bg-black/60 shadow-[0_0_30px_rgba(6,182,212,0.15)] flex items-center justify-center cursor-crosshair flex-shrink-0 touch-none select-none"
                >
                  <div className="absolute inset-4 rounded-full border-0 bg-cyan-500/[0.04] pointer-events-none" />
                  <div className="absolute inset-9 rounded-full border-0 bg-cyan-500/[0.06] pointer-events-none" />
                  <div className="absolute inset-14 rounded-full border-0 bg-cyan-500/[0.08] pointer-events-none" />

                  {/* Listener Head */}
                  <div className="w-8 h-8 rounded-full bg-white/15 border-0 flex items-center justify-center text-xs shadow-md z-10 pointer-events-none">
                    🎧
                  </div>

                  {/* Positioned Sound Dot */}
                  <div
                    ref={orbDotRef}
                    className="absolute w-5 h-5 rounded-full bg-cyan-400 border-0 shadow-[0_0_16px_rgba(6,182,212,1)] z-20 pointer-events-none transition-none"
                    style={{
                      left: 'calc(50% - 10px)',
                      top: 'calc(50% - 10px)',
                      transform: `translate(${initialOrbX * 68}px, ${initialOrbZ * 68}px)`
                    }}
                  />
                </div>

                {/* Readouts & Fluid Sliders */}
                <div className="flex-1 w-full space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl liquid-glass border-0">
                      <div className="text-white/45 text-[10px] uppercase font-bold">Azimuth</div>
                      <div ref={azimuthRef} className="text-sm font-black text-cyan-300">
                        {initialAzimuthDeg}°
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl liquid-glass border-0">
                      <div className="text-white/45 text-[10px] uppercase font-bold">Distance</div>
                      <div ref={distanceRef} className="text-sm font-black text-white">
                        {initialDistanceMeters} m
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl liquid-glass border-0">
                      <div className="text-white/45 text-[10px] uppercase font-bold">Left Ear</div>
                      <div ref={leftEarRef} className="text-sm font-black text-cyan-400">
                        {initialLeftEarLevel}%
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl liquid-glass border-0">
                      <div className="text-white/45 text-[10px] uppercase font-bold">Right Ear</div>
                      <div ref={rightEarRef} className="text-sm font-black text-indigo-400">
                        {initialRightEarLevel}%
                      </div>
                    </div>
                  </div>

                  {/* Auto-Orbit Toggle Button */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-semibold text-white/80">Continuous 360° Auto-Orbit</span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setSpatialOrbitAuto(!spatialOrbitAuto);
                        if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer border-0 ${
                        spatialOrbitAuto
                          ? 'bg-cyan-400 text-black shadow-md shadow-cyan-400/20'
                          : 'bg-white/10 text-white/60 hover:bg-white/15'
                      }`}
                    >
                      {spatialOrbitAuto ? 'Auto-Orbit: ON' : 'Manual Lock'}
                    </button>
                  </div>

                  {spatialOrbitAuto && (
                    <AppleFluidSlider
                      label="Orbit Rotation Speed"
                      value={spatialOrbitSpeed || 0.12}
                      min={0.05}
                      max={0.35}
                      step={0.01}
                      formattedValue={`${((spatialOrbitSpeed || 0.12) * 10).toFixed(1)}x`}
                      accentColor="cyan"
                      onChange={setSpatialOrbitSpeed}
                      onReset={() => setSpatialOrbitSpeed(0.12)}
                    />
                  )}

                  <AppleFluidSlider
                    label="Spatial Room Depth"
                    value={spatialRoomSize || 0.26}
                    min={0.05}
                    max={0.65}
                    step={0.01}
                    formattedValue={`${Math.round((spatialRoomSize || 0.26) * 100)}%`}
                    accentColor="indigo"
                    onChange={setSpatialRoomSize}
                    onReset={() => setSpatialRoomSize(0.26)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: ANALOG MASTER & TUBE ── */}
        {activeTab === 'mastering' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-sm text-white">Studio DSP Mastering Rack</div>
                <div className="text-[11px] text-white/50">
                  Hardware-grade analog processing with transparent dynamic limiting
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  resetMasteringRack();
                }}
                className="px-2.5 py-1 rounded-xl glass-button text-xs font-bold text-white/70 hover:text-white transition cursor-pointer"
              >
                Reset Rack
              </button>
            </div>

            {/* Analog Vacuum Tube Visualizer Card */}
            <div className="relative rounded-2xl liquid-glass border-0 p-4 overflow-hidden bg-gradient-to-b from-[#140b07]/80 via-[#0d0705]/90 to-[#060403]">
              <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-300 blur-2xl"
                style={{
                  background: `radial-gradient(circle at 50% 50%, rgba(251, 146, 60, ${harmonicDrive * 0.45}) 0%, rgba(234, 88, 12, ${harmonicDrive * 0.2}) 50%, transparent 80%)`
                }}
              />

              <div className="relative z-10 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {/* SVG 12AX7 Vacuum Tube */}
                  <div className="relative w-12 h-16 sm:w-14 sm:h-20 flex-shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 60 90" className="w-full h-full drop-shadow-md">
                      <path
                        d="M 15 80 L 15 35 Q 15 15, 30 15 Q 45 15, 45 35 L 45 80 Z"
                        fill="rgba(255, 255, 255, 0.04)"
                        stroke="rgba(255, 255, 255, 0.3)"
                        strokeWidth="1.5"
                      />
                      <path d="M 28 15 Q 30 10, 32 15" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.5" fill="none" />
                      <rect x="22" y="32" width="16" height="38" rx="2" fill="none" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1" />
                      <line x1="24" y1="40" x2="36" y2="40" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.8" />
                      <line x1="24" y1="48" x2="36" y2="48" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.8" />
                      <line x1="24" y1="56" x2="36" y2="56" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.8" />
                      <line x1="24" y1="64" x2="36" y2="64" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.8" />

                      {/* Filament Coil */}
                      <path
                        d="M 28 72 L 28 38 Q 30 35, 32 38 L 32 72"
                        fill="none"
                        stroke={harmonicDrive > 0.05 ? '#fb923c' : 'rgba(255, 255, 255, 0.25)'}
                        strokeWidth={harmonicDrive > 0.05 ? 2.5 : 1.2}
                        strokeLinecap="round"
                        style={{
                          filter: harmonicDrive > 0.05 ? `drop-shadow(0 0 ${4 + harmonicDrive * 8}px #f97316)` : undefined,
                          transition: 'all 0.3s ease'
                        }}
                      />

                      <line x1="18" y1="80" x2="18" y2="87" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                      <line x1="26" y1="80" x2="26" y2="88" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                      <line x1="34" y1="80" x2="34" y2="88" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                      <line x1="42" y1="80" x2="42" y2="87" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-amber-300 font-mono">12AX7 / ECC83</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 border-0 text-amber-200 font-bold uppercase tracking-wider">
                        Triode Saturation
                      </span>
                    </div>
                    <div className="text-[11px] text-white/60 mt-0.5">
                      {harmonicDrive < 0.05
                        ? 'Zero Coloration • Bit-perfect linear bypass'
                        : harmonicDrive < 0.35
                          ? 'Warm Tape Glue • Gentle even harmonics & soft compression'
                          : harmonicDrive < 0.7
                            ? 'Vintage Class-A Valve • Rich analog saturation'
                            : 'Hot Valve Overdrive • High-energy tape compression'}
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-base font-black font-mono text-amber-300">
                    {Math.round(harmonicDrive * 100)}%
                  </div>
                  <div className="text-[10px] text-white/40 uppercase font-semibold tracking-wider">
                    Drive
                  </div>
                </div>
              </div>

              {/* Quick Tube Presets */}
              <div className="flex items-center gap-1.5 pt-2.5 mt-2.5 border-0">
                {[
                  { label: 'Clean (0%)', val: 0 },
                  { label: 'Warm Tape (25%)', val: 0.25 },
                  { label: 'Vintage Tube (50%)', val: 0.5 },
                  { label: 'Hot Valve (80%)', val: 0.8 }
                ].map((tp) => (
                  <button
                    key={tp.label}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setHarmonicDrive(tp.val);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition cursor-pointer border-0 ${
                      Math.abs(harmonicDrive - tp.val) < 0.05
                        ? 'bg-amber-400 text-black shadow-sm'
                        : 'liquid-glass text-white/65 hover:text-white'
                    }`}
                  >
                    {tp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Apple Fluid Gesture Sliders Card */}
            <div className="p-4 rounded-2xl border-0 liquid-glass space-y-4">
              <AppleFluidSlider
                label="Sub-Bass Floor (54Hz Low-Shelf)"
                value={subBassBoost}
                min={0}
                max={9}
                step={0.5}
                formattedValue={`+${subBassBoost.toFixed(1)} dB`}
                accentColor="cyan"
                onChange={setSubBassBoost}
                onReset={() => setSubBassBoost(0)}
              />

              <AppleFluidSlider
                label="Harmonic Drive (Analog Tape Warmth)"
                value={harmonicDrive}
                min={0}
                max={1}
                step={0.05}
                formattedValue={`${Math.round(harmonicDrive * 100)}%`}
                accentColor="amber"
                onChange={setHarmonicDrive}
                onReset={() => setHarmonicDrive(0)}
              />

              <AppleFluidSlider
                label="Stereo Width (Haas Matrix)"
                value={stereoWidth}
                min={0}
                max={1}
                step={0.05}
                formattedValue={`${Math.round(stereoWidth * 100)}%`}
                accentColor="indigo"
                onChange={setStereoWidth}
                onReset={() => setStereoWidth(0)}
              />

              <AppleFluidSlider
                label="Treble Silk Air (11kHz Silk Shelf / Lo-Fi Cut)"
                value={trebleAir}
                min={-6}
                max={6}
                step={0.5}
                formattedValue={trebleAir > 0 ? `+${trebleAir.toFixed(1)} dB` : `${trebleAir.toFixed(1)} dB`}
                accentColor="pink"
                onChange={setTrebleAir}
                onReset={() => setTrebleAir(0)}
              />

              <AppleFluidSlider
                label="Concert Hall Reverb Echo"
                value={reverbMix}
                min={0}
                max={0.75}
                step={0.02}
                formattedValue={`${Math.round(reverbMix * 100)}%`}
                accentColor="amber"
                onChange={setReverbMix}
                onReset={() => setReverbMix(0)}
              />
            </div>

            {/* 1-Tap Mastering Preset Chips */}
            <div className="pt-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">
                Acoustic Mastering Presets
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'Hi-Fi Punch', bass: 4.5, drive: 0.2, width: 0.35, air: 1.5, rev: 0.05 },
                  { label: 'Warm Analog', bass: 3.0, drive: 0.55, width: 0.15, air: -1.0, rev: 0 },
                  { label: 'Wide Concert', bass: 3.5, drive: 0.15, width: 0.8, air: 2.0, rev: 0.25 },
                  { label: 'Lo-Fi Velvet', bass: 2.5, drive: 0.45, width: 0, air: -4.0, rev: 0.1 }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setSubBassBoost(preset.bass);
                      setHarmonicDrive(preset.drive);
                      setStereoWidth(preset.width);
                      setTrebleAir(preset.air);
                      setReverbMix(preset.rev);
                    }}
                    className="px-3 py-1.5 rounded-xl glass-button text-xs font-semibold text-white/80 hover:text-white transition cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: AMBIENT & TIMERS ── */}
        {activeTab === 'ambient' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-sm text-white">Procedural Ambient Soundscapes</div>
                <div className="text-[11px] text-white/50">
                  Real-time procedural Web Audio soundscapes synthesized directly in your browser
                </div>
              </div>
              {activeAmbientCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    stopAllAmbient();
                  }}
                  className="px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 border-0 text-xs font-bold hover:bg-rose-500/30 transition cursor-pointer"
                >
                  Mute All
                </button>
              )}
            </div>

            {/* 6 Ambient Soundscape Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AMBIENT_LAYERS.map((layer) => {
                const vol = (safeAmbientVolumes && safeAmbientVolumes[layer.id]) || 0;
                const isActive = vol > 0.02;
                return (
                  <div
                    key={layer.id}
                    className={`p-3.5 rounded-2xl border-0 transition-all ${
                      isActive
                        ? 'liquid-glass bg-emerald-500/10'
                        : 'liquid-glass'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{layer.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-white">{layer.name}</div>
                          <div className="text-[10px] text-white/50">{layer.subtitle}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setAmbientVolume(layer.id, isActive ? 0 : 0.5);
                        }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition cursor-pointer ${
                          isActive
                            ? 'glass-button-emerald text-emerald-200'
                            : 'glass-button text-white/70'
                        }`}
                      >
                        {isActive ? `${Math.round(vol * 100)}%` : 'OFF'}
                      </button>
                    </div>

                    <AppleFluidSlider
                      label="Layer Volume"
                      value={vol}
                      min={0}
                      max={1}
                      step={0.02}
                      formattedValue={`${Math.round(vol * 100)}%`}
                      accentColor="emerald"
                      onChange={(val) => setAmbientVolume(layer.id, val)}
                    />
                  </div>
                );
              })}
            </div>

            {/* Ambient Presets */}
            <div className="pt-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">
                Atmospheric Mix Presets
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: '🌧️ Rainy Study', preset: { rain: 0.65, binaural: 0.45 } },
                  { label: '☕ Midnight Cafe', preset: { cafe: 0.5, vinyl: 0.35 } },
                  { label: '🔥 Campfire Night', preset: { campfire: 0.6, rain: 0.25 } },
                  { label: '🌊 Coastal Calm', preset: { waves: 0.7, vinyl: 0.2 } }
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      applyAmbientPreset(p.preset as Partial<Record<AmbientLayerId, number>>);
                    }}
                    className="px-3 py-1.5 rounded-xl glass-button text-xs font-semibold text-white/80 hover:text-white transition cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Sleep & Focus Timers Section ── */}
            <div className="pt-4 border-0 space-y-4">
              {/* Sleep Timer */}
              <div className="p-4 rounded-2xl border-0 liquid-glass space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🌙</span>
                    <div>
                      <div className="font-bold text-sm text-white">Sleep Timer</div>
                      <div className="text-[11px] text-white/50">
                        Automatically fades volume over 10s and pauses playback
                      </div>
                    </div>
                  </div>
                  {sleepActive && (
                    <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border-0">
                      {sleepEndAtTrack ? 'End of song' : formatClock(sleepRemaining)}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {sleepActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        stopSleepTimer();
                      }}
                      className="px-4 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border-0 text-xs font-bold hover:bg-rose-500/30 transition cursor-pointer"
                    >
                      Cancel Sleep Timer
                    </button>
                  ) : (
                    <>
                      {[15, 30, 45, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            triggerAndroidHaptic('light');
                            startSleepTimer(mins);
                          }}
                          className="px-3 py-1.5 rounded-xl glass-button text-xs font-bold text-white/80 hover:text-white transition cursor-pointer"
                        >
                          {mins} mins
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setEndAtTrack(true);
                        }}
                        className="px-3 py-1.5 rounded-xl glass-button text-xs font-bold text-white/80 hover:text-white transition cursor-pointer"
                      >
                        End of Song
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Pomodoro Focus Timer */}
              <div className="p-4 rounded-2xl border-0 liquid-glass space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🍅</span>
                    <div>
                      <div className="font-bold text-sm text-white">Pomodoro Focus Timer</div>
                      <div className="text-[11px] text-white/50">
                        25-minute deep focus sprints with 5-minute restorative breaks
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-500/15 px-2.5 py-0.5 rounded-full border-0">
                      {formatClock(pomodoroSeconds)} ({pomodoroMode})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {pomodoroActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        stopPomodoro();
                      }}
                      className="px-4 py-1.5 rounded-xl glass-button text-rose-300 border-0 text-xs font-bold transition cursor-pointer"
                    >
                      Pause Focus Sprint
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        startPomodoro(pomodoroMode);
                      }}
                      className="px-4 py-1.5 rounded-xl glass-button-emerald text-emerald-100 text-xs font-bold transition cursor-pointer"
                    >
                      Start Focus ({formatClock(pomodoroSeconds)})
                    </button>
                  )}
                  {completedSessions > 0 && (
                    <span className="text-xs text-white/50 font-medium">
                      🎉 {completedSessions} session{completedSessions === 1 ? '' : 's'} completed
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Docked Real-Time 32-Band Spectrum Analyzer ── */}
      <div className="px-5 py-2.5 border-0 flex-shrink-0 bg-white/[0.02]">
        <div className="flex items-center justify-between text-xs text-white/50 font-semibold mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Live Spectrum Analyzer</span>
          </span>
          <span className="font-mono text-[9px] text-cyan-400">FFT 60 FPS</span>
        </div>
        <div className="h-10 w-full rounded-xl border-0 bg-black/40 overflow-hidden p-1 shadow-inner">
          <canvas
            ref={spectrumCanvasRef}
            width={600}
            height={36}
            className="w-full h-full block"
          />
        </div>
      </div>
    </div>
  );
}

class StudioFXErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[WaveCraft StudioFXModal Error]', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-white space-y-4">
          <div className="text-3xl">🎛️</div>
          <div className="text-base font-bold">Studio FX encountered an issue</div>
          <p className="text-xs text-white/60">An unexpected audio workstation error occurred.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-1.5 rounded-xl bg-cyan-400 text-black font-bold text-xs cursor-pointer hover:bg-cyan-300 transition"
            >
              Try Again
            </button>
            <button
              onClick={this.props.onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 text-white font-bold text-xs cursor-pointer hover:bg-white/20 transition"
            >
              Close
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function StudioFXModal() {
  const isStudioModalOpen = useStudioStore((s) => s.isStudioModalOpen);
  const setStudioModalOpen = useStudioStore((s) => s.setStudioModalOpen);

  const handleClose = () => setStudioModalOpen(false);

  useEffect(() => {
    if (!isStudioModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isStudioModalOpen]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isStudioModalOpen && (
        <div className="fixed inset-0 z-[9995] flex items-end sm:items-center justify-center p-0 sm:p-5 overflow-hidden select-none">
          {/* Frosted Modal Backdrop */}
          <motion.div
            key="studio-fx-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STUDIO_BACKDROP_TRANSITION}
            onClick={handleClose}
            className="absolute inset-0 modal-backdrop-blur bg-black/75 cursor-pointer"
            aria-hidden="true"
          />

          {/* Minimalist Apple-Grade Floating Sheet Chassis */}
          <motion.div
            key="studio-fx-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-fx-modal-title"
            variants={STUDIO_PANEL_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-[32px] sm:rounded-[28px] liquid-glass bg-[#080812]/92 backdrop-blur-3xl text-white shadow-[0_32px_100px_rgba(0,0,0,0.85),0_0_60px_rgba(6,182,212,0.12)] overflow-hidden border-0 pb-[max(env(safe-area-inset-bottom,0px),0px)]"
          >
            <StudioFXErrorBoundary onClose={handleClose}>
              <StudioFXModalContent onClose={handleClose} />
            </StudioFXErrorBoundary>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
