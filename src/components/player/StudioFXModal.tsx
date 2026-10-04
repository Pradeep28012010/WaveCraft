import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useStudioStore,
  STUDIO_FX_MODES,
  type StudioFXMode
} from '../../stores/studioStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useSleepTimer } from '../../hooks/useSleepTimer';
import { getAudioFrequencyData, setLiveSpatialPan } from '../../services/audioEngine';

function StudioFXModalContent() {
  const {
    fxMode,
    spatialOrbitAuto,
    spatialOrbitSpeed,
    spatialRoomSize,
    spatialManualPos,
    subBassBoost,
    reverbMix,
    setFxMode,
    setSpatialOrbitAuto,
    setSpatialOrbitSpeed,
    setSpatialRoomSize,
    setSpatialManualPos,
    setSubBassBoost,
    setReverbMix,
    resetToOriginal,
    setStudioModalOpen
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

  const [liveOrbitAngle, setLiveOrbitAngle] = useState(0);
  const radarRef = useRef<HTMLDivElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);

  // High-Definition 60fps Real-Time Spectrum Analyzer Canvas
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
  }, [isPlaying]);

  // Real-Time 360° Orbit loop with live stereo pan updates
  useEffect(() => {
    if (!spatialOrbitAuto || fxMode !== '8d-orbit') return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setLiveOrbitAngle((prev) => {
        const next = (prev + dt * (spatialOrbitSpeed || 0.12) * Math.PI * 2) % (Math.PI * 2);
        const pan = Math.sin(next);
        setLiveSpatialPan(pan);
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spatialOrbitAuto, spatialOrbitSpeed, fxMode]);

  // Update pan when manual position changes
  useEffect(() => {
    if (fxMode === '8d-orbit' && !spatialOrbitAuto) {
      setLiveSpatialPan(spatialManualPos?.x ?? 0);
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
  };

  const orbX = spatialOrbitAuto ? Math.sin(liveOrbitAngle) * 0.78 : (spatialManualPos?.x ?? 0);
  const orbZ = spatialOrbitAuto ? -Math.cos(liveOrbitAngle) * 0.78 : (spatialManualPos?.z ?? 0);
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

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-fx-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      style={{
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setStudioModalOpen(false);
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/20 shadow-2xl p-5 sm:p-7 text-white"
        style={{
          background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.94) 0%, rgba(12, 14, 22, 0.98) 100%)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <span className="text-xl">🎛️</span>
            </div>
            <div>
              <h2 id="studio-fx-modal-title" className="text-xl font-black tracking-tight">
                Studio FX
              </h2>
              <p className="text-xs text-white/50 font-medium">
                3D Spatial Audio & Live Concert Acoustic Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {fxMode !== 'normal' && (
              <button
                type="button"
                onClick={resetToOriginal}
                className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-white/80 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>↺</span>
                <span>Reset Master</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setStudioModalOpen(false)}
              aria-label="Close Studio FX"
              className="w-9 h-9 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 3 Core Modes: Studio Master, 3D Spatial Audio, Live Concert */}
        <div className="mt-5">
          <div className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2.5">
            Select Sound Mode
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    }
                  }}
                  className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                    isSelected
                      ? 'border-cyan-400/80 bg-white/10 shadow-[0_0_24px_rgba(6,182,212,0.3)]'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{mode.icon}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-cyan-400 text-black'
                          : 'bg-white/10 text-white/60'
                      }`}
                    >
                      {mode.badge}
                    </span>
                  </div>
                  <div className="font-bold text-sm text-white">{mode.name}</div>
                  <p className="text-[11px] text-white/55 line-clamp-2 mt-1 leading-snug">
                    {mode.description}
                  </p>
                  {isSelected && (
                    <motion.div
                      layoutId="active-mode-indicator"
                      className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Effect Controls Stage */}
        <div className="mt-6 p-4 sm:p-5 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl">
          {fxMode === '8d-orbit' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 text-lg">🪐</span>
                  <span className="font-bold text-sm text-white">360° Binaural Spatial Radar</span>
                </div>
                <div className="text-xs font-semibold text-cyan-300 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                  {stageZoneLabel}
                </div>
              </div>

              {/* 2D Interactive Radar Display */}
              <div className="flex flex-col sm:flex-row items-center gap-5 my-3">
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
                  className="relative w-48 h-48 rounded-full border-2 border-cyan-500/30 bg-black/60 shadow-[0_0_30px_rgba(6,182,212,0.15)] flex items-center justify-center cursor-crosshair flex-shrink-0 touch-none select-none"
                >
                  {/* Concentric distance rings */}
                  <div className="absolute inset-4 rounded-full border border-cyan-500/15 pointer-events-none" />
                  <div className="absolute inset-10 rounded-full border border-cyan-500/20 pointer-events-none" />
                  <div className="absolute inset-16 rounded-full border border-cyan-500/25 pointer-events-none" />

                  {/* Crosshairs */}
                  <div className="absolute inset-x-0 top-1/2 h-[1px] bg-cyan-500/15 pointer-events-none" />
                  <div className="absolute inset-y-0 left-1/2 w-[1px] bg-cyan-500/15 pointer-events-none" />

                  {/* Center Listener Head */}
                  <div className="w-8 h-8 rounded-full bg-white/15 border border-white/40 flex items-center justify-center text-xs shadow-md z-10 pointer-events-none">
                    🎧
                  </div>

                  {/* Orbiting / Positioned Sound Source Dot */}
                  <motion.div
                    className="absolute w-5 h-5 rounded-full bg-cyan-400 border-2 border-white shadow-[0_0_16px_rgba(6,182,212,1)] z-20 pointer-events-none"
                    style={{
                      left: `calc(50% + ${orbX * 72}px - 10px)`,
                      top: `calc(50% + ${orbZ * 72}px - 10px)`
                    }}
                  />
                </div>

                {/* Radar Readout & Controls */}
                <div className="flex-1 w-full space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-white/50 text-[10px] uppercase font-bold">Azimuth</div>
                      <div className="text-sm font-black text-cyan-300">{azimuthDeg}°</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-white/50 text-[10px] uppercase font-bold">Distance</div>
                      <div className="text-sm font-black text-white">{distanceMeters} m</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-white/50 text-[10px] uppercase font-bold">Left Ear</div>
                      <div className="text-sm font-black text-cyan-400">{leftEarLevel}%</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-white/50 text-[10px] uppercase font-bold">Right Ear</div>
                      <div className="text-sm font-black text-indigo-400">{rightEarLevel}%</div>
                    </div>
                  </div>

                  {/* Auto-Orbit Toggle Button */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-semibold text-white/80">Continuous 360° Orbit</span>
                    <button
                      type="button"
                      onClick={() => setSpatialOrbitAuto(!spatialOrbitAuto)}
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

          {fxMode === 'arena-live' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-lg">🏟️</span>
                  <span className="font-bold text-sm text-white">Live Concert Arena Acoustic Field</span>
                </div>
                <div className="text-xs font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                  Stadium Atmosphere Active
                </div>
              </div>

              <p className="text-xs text-white/60 leading-relaxed">
                Recreates the physical acoustic energy of a 50,000-seat stadium tour with live crowd ambiance, acoustic hall reflections, and low-end arena kick.
              </p>

              {/* Sliders for Stadium Reverb & Arena Sub-Bass */}
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/60">
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
                    onChange={(e) => setReverbMix(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/60">
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
                    onChange={(e) => setSubBassBoost(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                  />
                </div>
              </div>

              {/* Quick Arena Presets */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-white/50 font-bold">Quick Stage:</span>
                {[
                  { label: 'Grand Arena', rev: 0.45, bass: 5 },
                  { label: 'Festival Stadium', rev: 0.30, bass: 3.5 },
                  { label: 'Live Concert Hall', rev: 0.15, bass: 2 }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setReverbMix(preset.rev);
                      setSubBassBoost(preset.bass);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 hover:text-white transition cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {fxMode === 'normal' && (
            <div className="py-6 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl mx-auto shadow-lg shadow-emerald-500/10">
                💎
              </div>
              <div className="font-bold text-base text-white">Original Studio Master Active</div>
              <p className="text-xs text-white/50 max-w-sm mx-auto">
                Streaming bit-accurate reference audio with zero coloration, original dynamic range, and pure headroom.
              </p>
            </div>
          )}
        </div>

        {/* Real-Time Mastering Spectrum Visualizer */}
        <div className="mt-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-white/50 font-bold">
            <span>Live Audio Spectrum</span>
            <span className="font-mono text-[10px] text-cyan-400">32-Band Analyzer</span>
          </div>
          <div className="h-16 w-full rounded-2xl border border-white/10 bg-black/40 overflow-hidden p-1.5 shadow-inner">
            <canvas
              ref={spectrumCanvasRef}
              width={600}
              height={56}
              className="w-full h-full block"
            />
          </div>
        </div>

        {/* Sleep Timer Quick Dock */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">🌙</span>
            <span className="text-xs font-bold text-white/80">Sleep Timer</span>
            {sleepActive && (
              <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                {sleepEndAtTrack ? 'End of song' : formatClock(sleepRemaining)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {sleepActive ? (
              <button
                type="button"
                onClick={stopSleepTimer}
                className="px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 transition cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <>
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => startSleepTimer(mins)}
                    className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/75 hover:text-white transition cursor-pointer"
                  >
                    {mins}m
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setEndAtTrack(true)}
                  className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/75 hover:text-white transition cursor-pointer"
                >
                  End of Song
                </button>
              </>
            )}
          </div>
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
