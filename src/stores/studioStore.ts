import { create } from 'zustand';
import { usePlayerStore } from './playerStore';
import { useSettingsStore } from './settingsStore';
import { setAmbientLayerVolume, stopAllAmbientLayers } from '../services/ambientSynth';

export type StudioFXMode = 'normal' | '8d-orbit' | 'arena-live';

export type AmbientLayerId = 'rain' | 'vinyl' | 'waves' | 'binaural' | 'campfire' | 'cafe';

export interface StudioFXInfo {
  id: StudioFXMode;
  name: string;
  badge: string;
  icon: string;
  description: string;
  accent: string;
}

export const STUDIO_FX_MODES: StudioFXInfo[] = [
  {
    id: 'normal',
    name: 'Studio Master',
    badge: 'ORIGINAL FLAT',
    icon: '💎',
    description: 'Bit-accurate reference audio with zero coloration and pure dynamic headroom.',
    accent: 'from-emerald-500 to-teal-600'
  },
  {
    id: '8d-orbit',
    name: '3D Spatial Audio',
    badge: '360° BINAURAL',
    icon: '🪐',
    description: 'True 360° binaural spatial soundstage orbiting around your head with real-time radar positioning.',
    accent: 'from-cyan-500 to-blue-600'
  },
  {
    id: 'arena-live',
    name: 'Live Concert',
    badge: 'STADIUM ARENA',
    icon: '🏟️',
    description: 'Expansive live stadium concert acoustics with arena crowd ambiance and live presence.',
    accent: 'from-blue-500 to-indigo-600'
  }
];

export const AMBIENT_LAYERS: Array<{
  id: AmbientLayerId;
  name: string;
  subtitle: string;
  icon: string;
}> = [
  {
    id: 'rain',
    name: 'Midnight Rain',
    subtitle: 'Soft window rainfall',
    icon: '🌧️'
  },
  {
    id: 'vinyl',
    name: 'Vinyl Crackle',
    subtitle: 'Warm analog needle dust',
    icon: '💿'
  },
  {
    id: 'waves',
    name: 'Ocean Surf',
    subtitle: 'Rhythmic coastal tide',
    icon: '🌊'
  },
  {
    id: 'binaural',
    name: '40Hz Deep Focus',
    subtitle: 'Gamma binaural study pad',
    icon: '🧠'
  },
  {
    id: 'campfire',
    name: 'Cozy Campfire',
    subtitle: 'Crackling hearth embers',
    icon: '🔥'
  },
  {
    id: 'cafe',
    name: 'Midnight Cafe',
    subtitle: 'Warm acoustic study room',
    icon: '☕'
  }
];

export type VocalStemMode = 'normal' | 'karaoke' | 'acapella';

interface StudioState {
  fxMode: StudioFXMode;
  vocalMode: VocalStemMode;
  spatialOrbitAuto: boolean;
  spatialOrbitSpeed: number;
  spatialRoomSize: number;
  spatialManualPos: { x: number; z: number };

  // Real-Time Mastering Rack Custom Controls
  subBassBoost: number; // 0 to +9 dB
  harmonicDrive: number; // 0 to 1 (Analog Tube Warmth)
  stereoWidth: number; // 0 to 1 (Binaural Haas Widener)
  reverbMix: number; // 0 to 0.75 (Convolution Hall Wet Mix)
  trebleAir: number; // -6 to +6 dB (11kHz Silk Air / Lo-Fi Cut)
  preservePitch: boolean; // True = time-stretch only, False = analog tape pitch+speed shift

  ambientVolumes: Record<AmbientLayerId, number>;
  isStudioModalOpen: boolean;
  isCommandPaletteOpen: boolean;

  // Focus Pomodoro Timer
  pomodoroActive: boolean;
  pomodoroMode: 'focus' | 'break';
  pomodoroSeconds: number;
  completedSessions: number;

  // Unified Global Sleep Timer
  sleepActive: boolean;
  sleepSeconds: number;
  sleepTotalSeconds: number;
  sleepEndAtTrack: boolean;

  setFxMode: (mode: StudioFXMode) => void;
  setVocalMode: (mode: VocalStemMode) => void;
  setSpatialOrbitAuto: (auto: boolean) => void;
  setSpatialOrbitSpeed: (speed: number) => void;
  setSpatialRoomSize: (size: number) => void;
  setSpatialManualPos: (pos: { x: number; z: number }) => void;

  setSubBassBoost: (db: number) => void;
  setHarmonicDrive: (drive: number) => void;
  setStereoWidth: (width: number) => void;
  setReverbMix: (mix: number) => void;
  setTrebleAir: (db: number) => void;
  setPreservePitch: (preserve: boolean) => void;
  resetMasteringRack: () => void;
  resetToOriginal: () => void;

  setAmbientVolume: (id: AmbientLayerId, volume: number) => void;
  applyAmbientPreset: (preset: Partial<Record<AmbientLayerId, number>>) => void;
  stopAllAmbient: () => void;
  setStudioModalOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;

  startPomodoro: (mode?: 'focus' | 'break') => void;
  stopPomodoro: () => void;
  tickPomodoro: () => void;

  startSleepTimer: (minutes: number) => void;
  stopSleepTimer: () => void;
  setSleepEndAtTrack: (val: boolean) => void;
  tickSleepTimer: () => void;
}

const STUDIO_PREFS_KEY = 'wavecraft_studio_prefs_v1';

interface PersistedStudioPrefs {
  fxMode: StudioFXMode;
  vocalMode: VocalStemMode;
  spatialOrbitAuto: boolean;
  spatialOrbitSpeed: number;
  spatialRoomSize: number;
  spatialManualPos: { x: number; z: number };
  subBassBoost: number;
  harmonicDrive: number;
  stereoWidth: number;
  reverbMix: number;
  trebleAir: number;
  preservePitch: boolean;
}

function loadStudioPrefsSync(): PersistedStudioPrefs {
  const defaults: PersistedStudioPrefs = {
    fxMode: 'normal',
    vocalMode: 'normal',
    spatialOrbitAuto: true,
    spatialOrbitSpeed: 0.145,
    spatialRoomSize: 0.26,
    spatialManualPos: { x: 0.65, z: -0.55 },
    subBassBoost: 0,
    harmonicDrive: 0,
    stereoWidth: 0,
    reverbMix: 0,
    trebleAir: 0,
    preservePitch: true
  };
  try {
    const raw = localStorage.getItem(STUDIO_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedStudioPrefs>;
    const validModes: StudioFXMode[] = ['normal', '8d-orbit', 'arena-live'];
    return {
      fxMode: (parsed.fxMode && validModes.includes(parsed.fxMode)) ? parsed.fxMode : defaults.fxMode,
      vocalMode: parsed.vocalMode || defaults.vocalMode,
      spatialOrbitAuto:
        typeof parsed.spatialOrbitAuto === 'boolean'
          ? parsed.spatialOrbitAuto
          : defaults.spatialOrbitAuto,
      spatialOrbitSpeed:
        typeof parsed.spatialOrbitSpeed === 'number'
          ? parsed.spatialOrbitSpeed
          : defaults.spatialOrbitSpeed,
      spatialRoomSize:
        typeof parsed.spatialRoomSize === 'number'
          ? parsed.spatialRoomSize
          : defaults.spatialRoomSize,
      spatialManualPos:
        parsed.spatialManualPos &&
        typeof parsed.spatialManualPos.x === 'number' &&
        typeof parsed.spatialManualPos.z === 'number'
          ? parsed.spatialManualPos
          : defaults.spatialManualPos,
      subBassBoost: typeof parsed.subBassBoost === 'number' ? parsed.subBassBoost : 0,
      harmonicDrive: typeof parsed.harmonicDrive === 'number' ? parsed.harmonicDrive : 0,
      stereoWidth: typeof parsed.stereoWidth === 'number' ? parsed.stereoWidth : 0,
      reverbMix: typeof parsed.reverbMix === 'number' ? parsed.reverbMix : 0,
      trebleAir: typeof parsed.trebleAir === 'number' ? parsed.trebleAir : 0,
      preservePitch: typeof parsed.preservePitch === 'boolean' ? parsed.preservePitch : true
    };
  } catch {
    return defaults;
  }
}

let pendingStudioState: StudioState | null = null;
let studioSaveTimer: ReturnType<typeof setTimeout> | null = null;

function flushStudioPrefs(): void {
  if (!pendingStudioState) return;
  const state = pendingStudioState;
  pendingStudioState = null;
  if (studioSaveTimer) {
    clearTimeout(studioSaveTimer);
    studioSaveTimer = null;
  }
  try {
    const payload: PersistedStudioPrefs = {
      fxMode: state.fxMode,
      vocalMode: state.vocalMode,
      spatialOrbitAuto: state.spatialOrbitAuto,
      spatialOrbitSpeed: state.spatialOrbitSpeed,
      spatialRoomSize: state.spatialRoomSize,
      spatialManualPos: state.spatialManualPos,
      subBassBoost: state.subBassBoost,
      harmonicDrive: state.harmonicDrive,
      stereoWidth: state.stereoWidth,
      reverbMix: state.reverbMix,
      trebleAir: state.trebleAir,
      preservePitch: state.preservePitch
    };
    localStorage.setItem(STUDIO_PREFS_KEY, JSON.stringify(payload));
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushStudioPrefs);
}

function saveStudioPrefsSync(state: StudioState): void {
  pendingStudioState = state;
  if (studioSaveTimer) clearTimeout(studioSaveTimer);
  studioSaveTimer = setTimeout(flushStudioPrefs, 120);
}

const initialStudioPrefs = loadStudioPrefsSync();

export const useStudioStore = create<StudioState>((set, get) => ({
  fxMode: initialStudioPrefs.fxMode,
  vocalMode: initialStudioPrefs.vocalMode,
  spatialOrbitAuto: initialStudioPrefs.spatialOrbitAuto,
  spatialOrbitSpeed: initialStudioPrefs.spatialOrbitSpeed,
  spatialRoomSize: initialStudioPrefs.spatialRoomSize,
  spatialManualPos: initialStudioPrefs.spatialManualPos,
  subBassBoost: initialStudioPrefs.subBassBoost,
  harmonicDrive: initialStudioPrefs.harmonicDrive,
  stereoWidth: initialStudioPrefs.stereoWidth,
  reverbMix: initialStudioPrefs.reverbMix,
  trebleAir: initialStudioPrefs.trebleAir,
  preservePitch: initialStudioPrefs.preservePitch,
  ambientVolumes: {
    rain: 0,
    vinyl: 0,
    waves: 0,
    binaural: 0,
    campfire: 0,
    cafe: 0
  },
  isStudioModalOpen: false,
  isCommandPaletteOpen: false,

  pomodoroActive: false,
  pomodoroMode: 'focus',
  pomodoroSeconds: 25 * 60,
  completedSessions: 0,

  sleepActive: false,
  sleepSeconds: 0,
  sleepTotalSeconds: 0,
  sleepEndAtTrack: false,

  setFxMode: (fxMode) => {
    set({ fxMode });
    saveStudioPrefsSync(get());
  },
  setVocalMode: (vocalMode) => {
    set({ vocalMode });
    saveStudioPrefsSync(get());
  },
  setSpatialOrbitAuto: (spatialOrbitAuto) => {
    set({ spatialOrbitAuto });
    saveStudioPrefsSync(get());
  },
  setSpatialOrbitSpeed: (spatialOrbitSpeed) => {
    set({ spatialOrbitSpeed: Math.max(0.04, Math.min(0.4, spatialOrbitSpeed)) });
    saveStudioPrefsSync(get());
  },
  setSpatialRoomSize: (spatialRoomSize) => {
    set({ spatialRoomSize: Math.max(0, Math.min(0.65, spatialRoomSize)) });
    saveStudioPrefsSync(get());
  },
  setSpatialManualPos: (spatialManualPos) => {
    set({
      spatialManualPos: {
        x: Math.max(-1, Math.min(1, spatialManualPos.x)),
        z: Math.max(-1, Math.min(1, spatialManualPos.z))
      }
    });
    saveStudioPrefsSync(get());
  },

  setSubBassBoost: (subBassBoost) => {
    set({ subBassBoost: Math.max(0, Math.min(9, subBassBoost)) });
    saveStudioPrefsSync(get());
  },
  setHarmonicDrive: (harmonicDrive) => {
    set({ harmonicDrive: Math.max(0, Math.min(1, harmonicDrive)) });
    saveStudioPrefsSync(get());
  },
  setStereoWidth: (stereoWidth) => {
    set({ stereoWidth: Math.max(0, Math.min(1, stereoWidth)) });
    saveStudioPrefsSync(get());
  },
  setReverbMix: (reverbMix) => {
    set({ reverbMix: Math.max(0, Math.min(0.75, reverbMix)) });
    saveStudioPrefsSync(get());
  },
  setTrebleAir: (trebleAir) => {
    set({ trebleAir: Math.max(-6, Math.min(6, trebleAir)) });
    saveStudioPrefsSync(get());
  },
  setPreservePitch: (preservePitch) => {
    set({ preservePitch });
    saveStudioPrefsSync(get());
  },
  resetMasteringRack: () => {
    set({
      subBassBoost: 0,
      harmonicDrive: 0,
      stereoWidth: 0,
      reverbMix: 0,
      trebleAir: 0,
      preservePitch: true
    });
    saveStudioPrefsSync(get());
  },
  resetToOriginal: () => {
    stopAllAmbientLayers();
    set({
      fxMode: 'normal',
      vocalMode: 'normal',
      spatialOrbitAuto: false,
      spatialOrbitSpeed: 0.145,
      spatialRoomSize: 0,
      spatialManualPos: { x: 0, z: 0 },
      subBassBoost: 0,
      harmonicDrive: 0,
      stereoWidth: 0,
      reverbMix: 0,
      trebleAir: 0,
      preservePitch: true,
      ambientVolumes: {
        rain: 0,
        vinyl: 0,
        waves: 0,
        binaural: 0,
        campfire: 0,
        cafe: 0
      }
    });
    saveStudioPrefsSync(get());

    // Reset playback speed back to 1.0x (unaltered original tempo)
    usePlayerStore.getState().setPlaybackSpeed(1.0);

    // Reset Equalizer back to 0dB Flat reference
    useSettingsStore.getState().setEqualizerPreset('Flat');
  },

  setAmbientVolume: (id, volume) => {
    const appliedVolume = setAmbientLayerVolume(id, volume);
    set((s) => ({
      ambientVolumes: { ...s.ambientVolumes, [id]: appliedVolume }
    }));
  },

  applyAmbientPreset: (preset) => {
    const allIds: AmbientLayerId[] = ['rain', 'vinyl', 'waves', 'binaural', 'campfire', 'cafe'];
    const nextVolumes: Record<AmbientLayerId, number> = {
      rain: 0,
      vinyl: 0,
      waves: 0,
      binaural: 0,
      campfire: 0,
      cafe: 0
    };
    for (const id of allIds) {
      const target = preset[id] || 0;
      nextVolumes[id] = setAmbientLayerVolume(id, target);
    }
    set({ ambientVolumes: nextVolumes });
  },

  stopAllAmbient: () => {
    stopAllAmbientLayers();
    set({
      ambientVolumes: { rain: 0, vinyl: 0, waves: 0, binaural: 0, campfire: 0, cafe: 0 }
    });
  },

  setStudioModalOpen: (isStudioModalOpen) => set({ isStudioModalOpen }),
  setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),

  startPomodoro: (mode = 'focus') => {
    set({
      pomodoroActive: true,
      pomodoroMode: mode,
      pomodoroSeconds: mode === 'focus' ? 25 * 60 : 5 * 60
    });
  },

  stopPomodoro: () => {
    set({
      pomodoroActive: false,
      pomodoroSeconds: 25 * 60
    });
  },

  tickPomodoro: () => {
    const { pomodoroActive, pomodoroSeconds, pomodoroMode, completedSessions } = get();
    if (!pomodoroActive) return;

    if (pomodoroSeconds > 1) {
      set({ pomodoroSeconds: pomodoroSeconds - 1 });
    } else {
      const nextMode = pomodoroMode === 'focus' ? 'break' : 'focus';
      set({
        pomodoroMode: nextMode,
        pomodoroSeconds: nextMode === 'focus' ? 25 * 60 : 5 * 60,
        completedSessions: pomodoroMode === 'focus' ? completedSessions + 1 : completedSessions
      });
    }
  },

  startSleepTimer: (minutes) => {
    const secs = Math.max(1, Math.round(minutes * 60));
    set({
      sleepActive: true,
      sleepSeconds: secs,
      sleepTotalSeconds: secs,
      sleepEndAtTrack: false
    });
  },

  stopSleepTimer: () => {
    set({
      sleepActive: false,
      sleepSeconds: 0,
      sleepTotalSeconds: 0,
      sleepEndAtTrack: false
    });
  },

  setSleepEndAtTrack: (val) => {
    set({
      sleepEndAtTrack: val,
      sleepActive: val,
      sleepSeconds: 0,
      sleepTotalSeconds: 0
    });
  },

  tickSleepTimer: () => {
    const { sleepActive, sleepEndAtTrack, sleepSeconds } = get();
    if (!sleepActive || sleepEndAtTrack) return;

    if (sleepSeconds > 1) {
      set({ sleepSeconds: sleepSeconds - 1 });
    } else {
      // Pause music & mute ambient layers when sleep timer finishes
      usePlayerStore.getState().pause();
      get().stopAllAmbient();
      set({
        sleepActive: false,
        sleepSeconds: 0,
        sleepTotalSeconds: 0,
        sleepEndAtTrack: false
      });
    }
  }
}));
