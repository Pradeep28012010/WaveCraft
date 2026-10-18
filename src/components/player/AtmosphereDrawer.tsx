import { useState, useMemo, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useStudioStore,
  AMBIENT_LAYERS,
  type AmbientLayerId
} from '../../stores/studioStore';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { unlockAudioEngine, resumeAudioContextIfNeeded } from '../../services/audioEngine';

interface AtmosphereDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MoodPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  blend: Partial<Record<AmbientLayerId, number>>;
}

const MOOD_PRESETS: MoodPreset[] = [
  {
    id: 'rainy-lofi',
    name: 'Rainy Lo-Fi',
    icon: '🌧️',
    description: 'Window rain & vinyl dust',
    blend: { rain: 0.65, vinyl: 0.35 }
  },
  {
    id: 'midnight-cafe',
    name: 'Midnight Café',
    icon: '☕',
    description: 'Warm cafe room & soft rain',
    blend: { cafe: 0.7, rain: 0.3 }
  },
  {
    id: 'hearth-fire',
    name: 'Cozy Hearth',
    icon: '🔥',
    description: 'Crackling wood & vinyl warmth',
    blend: { campfire: 0.8, vinyl: 0.25 }
  },
  {
    id: 'ocean-slumber',
    name: 'Ocean Slumber',
    icon: '🌊',
    description: 'Rhythmic surf & binaural wave',
    blend: { waves: 0.75, binaural: 0.25 }
  },
  {
    id: 'deep-focus',
    name: 'Deep Focus',
    icon: '🧠',
    description: '40Hz gamma pad & rainfall',
    blend: { binaural: 0.6, rain: 0.4 }
  },
  {
    id: 'cosmic-calm',
    name: 'Cosmic Calm',
    icon: '🌌',
    description: 'Ocean, focus tone & crackle',
    blend: { waves: 0.45, binaural: 0.45, vinyl: 0.2 }
  }
];

const AtmosphereDrawer = memo(function AtmosphereDrawer({
  isOpen,
  onClose
}: AtmosphereDrawerProps) {
  const { ambientVolumes, setAmbientVolume, applyAmbientPreset, stopAllAmbient } =
    useStudioStore();

  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Ensure AudioContext is unlocked when opening the atmosphere studio
  useEffect(() => {
    if (isOpen) {
      unlockAudioEngine();
      resumeAudioContextIfNeeded();
    }
  }, [isOpen]);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const safeAmbientVolumes = ambientVolumes || {
    rain: 0,
    vinyl: 0,
    waves: 0,
    binaural: 0,
    campfire: 0,
    cafe: 0
  };

  const activeLayersCount = useMemo(() => {
    return Object.values(safeAmbientVolumes).filter((v) => v > 0.02).length;
  }, [safeAmbientVolumes]);

  const masterAverage = useMemo(() => {
    const active = Object.values(safeAmbientVolumes).filter((v) => v > 0.02);
    if (active.length === 0) return 0;
    return active.reduce((acc, curr) => acc + curr, 0) / active.length;
  }, [safeAmbientVolumes]);

  const handleApplyPreset = (preset: MoodPreset) => {
    triggerAndroidHaptic('medium');
    setActivePresetId(preset.id);
    applyAmbientPreset(preset.blend);
  };

  const handleMasterVolumeChange = (newMasterRatio: number) => {
    if (activeLayersCount === 0) {
      // Default initial layer when master is moved from zero
      setAmbientVolume('rain', newMasterRatio);
      return;
    }
    const currentAvg = masterAverage || 0.5;
    const scale = currentAvg > 0 ? newMasterRatio / currentAvg : 1;
    (Object.keys(safeAmbientVolumes) as AmbientLayerId[]).forEach((id) => {
      const current = safeAmbientVolumes[id] || 0;
      if (current > 0.02) {
        setAmbientVolume(id, Math.min(1, Math.max(0, current * scale)));
      }
    });
  };

  const handleStopAll = () => {
    triggerAndroidHaptic('light');
    setActivePresetId(null);
    stopAllAmbient();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="atmosphere-drawer-portal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9996] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none"
        >
          {/* Dimmer Frosted Glass Backdrop */}
          <motion.div
            key="atmosphere-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md cursor-pointer"
            aria-hidden="true"
          />

          {/* Drawer / Popover Card */}
          <motion.div
            key="atmosphere-card"
            initial={{ y: '100%', opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280, mass: 0.8 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full sm:max-w-2xl max-h-[88vh] sm:max-h-[82vh] flex flex-col rounded-t-[32px] sm:rounded-[32px] liquid-glass border-0 bg-[#07070f]/95 shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden"
          >
            {/* Mobile Drag Handle */}
            <div
              className="flex sm:hidden justify-center pt-3 pb-1 cursor-pointer active:opacity-60"
              onClick={onClose}
              title="Tap to close"
            >
              <div className="w-12 h-1.5 rounded-full bg-white/25" />
            </div>

            {/* Header */}
            <div className="px-6 pt-4 pb-3 border-0 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl glass-button-emerald flex items-center justify-center text-xl shadow-[0_0_16px_rgba(16,185,129,0.35)]">
                  🌧️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-white tracking-tight">
                      Atmosphere Studio
                    </h2>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        activeLayersCount > 0
                          ? 'glass-button-emerald text-emerald-200'
                          : 'glass-button text-white/50'
                      }`}
                    >
                      {activeLayersCount > 0 ? `${activeLayersCount} Active` : 'Muted'}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">
                    Blend procedural ambient soundscapes seamlessly over your music
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeLayersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleStopAll}
                    className="px-3 py-1.5 rounded-xl glass-button text-xs font-bold text-rose-300 hover:text-rose-200 hover:bg-rose-500/20 transition cursor-pointer"
                  >
                    Mute All
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                  title="Close Atmosphere"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5 space-y-6">
              {/* 1. Mood Presets */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                    1-Tap Mood Presets
                  </span>
                  <span className="text-[10px] text-white/40">Instant ambient blends</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {MOOD_PRESETS.map((preset) => {
                    const isSelected = activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className={`p-3 rounded-2xl text-left transition-all cursor-pointer flex items-start gap-2.5 border ${
                          isSelected
                            ? 'glass-button-emerald border-0 shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                            : 'liquid-glass border-0  active:scale-[0.98]'
                        }`}
                      >
                        <span className="text-2xl flex-shrink-0">{preset.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {preset.name}
                          </div>
                          <div className="text-[10px] text-white/50 truncate">
                            {preset.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Master Ambient Blend Slider */}
              <div className="p-4 rounded-2xl liquid-glass border-0 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🎚️</span>
                    <span className="text-xs font-bold text-white">Master Atmosphere Blend</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-300">
                    {Math.round(masterAverage * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={masterAverage}
                  onChange={(e) => handleMasterVolumeChange(parseFloat(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer h-2 bg-white/15 rounded-lg"
                  aria-label="Master Ambient Volume"
                />
                <div className="flex justify-between text-[10px] text-white/40">
                  <span>Subtle Whisper</span>
                  <span>Balanced Immersion</span>
                  <span>Deep Presence</span>
                </div>
              </div>

              {/* 3. 6 Procedural Ambient Layers */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                    Individual Soundscape Layers
                  </span>
                  <span className="text-[10px] text-white/40">Procedural Web Audio DSP</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AMBIENT_LAYERS.map((layer) => {
                    const vol = safeAmbientVolumes[layer.id] || 0;
                    const isActive = vol > 0.02;

                    return (
                      <div
                        key={layer.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isActive
                            ? 'border-0 bg-emerald-500/10 shadow-[0_0_18px_rgba(16,185,129,0.18)]'
                            : 'border-0 liquid-glass'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{layer.icon}</span>
                            <div>
                              <div className="text-xs font-bold text-white">{layer.name}</div>
                              <div className="text-[10px] text-white/50">{layer.subtitle}</div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              triggerAndroidHaptic('light');
                              setActivePresetId(null);
                              setAmbientVolume(layer.id, isActive ? 0 : 0.6);
                            }}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition cursor-pointer ${
                              isActive
                                ? 'glass-button-emerald text-emerald-200'
                                : 'glass-button text-white/70 hover:text-white'
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
                          onChange={(e) => {
                            setActivePresetId(null);
                            setAmbientVolume(layer.id, parseFloat(e.target.value));
                          }}
                          className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                          aria-label={`${layer.name} Volume`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Standalone / Zero Network Info Banner */}
              <div className="p-3.5 rounded-2xl liquid-glass border-0 flex items-start gap-3">
                <span className="text-xl flex-shrink-0">✨</span>
                <div className="text-[11px] text-white/60 space-y-1">
                  <div className="font-bold text-white/90">
                    Standalone 100% Client-Side Synthesis
                  </div>
                  <p>
                    All atmosphere textures are generated mathematically on your device's audio
                    chip. Zero internet data used, zero battery drain, and works completely offline
                    even when main music is paused.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
});

export default AtmosphereDrawer;
