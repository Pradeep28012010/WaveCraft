import { create } from 'zustand';
import { usePlayerStore } from './playerStore';
import { setAmbientLayerVolume, stopAllAmbientLayers } from '../services/ambientSynth';

export type StudioFXMode =
  | 'normal'
  | 'slowed-reverb'
  | 'nightcore'
  | '8d-orbit'
  | 'bass-cinema'
  | 'vocal-stage';

export type AmbientLayerId = 'rain' | 'vinyl' | 'waves' | 'binaural';

export interface StudioFXInfo {
  id: StudioFXMode;
  name: string;
  badge: string;
  description: string;
  accent: string;
}

export const STUDIO_FX_MODES: StudioFXInfo[] = [
  {
    id: 'normal',
    name: 'Studio Master',
    badge: '320K FLAT',
    description: 'Bit-accurate 320kbps studio reference audio with zero coloration and pure dynamic headroom.',
    accent: 'from-emerald-500 to-teal-600'
  },
  {
    id: '8d-orbit',
    name: '3D Spatial Audio',
    badge: '360° HRTF',
    description: 'True 360° HRTF binaural soundstage revolving around your head with a centered sub-bass anchor and concert dome acoustics.',
    accent: 'from-cyan-500 to-blue-600'
  },
  {
    id: 'slowed-reverb',
    name: 'Slowed + Reverb',
    badge: '0.88x HALL',
    description: 'Warm 0.88x analog tape speed paired with high-definition stereo convolution hall reverb.',
    accent: 'from-purple-500 to-indigo-600'
  },
  {
    id: 'bass-cinema',
    name: 'Sub-Bass Cinema',
    badge: 'DEEP SUB',
    description: 'Deep theater sub-bass punch at 32Hz–64Hz with automatic headroom limiting and crisp highs.',
    accent: 'from-amber-500 to-red-600'
  },
  {
    id: 'nightcore',
    name: 'Nightcore Rush',
    badge: '1.18x UP',
    description: 'High-energy 1.18x tempo & pitch lift with silky studio treble air and zero harshness.',
    accent: 'from-pink-500 to-rose-600'
  },
  {
    id: 'vocal-stage',
    name: 'Vocal Stage HD',
    badge: 'CLARITY',
    description: 'Front-row lead vocal presence boost with studio plate ambiance and silky harmonic air.',
    accent: 'from-fuchsia-500 to-purple-600'
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
    subtitle: 'Binaural study pad',
    icon: '🧠'
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
  setAmbientVolume: (id: AmbientLayerId, volume: number) => void;
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
}

function loadStudioPrefsSync(): PersistedStudioPrefs {
  const defaults: PersistedStudioPrefs = {
    fxMode: 'normal',
    vocalMode: 'normal',
    spatialOrbitAuto: true,
    spatialOrbitSpeed: 0.145,
    spatialRoomSize: 0.26,
    spatialManualPos: { x: 0.65, z: -0.55 }
  };
  try {
    const raw = localStorage.getItem(STUDIO_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedStudioPrefs>;
    return {
      fxMode: parsed.fxMode || defaults.fxMode,
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
          : defaults.spatialManualPos
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
      spatialManualPos: state.spatialManualPos
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
  ambientVolumes: {
    rain: 0,
    vinyl: 0,
    waves: 0,
    binaural: 0
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

  setAmbientVolume: (id, volume) => {
    const appliedVolume = setAmbientLayerVolume(id, volume);
    set((s) => ({
      ambientVolumes: { ...s.ambientVolumes, [id]: appliedVolume }
    }));
  },

  stopAllAmbient: () => {
    stopAllAmbientLayers();
    set({
      ambientVolumes: { rain: 0, vinyl: 0, waves: 0, binaural: 0 }
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
