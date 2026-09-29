import type { AmbientLayerId } from '../stores/studioStore';

/**
 * Procedural Web Audio Ambient Soundscape Synthesizer
 * Synthesizes real-time stereo ambient layers (Midnight Rain, Vinyl Crackle, Ocean Surf, 40Hz Binaural Focus)
 * with zero external audio asset dependencies.
 */
let ambientCtx: AudioContext | null = null;
const activeLayerNodes = new Map<
  AmbientLayerId,
  { gain: GainNode; cleanup: () => void }
>();

function getAmbientContext(): AudioContext {
  if (!ambientCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
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

function startAmbientLayer(id: AmbientLayerId, volume: number): void {
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

export function setAmbientLayerVolume(id: AmbientLayerId, volume: number): number {
  const clamped = Math.max(0, Math.min(1, volume));
  const existing = activeLayerNodes.get(id);

  if (clamped <= 0.01) {
    if (existing) {
      existing.cleanup();
      activeLayerNodes.delete(id);
    }
    return 0;
  }

  if (existing && ambientCtx) {
    existing.gain.gain.setTargetAtTime(clamped * 0.55, ambientCtx.currentTime, 0.05);
  } else {
    startAmbientLayer(id, clamped);
  }

  return clamped;
}

export function stopAllAmbientLayers(): void {
  activeLayerNodes.forEach((node) => node.cleanup());
  activeLayerNodes.clear();
}
