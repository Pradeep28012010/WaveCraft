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
import { useSleepTimer } from '../../hooks/useSleepTimer';

const VOCAL_STEM_MODES: Array<{
  id: VocalStemMode;
  name: string;
  badge: string;
  desc: string;
  accent: string;
}> = [
  {
    id: 'normal',
    name: 'Full Studio Mix',
    badge: 'VOCALS + INST',
    desc: 'Original bit-accurate 320kbps stereo master with full lead vocals and instrumentation.',
    accent: 'from-emerald-400 to-teal-500'
  },
  {
    id: 'karaoke',
    name: 'Karaoke Vocal Remover',
    badge: 'INSTRUMENTAL',
    desc: 'Strips center-panned lead vocals in real time via Mid/Side phase cancellation while preserving punchy <155Hz sub-bass.',
    accent: 'from-rose-500 to-pink-600'
  },
  {
    id: 'acapella',
    name: 'Acapella Vocal Isolate',
    badge: 'LEAD VOCAL',
    desc: 'Spotlights human vocal fundamentals & 1.6kHz formant harmonics while attenuating deep sub-bass and cymbals.',
    accent: 'from-violet-500 to-fuchsia-600'
  }
];

function StudioFXModalContent() {
  const {
    fxMode,
    vocalMode,
    spatialOrbitAuto,
    spatialOrbitSpeed,
    spatialRoomSize,
    spatialManualPos,
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

  const radarRef = useRef<HTMLDivElement>(null);
  const [isDraggingRadar, setIsDraggingRadar] = useState(false);
  const [liveOrbitAngle, setLiveOrbitAngle] = useState(0);

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

  // Compute current orb coordinates on the 2D radar pad (-1 to +1)
  const orbX = spatialOrbitAuto ? Math.sin(liveOrbitAngle) * 0.78 : spatialManualPos.x;
  const orbZ = spatialOrbitAuto ? -Math.cos(liveOrbitAngle) * 0.78 : spatialManualPos.z;

  const hasAnyAmbient = Object.values(ambientVolumes).some((v) => v > 0.01);

  return (
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
                  Studio Audio FX, 3D Spatial Radar & Stem Isolator
                </h2>
                <p className="text-xs sm:text-sm text-white/60 mt-1">
                  Transform any song in real time with 360° HRTF spatial positioning, live Karaoke vocal removal, or ambient focus layers.
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
                          className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider whitespace-nowrap flex-shrink-0 ${
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

            {/* Section 1B: Interactive 3D Spatial Audio Control Pad (Radar Joypad) */}
            <div
              className={`p-5 rounded-3xl border transition-all ${
                fxMode === '8d-orbit'
                  ? 'bg-gradient-to-br from-cyan-500/[0.12] via-blue-600/[0.08] to-purple-600/[0.10] border-cyan-400/35 shadow-[0_16px_48px_rgba(6,182,212,0.18)]'
                  : 'bg-white/[0.03] border-white/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">
                      🎧 Interactive 360° HRTF Spatial Soundstage Radar
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        fxMode === '8d-orbit'
                          ? 'bg-cyan-400 text-black shadow-[0_0_12px_rgba(34,211,238,0.6)]'
                          : 'bg-white/10 text-white/55'
                      }`}
                    >
                      {fxMode === '8d-orbit'
                        ? spatialOrbitAuto
                          ? 'AUTO 360° ORBIT'
                          : 'MANUAL 3D POSITION'
                        : 'CLICK RADAR TO ENGAGE'}
                    </span>
                  </div>
                  <p className="text-xs text-white/55 mt-0.5">
                    Drag the glowing 3D sound source anywhere around your head or let it orbit automatically in 360° HRTF space.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                      setSpatialOrbitAuto(true);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold cursor-pointer transition-all ${
                      fxMode === '8d-orbit' && spatialOrbitAuto
                        ? 'glass-button-cyan text-cyan-200'
                        : 'glass-button text-white/75 hover:text-white'
                    }`}
                  >
                    🔄 Auto 360° Orbit
                  </button>
                  <button
                    onClick={() => {
                      if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                      setSpatialOrbitAuto(false);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold cursor-pointer transition-all ${
                      fxMode === '8d-orbit' && !spatialOrbitAuto
                        ? 'glass-button-cyan text-cyan-200'
                        : 'glass-button text-white/75 hover:text-white'
                    }`}
                  >
                    🕹️ Manual Joypad
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                {/* Left: 2D Interactive Circular Head-Stage Radar Pad */}
                <div className="md:col-span-5 flex flex-col items-center">
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
                    className="relative w-52 h-52 rounded-full bg-black/60 border border-cyan-400/30 shadow-inner flex items-center justify-center cursor-crosshair touch-none overflow-hidden"
                  >
                    {/* Concentric Distance Rings */}
                    <div className="absolute w-36 h-36 rounded-full border border-white/10 pointer-events-none" />
                    <div className="absolute w-20 h-20 rounded-full border border-white/10 pointer-events-none" />
                    <div className="absolute inset-x-0 top-1/2 h-px bg-white/10 pointer-events-none" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/10 pointer-events-none" />

                    {/* Cardinal Acoustic Labels */}
                    <span className="absolute top-2 text-[9px] font-extrabold tracking-widest text-cyan-300/70 uppercase pointer-events-none">
                      FRONTSTAGE
                    </span>
                    <span className="absolute bottom-2 text-[9px] font-extrabold tracking-widest text-white/40 uppercase pointer-events-none">
                      REAR SURROUND
                    </span>
                    <span className="absolute left-2.5 text-[9px] font-extrabold tracking-widest text-white/45 uppercase pointer-events-none">
                      L
                    </span>
                    <span className="absolute right-2.5 text-[9px] font-extrabold tracking-widest text-white/45 uppercase pointer-events-none">
                      R
                    </span>

                    {/* Listener Head Center Icon */}
                    <div className="relative z-10 w-9 h-9 rounded-full bg-white/10 border border-white/25 flex items-center justify-center text-sm shadow-md pointer-events-none">
                      🎧
                    </div>

                    {/* Active 3D Sound Source Orb */}
                    <div
                      style={{
                        transform: `translate3d(${(orbX * 82).toFixed(1)}px, ${(orbZ * 82).toFixed(1)}px, 0)`
                      }}
                      className="pointer-events-none absolute w-7 h-7 rounded-full bg-gradient-to-br from-cyan-300 to-blue-500 border-2 border-white shadow-[0_0_24px_4px_rgba(34,211,238,0.85)] flex items-center justify-center will-change-transform z-20"
                    >
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-white/55 mt-2">
                    X: {(orbX * 2.5).toFixed(1)}m • Z: {(orbZ * 2.2).toFixed(1)}m • &lt;95Hz Sub Centered
                  </span>
                </div>

                {/* Right: 3D Spatial Orbit Speed, Room Dome Ambience & Quick Position Presets */}
                <div className="md:col-span-7 space-y-4">
                  <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white/85">🔄 360° Orbit Rotation Speed</span>
                      <span className="font-extrabold text-cyan-300 tabular-nums">
                        {(1 / spatialOrbitSpeed).toFixed(1)}s / revolution ({spatialOrbitSpeed.toFixed(2)} Hz)
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
                      className="w-full"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white/85">🏛️ Concert Dome Acoustic Ambience</span>
                      <span className="font-extrabold text-cyan-300 tabular-nums">
                        {Math.round((spatialRoomSize / 0.65) * 100)}% Dome Depth
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
                      className="w-full"
                    />
                  </div>

                  {/* Quick 3D Position Hotspots */}
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { label: 'Front Row Stage', x: 0, z: -0.82 },
                      { label: 'Left Balcony', x: -0.8, z: -0.35 },
                      { label: 'Right Balcony', x: 0.8, z: -0.35 },
                      { label: 'Rear Surround Halo', x: 0, z: 0.82 }
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          if (fxMode !== '8d-orbit') setFxMode('8d-orbit');
                          setSpatialOrbitAuto(false);
                          setSpatialManualPos({ x: preset.x, z: preset.z });
                        }}
                        className="px-3 py-1.5 rounded-full glass-button text-[11px] font-bold text-white/80 hover:text-white cursor-pointer transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Real-Time Vocal Remover (Karaoke) & Acapella Stem Isolator */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-white/85 flex items-center gap-2">
                    <span>🎤 Real-Time Vocal Remover & Stem Isolator</span>
                    {vocalMode !== 'normal' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] glass-button-primary text-white">
                        {vocalMode.toUpperCase()}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Zero-latency Web Audio Mid/Side phase cancellation & vocal formant isolation — works on any streaming track.
                  </p>
                </div>
                {vocalMode !== 'normal' && (
                  <button
                    onClick={() => setVocalMode('normal')}
                    className="px-3 py-1 rounded-full glass-button text-xs font-bold text-white/75 hover:text-white cursor-pointer"
                  >
                    Restore Full Vocals
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {VOCAL_STEM_MODES.map((m) => {
                  const active = vocalMode === m.id;
                  return (
                    <motion.button
                      key={m.id}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setVocalMode(m.id)}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                        active
                          ? 'bg-white/[0.14] border-white/35 shadow-xl'
                          : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                      }`}
                    >
                      {active && (
                        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${m.accent}`} />
                      )}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-extrabold text-white">{m.name}</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider whitespace-nowrap flex-shrink-0 ${
                            active
                              ? `bg-gradient-to-r ${m.accent} text-white shadow`
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed">{m.desc}</p>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Procedural Ambient Soundscape Mixer */}
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
                    className="px-3 py-1 rounded-full glass-button text-xs font-bold text-white/80 hover:text-white cursor-pointer"
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
                        className="w-full mt-1"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 4: Focus Pomodoro & Sleep Timer */}
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
          </motion.div>
        </motion.div>
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
