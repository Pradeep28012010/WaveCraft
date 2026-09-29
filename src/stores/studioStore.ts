import { create } from 'zustand';
import { usePlayerStore } from './playerStore';

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
    badge: '360° HD',
    description: 'Lossless 360° binaural spatial stage with stereo widening and smooth distortion-free orbit.',
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

// Procedural Web Audio Ambient Synthesizer
let ambientCtx: AudioContext | null = null;
const activeLayerNodes = new Map<
  AmbientLayerId,
  { gain: GainNode; cleanup: () => void }
>();

function getAmbientContext(): AudioContext {
  if (!ambientCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    ambientCtx = new Ctx();
  }
  if (ambientCtx.state === 'suspended') {
    ambientCtx.resume().catch(() => {});
  }
  return ambientCtx;
}

function createNoiseBuffer(ctx: AudioContext, type: 'pink' | 'vinyl' | 'brown'): AudioBuffer {
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const out = buffer.getChannelData(ch);
    if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
        b6 = white * 0.115926;
      }
    } else if (type === 'brown') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        out[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = out[i];
        out[i] *= 0.18;
      }
    } else {
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = (Math.random() * 2 - 1) * 0.012;
        last = (last + 0.04 * white) / 1.04;
        const pop = Math.random() > 0.9988 ? (Math.random() * 2 - 1) * 0.45 : 0;
        out[i] = last + pop;
      }
    }
  }
  return buffer;
}

function startAmbientLayer(id: AmbientLayerId, volume: number) {
  const ctx = getAmbientContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = Math.max(0, Math.min(1, volume * 0.55));
  masterGain.connect(ctx.destination);

  if (id === 'rain') {
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx, 'pink');
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.65;

    src.connect(filter);
    filter.connect(masterGain);
    src.start();

    activeLayerNodes.set(id, {
      gain: masterGain,
      cleanup: () => {
        try {
          src.stop();
          src.disconnect();
          masterGain.disconnect();
        } catch {}
      }
    });
  } else if (id === 'vinyl') {
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx, 'vinyl');
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 550;

    src.connect(hp);
    hp.connect(masterGain);
    src.start();

    activeLayerNodes.set(id, {
      gain: masterGain,
      cleanup: () => {
        try {
          src.stop();
          src.disconnect();
          masterGain.disconnect();
        } catch {}
      }
    });
  } else if (id === 'waves') {
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx, 'brown');
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 360;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);

    src.connect(lp);
    lp.connect(masterGain);
    src.start();
    lfo.start();

    activeLayerNodes.set(id, {
      gain: masterGain,
      cleanup: () => {
        try {
          src.stop();
          lfo.stop();
          src.disconnect();
          masterGain.disconnect();
        } catch {}
      }
    });
  } else if (id === 'binaural') {
    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();

    oscL.type = 'sine';
    oscR.type = 'sine';
    oscL.frequency.value = 200;
    oscR.frequency.value = 240;
    panL.pan.value = -0.75;
    panR.pan.value = 0.75;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.16;

    oscL.connect(panL);
    oscR.connect(panR);
    panL.connect(padGain);
    panR.connect(padGain);
    padGain.connect(masterGain);

    oscL.start();
    oscR.start();

    activeLayerNodes.set(id, {
      gain: masterGain,
      cleanup: () => {
        try {
          oscL.stop();
          oscR.stop();
          masterGain.disconnect();
        } catch {}
      }
    });
  }
}

interface StudioState {
  fxMode: StudioFXMode;
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

export const useStudioStore = create<StudioState>((set, get) => ({
  fxMode: 'normal',
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

  setFxMode: (fxMode) => set({ fxMode }),

  setAmbientVolume: (id, volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const existing = activeLayerNodes.get(id);

    if (clamped <= 0.01) {
      if (existing) {
        existing.cleanup();
        activeLayerNodes.delete(id);
      }
      set((s) => ({
        ambientVolumes: { ...s.ambientVolumes, [id]: 0 }
      }));
      return;
    }

    if (existing && ambientCtx) {
      existing.gain.gain.setTargetAtTime(clamped * 0.55, ambientCtx.currentTime, 0.05);
    } else {
      startAmbientLayer(id, clamped);
    }

    set((s) => ({
      ambientVolumes: { ...s.ambientVolumes, [id]: clamped }
    }));
  },

  stopAllAmbient: () => {
    activeLayerNodes.forEach((node) => node.cleanup());
    activeLayerNodes.clear();
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
