/**
 * WaveCraft Procedural Vinyl Scratch & Turntable Motor Audio Synthesizer
 * High-performance Web Audio DSP generator producing authentic analog turntable
 * scratch bursts, needle friction, and motor ramp transients with zero external asset latency.
 */

let sharedScratchCtx: AudioContext | null = null;

function getScratchAudioContext(fallbackCtx?: AudioContext | null): AudioContext | null {
  if (fallbackCtx && fallbackCtx.state !== 'closed') return fallbackCtx;
  if (!sharedScratchCtx || sharedScratchCtx.state === 'closed') {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedScratchCtx = new AudioCtx({ latencyHint: 'interactive' });
    }
  }
  if (sharedScratchCtx && sharedScratchCtx.state === 'suspended') {
    sharedScratchCtx.resume().catch(() => {});
  }
  return sharedScratchCtx;
}

// Pre-generated 1-second white/pink noise buffer for ultra-fast zero-alloc scratch playback
let noiseBufferCache: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBufferCache && noiseBufferCache.sampleRate === ctx.sampleRate) {
    return noiseBufferCache;
  }
  const length = Math.floor(ctx.sampleRate * 0.8);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    // Pink noise filter approximation
    b0 = 0.99765 * b0 + white * 0.0990460;
    b1 = 0.96300 * b1 + white * 0.1384078;
    b2 = 0.57000 * b2 + white * 0.2359676;
    data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.35;
  }
  noiseBufferCache = buffer;
  return buffer;
}

/**
 * Trigger an authentic turntable scratch sound effect
 * @param velocity Speed of the scratch gesture (0.1 to 3.0+)
 * @param direction 1 = forward scrub, -1 = reverse pull
 * @param externalCtx Optional AudioContext to reuse
 */
export function playScratchSound(
  velocity = 1.0,
  direction: 1 | -1 = 1,
  externalCtx?: AudioContext | null
): void {
  try {
    const ctx = getScratchAudioContext(externalCtx);
    if (!ctx) return;

    const absVel = Math.min(3.5, Math.max(0.2, Math.abs(velocity)));
    const now = ctx.currentTime;
    const duration = Math.max(0.06, Math.min(0.22, 0.16 / absVel));

    // 1. Dual oscillator for tonal record groove content
    const osc = ctx.createOscillator();
    osc.type = direction > 0 ? 'sawtooth' : 'triangle';
    const baseFreq = 260 * absVel;
    const targetFreq = direction > 0 ? baseFreq * 1.6 : baseFreq * 0.6;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, targetFreq), now + duration);

    // 2. Resonant bandpass filter (stylus resonance in vinyl groove)
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 4.8;
    const centerFreq = Math.min(4800, Math.max(450, 750 * absVel * (direction > 0 ? 1.3 : 0.85)));
    filter.frequency.setValueAtTime(centerFreq, now);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(200, centerFreq * (direction > 0 ? 1.4 : 0.5)),
      now + duration
    );

    // 3. Noise layer for stylus needle friction
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    noise.playbackRate.value = absVel;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1800;

    // 4. Amplitude envelopes
    const oscGain = ctx.createGain();
    const peakGain = Math.min(0.35, 0.12 * absVel);
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(peakGain, now + 0.012);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(peakGain * 0.65, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.85);

    // Master scratch limiter & output
    const scratchMaster = ctx.createGain();
    scratchMaster.gain.value = 0.85;

    osc.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(scratchMaster);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(scratchMaster);

    scratchMaster.connect(ctx.destination);

    osc.start(now);
    noise.start(now);
    osc.stop(now + duration + 0.05);
    noise.stop(now + duration + 0.05);
  } catch {}
}

/**
 * Turntable needle drop / tap micro-transient
 */
export function playNeedleDrop(externalCtx?: AudioContext | null): void {
  try {
    const ctx = getScratchAudioContext(externalCtx);
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  } catch {}
}
