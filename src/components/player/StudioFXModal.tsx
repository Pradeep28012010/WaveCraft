import { useEffect, useRef, useState, useMemo } from 'react';
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
import { getAudioFrequencyData, setLiveSpatialPan } from '../../services/audioEngine';

type StudioTab = 'spatial' | 'mastering' | 'arena' | 'ambient' | 'timers';

const BACKDROP_TRANSITION = { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };
const PANEL_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

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
    preservePitch,
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
    setPreservePitch,
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

  // Active tab state: defaults according to active fxMode
  const [activeTab, setActiveTab] = useState<StudioTab>(() => {
    if (fxMode === '8d-orbit') return 'spatial';
    if (fxMode === 'arena-live') return 'arena';
    return 'mastering';
  });

  const radarRef = useRef<HTMLDivElement>(null);
  const orbDotRef = useRef<HTMLDivElement>(null);
  const stageZoneRef = useRef<HTMLDivElement>(null);
  const azimuthRef = useRef<HTMLDivElement>(null);
  const distanceRef = useRef<HTMLDivElement>(null);
  const leftEarRef = useRef<HTMLDivElement>(null);
  const rightEarRef = useRef<HTMLDivElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const orbitAngleRef = useRef(0);

  // Update radar position readout directly without React re-renders
  const updateRadarVisuals = (x: number, z: number) => {
    if (orbDotRef.current) {
      orbDotRef.current.style.transform = `translate(${x * 68}px, ${z * 68}px)`;
    }
    const azDeg = Math.round(((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360);
    const dist = (Math.hypot(x, z) * 2.5).toFixed(2);
    const lEar = Math.round(Math.min(100, Math.max(18, 72 - x * 38)));
    const rEar = Math.round(Math.min(100, Math.max(18, 72 + x * 38)));

    if (azimuthRef.current) azimuthRef.current.textContent = `${azDeg}°`;
    if (distanceRef.current) distanceRef.current.textContent = `${dist} m`;
    if (leftEarRef.current) leftEarRef.current.textContent = `${lEar}%`;
    if (rightEarRef.current) rightEarRef.current.textContent = `${rEar}%`;
    if (stageZoneRef.current) {
      const label =
        azDeg >= 315 || azDeg < 45
          ? 'Front Center Stage'
          : azDeg < 135
          ? 'Right Acoustic Wing'
          : azDeg < 225
          ? 'Rear Surround Halo'
          : 'Left Acoustic Wing';
      stageZoneRef.current.textContent = label;
    }
  };

  // High-Definition 60fps Real-Time Spectrum Analyzer Canvas
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
        } else if (isPlaying) {
          norm =
            0.15 +
            0.38 * Math.abs(Math.sin(phase + i * 0.25)) * Math.cos(phase * 0.7 - i * 0.15);
        }

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
        grad.addColorStop(0.55, 'rgba(168, 85, 247, 0.95)');
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
    return () => {
      isMounted = false;
      cancelAnimationFrame(raf);
    };
  }, [isPlaying]);

  // Real-Time 360° Orbit loop with zero React re-renders (direct DOM & WebAudio updates)
  useEffect(() => {
    if (!spatialOrbitAuto || fxMode !== '8d-orbit') return;
    let isMounted = true;
    let raf = 0;
    let last = performance.now();
    const speed = spatialOrbitSpeed || 0.12;

    const loop = (now: number) => {
      if (!isMounted) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      orbitAngleRef.current = (orbitAngleRef.current + dt * speed * Math.PI * 2) % (Math.PI * 2);
      const angle = orbitAngleRef.current;
      const ox = Math.sin(angle) * 0.78;
      const oz = -Math.cos(angle) * 0.78;
      setLiveSpatialPan(ox);
      updateRadarVisuals(ox, oz);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      isMounted = false;
      cancelAnimationFrame(raf);
    };
  }, [spatialOrbitAuto, spatialOrbitSpeed, fxMode]);

  // Update pan and visuals when manual position changes
  useEffect(() => {
    if (fxMode === '8d-orbit' && !spatialOrbitAuto) {
      const ox = spatialManualPos?.x ?? 0;
      const oz = spatialManualPos?.z ?? 0;
      setLiveSpatialPan(ox);
      updateRadarVisuals(ox, oz);
    }
  }, [spatialManualPos, spatialOrbitAuto, fxMode]);

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
    setLiveSpatialPan(dx);
    updateRadarVisuals(dx, dz);
  };

  const initialOrbX = spatialOrbitAuto
    ? Math.sin(orbitAngleRef.current) * 0.78
    : spatialManualPos?.x ?? 0;
  const initialOrbZ = spatialOrbitAuto
    ? -Math.cos(orbitAngleRef.current) * 0.78
    : spatialManualPos?.z ?? 0;
  const initialAzimuthDeg = Math.round(
    ((Math.atan2(initialOrbX, -initialOrbZ) * 180) / Math.PI + 360) % 360
  );
  const initialDistanceMeters = (Math.hypot(initialOrbX, initialOrbZ) * 2.5).toFixed(2);
  const initialLeftEarLevel = Math.round(Math.min(100, Math.max(18, 72 - initialOrbX * 38)));
  const initialRightEarLevel = Math.round(Math.min(100, Math.max(18, 72 + initialOrbX * 38)));
  const initialStageZoneLabel =
    initialAzimuthDeg >= 315 || initialAzimuthDeg < 45
      ? 'Front Center Stage'
      : initialAzimuthDeg < 135
      ? 'Right Acoustic Wing'
      : initialAzimuthDeg < 225
      ? 'Rear Surround Halo'
      : 'Left Acoustic Wing';

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const hasCustomDSP = useMemo(() => {
    return (
      fxMode !== 'normal' ||
      subBassBoost > 0 ||
      harmonicDrive > 0 ||
      stereoWidth > 0 ||
      reverbMix > 0 ||
      trebleAir !== 0 ||
      Object.values(ambientVolumes).some((v) => v > 0)
    );
  }, [fxMode, subBassBoost, harmonicDrive, stereoWidth, reverbMix, trebleAir, ambientVolumes]);

  const activeAmbientCount = useMemo(() => {
    return Object.values(ambientVolumes).filter((v) => v > 0.02).length;
  }, [ambientVolumes]);

  return (
    <div className="flex flex-col h-full max-h-[86vh] overflow-hidden">
      {/* ── Top Pinned Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/12 flex-shrink-0 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[var(--color-accent)] via-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/20 text-white flex-shrink-0">
            <span className="text-xl">🎛️</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="studio-fx-modal-title" className="text-base sm:text-lg font-black tracking-tight text-white">
                Studio FX Workstation
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-[10px] font-bold tracking-wider uppercase">
                320kbps DSP
              </span>
            </div>
            <p className="text-xs text-white/55 font-medium">
              Real-time binaural spatial audio, mastering rack & ambient soundscapes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasCustomDSP && (
            <button
              type="button"
              onClick={resetToOriginal}
              className="px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-white/80 hover:text-white transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Reset all studio effects to flat master"
            >
              <span>↺</span>
              <span>Reset</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Studio FX"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer text-sm font-bold active:scale-95"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Scrollable Body Stage ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 no-scrollbar">
        {/* Sound Mode Cards */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">
            Soundstage Mode
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {STUDIO_FX_MODES.map((mode) => {
              const isSelected = fxMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setFxMode(mode.id as StudioFXMode);
                    if (mode.id === '8d-orbit') {
                      setSpatialOrbitAuto(true);
                      setActiveTab('spatial');
                    } else if (mode.id === 'arena-live') {
                      setActiveTab('arena');
                    } else {
                      setActiveTab('mastering');
                    }
                  }}
                  className={`text-left p-3 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                    isSelected
                      ? 'border-cyan-400/90 bg-cyan-500/15 shadow-[0_0_24px_rgba(6,182,212,0.25),inset_0_1px_0_rgba(255,255,255,0.25)]'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20'
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

        {/* ── Segmented Rack Navigation Tabs ── */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-black/40 border border-white/10 overflow-x-auto no-scrollbar">
          {[
            { id: 'spatial', label: '🪐 3D Spatial Radar', badge: fxMode === '8d-orbit' ? 'ACTIVE' : null },
            { id: 'mastering', label: '🎚️ Mastering Rack', badge: null },
            { id: 'arena', label: '🏟️ Concert Arena', badge: fxMode === 'arena-live' ? 'ACTIVE' : null },
            {
              id: 'ambient',
              label: '🌧️ Ambient Synth',
              badge: activeAmbientCount > 0 ? `${activeAmbientCount} ON` : null
            },
            {
              id: 'timers',
              label: '🌙 Sleep & Focus',
              badge: sleepActive ? 'SLEEP' : pomodoroActive ? 'FOCUS' : null
            }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as StudioTab)}
                className={`flex-1 min-w-max px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-white/15 text-white shadow-sm border border-white/20'
                    : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                      tab.badge === 'ACTIVE'
                        ? 'bg-cyan-400 text-black'
                        : 'bg-amber-400 text-black'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Active Tab Stage ── */}
        <div className="p-4 sm:p-5 rounded-2xl border border-white/10 bg-black/25">
          {/* TAB 1: 3D SPATIAL RADAR */}
          {activeTab === 'spatial' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 text-lg">🪐</span>
                  <div>
                    <div className="font-bold text-sm text-white">360° Binaural Spatial Radar</div>
                    <div className="text-[11px] text-white/50">
                      Drag anywhere on the radar stage to manually position sound in 3D binaural space.
                    </div>
                  </div>
                </div>
                <div
                  ref={stageZoneRef}
                  className="text-xs font-semibold text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20 flex-shrink-0"
                >
                  {initialStageZoneLabel}
                </div>
              </div>

              {/* 2D Interactive Radar Display */}
              <div className="flex flex-col sm:flex-row items-center gap-5 my-2">
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
                  className="relative w-44 h-44 rounded-full border-2 border-cyan-500/30 bg-black/60 shadow-[0_0_30px_rgba(6,182,212,0.15)] flex items-center justify-center cursor-crosshair flex-shrink-0 touch-none select-none"
                >
                  {/* Concentric distance rings */}
                  <div className="absolute inset-4 rounded-full border border-cyan-500/15 pointer-events-none" />
                  <div className="absolute inset-9 rounded-full border border-cyan-500/20 pointer-events-none" />
                  <div className="absolute inset-14 rounded-full border border-cyan-500/25 pointer-events-none" />

                  {/* Crosshairs */}
                  <div className="absolute inset-x-0 top-1/2 h-[1px] bg-cyan-500/15 pointer-events-none" />
                  <div className="absolute inset-y-0 left-1/2 w-[1px] bg-cyan-500/15 pointer-events-none" />

                  {/* Center Listener Head */}
                  <div className="w-8 h-8 rounded-full bg-white/15 border border-white/40 flex items-center justify-center text-xs shadow-md z-10 pointer-events-none">
                    🎧
                  </div>

                  {/* Orbiting / Positioned Sound Source Dot */}
                  <div
                    ref={orbDotRef}
                    className="absolute w-5 h-5 rounded-full bg-cyan-400 border-2 border-white shadow-[0_0_16px_rgba(6,182,212,1)] z-20 pointer-events-none transition-none"
                    style={{
                      left: 'calc(50% - 10px)',
                      top: 'calc(50% - 10px)',
                      transform: `translate(${initialOrbX * 68}px, ${initialOrbZ * 68}px)`
                    }}
                  />
                </div>

                {/* Radar Readout & Controls */}
                <div className="flex-1 w-full space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-white/50 text-[10px] uppercase font-bold">Azimuth</div>
                      <div ref={azimuthRef} className="text-sm font-black text-cyan-300">
                        {initialAzimuthDeg}°
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-white/50 text-[10px] uppercase font-bold">Distance</div>
                      <div ref={distanceRef} className="text-sm font-black text-white">
                        {initialDistanceMeters} m
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-white/50 text-[10px] uppercase font-bold">Left Ear</div>
                      <div ref={leftEarRef} className="text-sm font-black text-cyan-400">
                        {initialLeftEarLevel}%
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-white/50 text-[10px] uppercase font-bold">Right Ear</div>
                      <div ref={rightEarRef} className="text-sm font-black text-indigo-400">
                        {initialRightEarLevel}%
                      </div>
                    </div>
                  </div>

                  {/* Auto-Orbit Toggle Button */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-semibold text-white/80">Continuous 360° Orbit</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSpatialOrbitAuto(!spatialOrbitAuto);
                        if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer border ${
                        spatialOrbitAuto
                          ? 'bg-cyan-400 text-black border-cyan-300 shadow-md shadow-cyan-400/20'
                          : 'bg-white/10 text-white/60 border-white/15 hover:bg-white/15'
                      }`}
                    >
                      {spatialOrbitAuto ? 'Auto-Orbit: ON' : 'Manual Point'}
                    </button>
                  </div>

                  {/* Orbit Speed Slider */}
                  {spatialOrbitAuto && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-white/60">
                        <span>Orbit Speed</span>
                        <span className="font-mono text-cyan-300 font-bold">
                          {((spatialOrbitSpeed || 0.12) * 10).toFixed(1)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.35"
                        step="0.01"
                        value={spatialOrbitSpeed || 0.12}
                        onChange={(e) => setSpatialOrbitSpeed(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                      />
                    </div>
                  )}

                  {/* Spatial Depth Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-white/60">
                      <span>Spatial Room Depth</span>
                      <span className="font-mono text-white font-bold">
                        {Math.round((spatialRoomSize || 0.26) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.65"
                      step="0.01"
                      value={spatialRoomSize || 0.26}
                      onChange={(e) => setSpatialRoomSize(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MASTERING RACK */}
          {activeTab === 'mastering' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-white">Studio DSP Mastering Rack</div>
                  <div className="text-[11px] text-white/50">
                    Hardware-grade analog processing with zero dynamic clipping
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetMasteringRack}
                  className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/70 hover:text-white transition cursor-pointer"
                >
                  Reset Rack
                </button>
              </div>

              {/* Mastering Sliders Grid */}
              <div className="space-y-3 pt-1">
                {/* 1. Sub-Bass */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/70 font-semibold">
                    <span>Sub-Bass Floor (54Hz Shelf)</span>
                    <span className="font-mono text-cyan-300 font-bold">
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
                    className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>

                {/* 2. Harmonic Drive */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/70 font-semibold">
                    <span>Harmonic Drive (Analog Tube Warmth)</span>
                    <span className="font-mono text-purple-300 font-bold">
                      {Math.round(harmonicDrive * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={harmonicDrive}
                    onChange={(e) => setHarmonicDrive(parseFloat(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>

                {/* 3. Stereo Width */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/70 font-semibold">
                    <span>Stereo Width (Haas Matrix)</span>
                    <span className="font-mono text-indigo-300 font-bold">
                      {Math.round(stereoWidth * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={stereoWidth}
                    onChange={(e) => setStereoWidth(parseFloat(e.target.value))}
                    className="w-full accent-indigo-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>

                {/* 4. Treble Silk Air */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/70 font-semibold">
                    <span>Treble Air (11kHz Silk Shelf / Lo-Fi Cut)</span>
                    <span className="font-mono text-pink-300 font-bold">
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
                    className="w-full accent-pink-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>

                {/* 5. Convolution Reverb Mix */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/70 font-semibold">
                    <span>Convolution Hall Echo</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {Math.round(reverbMix * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.75"
                    step="0.02"
                    value={reverbMix}
                    onChange={(e) => setReverbMix(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>
              </div>

              {/* 1-Tap Mastering Presets */}
              <div className="pt-2 border-t border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">
                  Mastering Presets
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
                        setSubBassBoost(preset.bass);
                        setHarmonicDrive(preset.drive);
                        setStereoWidth(preset.width);
                        setTrebleAir(preset.air);
                        setReverbMix(preset.rev);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 hover:text-white transition cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONCERT ARENA */}
          {activeTab === 'arena' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-lg">🏟️</span>
                  <div>
                    <div className="font-bold text-sm text-white">Live Concert Arena Field</div>
                    <div className="text-[11px] text-white/50">
                      Recreates the physical acoustic energy of a 50,000-seat stadium tour
                    </div>
                  </div>
                </div>
                <div className="text-xs font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                  Stadium Acoustics
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/70 font-semibold">
                    <span>Stadium Reverb & Hall Echo</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {Math.round((reverbMix || 0.25) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.75"
                    step="0.02"
                    value={reverbMix || 0.25}
                    onChange={(e) => {
                      setReverbMix(parseFloat(e.target.value));
                      if (fxMode !== 'arena-live') setFxMode('arena-live');
                    }}
                    className="w-full accent-amber-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/70 font-semibold">
                    <span>Arena Sub-Bass Floor Punch</span>
                    <span className="font-mono text-amber-300 font-bold">
                      +{(subBassBoost || 3).toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="0.5"
                    value={subBassBoost || 3}
                    onChange={(e) => {
                      setSubBassBoost(parseFloat(e.target.value));
                      if (fxMode !== 'arena-live') setFxMode('arena-live');
                    }}
                    className="w-full accent-amber-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>
              </div>

              {/* Quick Arena Presets */}
              <div className="pt-2 border-t border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">
                  Stage Size Presets
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { label: 'Grand Arena', rev: 0.45, bass: 5 },
                    { label: 'Festival Stadium', rev: 0.3, bass: 3.5 },
                    { label: 'Live Concert Hall', rev: 0.18, bass: 2 },
                    { label: 'Intimate Club', rev: 0.1, bass: 3.5 }
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setReverbMix(preset.rev);
                        setSubBassBoost(preset.bass);
                        if (fxMode !== 'arena-live') setFxMode('arena-live');
                      }}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 hover:text-white transition cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AMBIENT SOUNDSCAPE MIXER */}
          {activeTab === 'ambient' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-white">Procedural Ambient Soundscapes</div>
                  <div className="text-[11px] text-white/50">
                    Real-time Web Audio soundscapes synthesized directly in your browser
                  </div>
                </div>
                {activeAmbientCount > 0 && (
                  <button
                    type="button"
                    onClick={stopAllAmbient}
                    className="px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 transition cursor-pointer"
                  >
                    Mute All
                  </button>
                )}
              </div>

              {/* 6 Ambient Layers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {AMBIENT_LAYERS.map((layer) => {
                  const vol = ambientVolumes[layer.id] || 0;
                  const isActive = vol > 0.02;
                  return (
                    <div
                      key={layer.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        isActive
                          ? 'border-emerald-400/50 bg-emerald-500/10'
                          : 'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{layer.icon}</span>
                          <div>
                            <div className="text-xs font-bold text-white">{layer.name}</div>
                            <div className="text-[10px] text-white/50">{layer.subtitle}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAmbientVolume(layer.id, isActive ? 0 : 0.5)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition cursor-pointer border ${
                            isActive
                              ? 'bg-emerald-400 text-black border-emerald-300'
                              : 'bg-white/10 text-white/60 border-white/15 hover:bg-white/15'
                          }`}
                        >
                          {isActive ? `${Math.round(vol * 100)}%` : 'OFF'}
                        </button>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        value={vol}
                        onChange={(e) => setAmbientVolume(layer.id, parseFloat(e.target.value))}
                        className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Ambient Presets */}
              <div className="pt-2 border-t border-white/10">
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
                      onClick={() => applyAmbientPreset(p.preset as Partial<Record<AmbientLayerId, number>>)}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 hover:text-white transition cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SLEEP & FOCUS TIMERS */}
          {activeTab === 'timers' && (
            <div className="space-y-5">
              {/* Sleep Timer */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🌙</span>
                    <div>
                      <div className="font-bold text-sm text-white">Sleep Timer</div>
                      <div className="text-[11px] text-white/50">
                        Automatically fades volume over 10 seconds and pauses music
                      </div>
                    </div>
                  </div>
                  {sleepActive && (
                    <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                      {sleepEndAtTrack ? 'End of song' : formatClock(sleepRemaining)}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {sleepActive ? (
                    <button
                      type="button"
                      onClick={stopSleepTimer}
                      className="px-4 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 transition cursor-pointer"
                    >
                      Cancel Sleep Timer
                    </button>
                  ) : (
                    <>
                      {[15, 30, 45, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => startSleepTimer(mins)}
                          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/80 hover:text-white transition cursor-pointer"
                        >
                          {mins} mins
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setEndAtTrack(true)}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/80 hover:text-white transition cursor-pointer"
                      >
                        End of Song
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Pomodoro Focus Timer */}
              <div className="pt-4 border-t border-white/10 space-y-3">
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
                    <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-500/15 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                      {formatClock(pomodoroSeconds)} ({pomodoroMode})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {pomodoroActive ? (
                    <button
                      type="button"
                      onClick={stopPomodoro}
                      className="px-4 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 transition cursor-pointer"
                    >
                      Pause Focus Sprint
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startPomodoro(pomodoroMode)}
                      className="px-4 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/30 transition cursor-pointer"
                    >
                      Start Focus ({formatClock(pomodoroSeconds)})
                    </button>
                  )}
                  {completedSessions > 0 && (
                    <span className="text-xs text-white/50">
                      🎉 {completedSessions} session{completedSessions === 1 ? '' : 's'} completed
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Docked Real-Time Mastering Spectrum Visualizer ── */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs text-white/50 font-bold px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Live 32-Band Spectrum Analyzer</span>
            </span>
            <span className="font-mono text-[10px] text-cyan-400">FFT 60 FPS</span>
          </div>
          <div className="h-16 w-full rounded-2xl border border-white/10 bg-black/50 overflow-hidden p-1.5 shadow-inner">
            <canvas
              ref={spectrumCanvasRef}
              width={600}
              height={56}
              className="w-full h-full block"
            />
          </div>
        </div>
      </div>
    </div>
  );
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
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-3 sm:p-5 overflow-hidden select-none">
          {/* Central UI Liquid-Glass Modal Backdrop */}
          <motion.div
            key="studio-fx-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
            onClick={handleClose}
            className="absolute inset-0 modal-backdrop-blur bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.12)_0%,_rgba(6,7,15,0.85)_75%)] cursor-pointer"
            aria-hidden="true"
          />

          {/* Central UI Liquid-Glass Modal Window Chassis */}
          <motion.div
            key="studio-fx-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-fx-modal-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={PANEL_TRANSITION}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl modal-glass-panel text-white shadow-[0_32px_90px_rgba(0,0,0,0.88),0_0_60px_rgba(6,182,212,0.15)] overflow-hidden border border-white/20"
          >
            <StudioFXModalContent onClose={handleClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
