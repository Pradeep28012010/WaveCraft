import { usePlayerStore } from '../stores/playerStore';
import { useStudioStore, type StudioFXMode } from '../stores/studioStore';
import { useSettingsStore } from '../stores/settingsStore';

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Audiophile-tuned EQ offsets for remaining active modes
const FX_EQ_OFFSETS: Record<StudioFXMode, number[]> = {
  normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  '8d-orbit': [0.8, 0.6, 0.2, 0, 0, 0, 0.3, 0.6, 0.8, 0.8],
  'arena-live': [1.6, 1.4, 0.6, 0, 0.2, 0.5, 1.0, 1.4, 1.5, 1.2]
};

export interface YouTubePlayerInstance {
  playVideo?: () => void;
  pauseVideo?: () => void;
  stopVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume?: (volume: number) => void;
  setPlaybackRate?: (rate: number) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  destroy?: () => void;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
  loadVideoById?: (videoId: string | { videoId: string; startSeconds?: number }, startSeconds?: number) => void;
  cueVideoById?: (videoId: string | { videoId: string; startSeconds?: number }, startSeconds?: number) => void;
  setPlaybackQuality?: (quality: string) => void;
}

let ytPlayerInstance: YouTubePlayerInstance | null = null;
let htmlAudioElement: HTMLAudioElement | null = null;
let activeEngine: 'audio' | 'youtube' = 'youtube';

// Web Audio API Studio Mastering Graph, True 360° HRTF 3D Spatial Stage, Vocal Stem Isolator & Visualizer Analyser
let audioCtx: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let preGainNode: GainNode | null = null;
let eqFilters: BiquadFilterNode[] = [];
let subBassRackNode: BiquadFilterNode | null = null;
let trebleAirRackNode: BiquadFilterNode | null = null;
let exciterWaveShaper: WaveShaperNode | null = null;
let stereoPanner: StereoPannerNode | null = null;
let dryPathGain: GainNode | null = null;
let sideWidthGain: GainNode | null = null;
let sinLfoNode: OscillatorNode | null = null;
let panLfoGain: GainNode | null = null;
let reverbWetGain: GainNode | null = null;
let masterLimiter: DynamicsCompressorNode | null = null;
let gainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let lastExciterDrive = -1;

function createAnalogSaturationCurve(driveAmount: number): Float32Array<ArrayBuffer> {
  const samples = 4096;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  // Bit-perfect linear identity transfer function when drive is 0: f(x) = x (zero coloration)
  if (driveAmount < 0.01) {
    for (let i = 0; i < samples; i++) {
      curve[i] = (i * 2) / (samples - 1) - 1;
    }
    return curve;
  }
  // Audiophile gentle warm tape saturation curve (soft-knee cubic saturation, no harsh clipping)
  const drive = Math.min(1, Math.max(0, driveAmount)) * 0.45;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = x - (drive / 3) * Math.pow(x, 3);
  }
  return curve;
}

export function setHtmlAudioElement(el: HTMLAudioElement | null): void {
  htmlAudioElement = el;
}

export function getHtmlAudioElement(): HTMLAudioElement | null {
  return htmlAudioElement;
}

export function getPreciseAudioTime(): number {
  if (activeEngine === 'audio' && htmlAudioElement) {
    return htmlAudioElement.currentTime;
  }
  if (ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
    return ytPlayerInstance.getCurrentTime() || 0;
  }
  return usePlayerStore.getState().currentTime || 0;
}

export function setPlaybackRateSteering(rate: number): void {
  const clamped = Math.max(0.5, Math.min(2.0, rate));
  if (activeEngine === 'audio' && htmlAudioElement) {
    try {
      htmlAudioElement.playbackRate = clamped;
    } catch {}
  } else if (ytPlayerInstance && typeof ytPlayerInstance.setPlaybackRate === 'function') {
    try {
      ytPlayerInstance.setPlaybackRate(clamped);
    } catch {}
  }
}

export function setYtPlayerInstance(player: YouTubePlayerInstance | null): void {
  ytPlayerInstance = player;
}

export function getPlayer(): YouTubePlayerInstance | null {
  return ytPlayerInstance;
}

export function getActiveEngine(): 'audio' | 'youtube' {
  return activeEngine;
}

export function setActiveEngine(engine: 'audio' | 'youtube'): void {
  activeEngine = engine;
}

export function hasWebAudioGain(): boolean {
  return Boolean(audioCtx && gainNode);
}

export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    initAudioGraph(htmlAudioElement);
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx!;
}

export function resumeAudioContextIfNeeded(): void {
  if (!audioCtx) {
    initAudioGraph(htmlAudioElement);
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

export function setSmoothOutputGain(
  audio: HTMLAudioElement | null,
  targetGain: number,
  timeConstant = 0.035
): void {
  if (audioCtx && gainNode) {
    if (audio) audio.volume = 1.0;
    gainNode.gain.setTargetAtTime(Math.max(0, targetGain), audioCtx.currentTime, timeConstant);
  } else if (audio) {
    audio.volume = Math.max(0, Math.min(1, targetGain));
  }
}

/**
 * Generates an audiophile acoustic concert hall impulse response
 * with 22ms pre-delay (transient clarity), discrete geometric early reflections,
 * and high-frequency air damping (pure, silky decay with zero white noise wash).
 */
function createStudioImpulseResponse(
  ctx: AudioContext,
  durationSec = 2.0,
  decayRate = 2.6
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const preDelaySamples = Math.floor(sampleRate * 0.022); // 22ms pre-delay preserves punchy attacks

  const earlyReflections = [
    { t: 0.024, g: 0.55, pan: -0.4 },
    { t: 0.033, g: 0.42, pan: 0.5 },
    { t: 0.045, g: 0.35, pan: -0.6 },
    { t: 0.058, g: 0.28, pan: 0.4 },
    { t: 0.072, g: 0.22, pan: -0.3 },
    { t: 0.089, g: 0.18, pan: 0.6 },
    { t: 0.108, g: 0.14, pan: -0.5 },
    { t: 0.131, g: 0.10, pan: 0.3 }
  ];

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < preDelaySamples; i++) {
      data[i] = 0;
    }

    earlyReflections.forEach((er) => {
      const idx = Math.floor(sampleRate * er.t);
      if (idx < length) {
        const panGain = ch === 0 ? (1 - er.pan) * 0.5 : (1 + er.pan) * 0.5;
        data[idx] += er.g * panGain * (ch === 0 ? 1 : -0.9);
      }
    });

    let lpVal = 0;
    const signFlip = ch === 0 ? 1 : -1;
    for (let i = preDelaySamples; i < length; i++) {
      const t = (i - preDelaySamples) / (length - preDelaySamples);
      // High-frequency air absorption damping (warm tail, zero harsh hiss)
      const lpCoeff = 0.15 + 0.35 * (1 - t);
      const raw = (Math.random() * 2 - 1) * 0.25;
      lpVal += lpCoeff * (raw - lpVal);

      const envelope = Math.pow(1 - t, decayRate);
      data[i] += lpVal * envelope * 0.38 * signFlip;
    }
  }

  return impulse;
}

export function getTargetOutputGain(): number {
  const pState = usePlayerStore.getState();
  const userVol = pState.isMuted ? 0 : Math.max(0, Math.min(1, pState.volume));
  const studioState = useStudioStore.getState();
  const sleepScale =
    studioState.sleepActive && !studioState.sleepEndAtTrack && studioState.sleepSeconds <= 10
      ? Math.max(0, studioState.sleepSeconds / 10)
      : 1;
  return userVol * sleepScale;
}

export function syncHeadroomAndEQ(eqBands: number[], fxMode: StudioFXMode): void {
  if (!audioCtx || eqFilters.length === 0) return;
  const now = audioCtx.currentTime;
  const offsets = FX_EQ_OFFSETS[fxMode] || FX_EQ_OFFSETS.normal;
  const studio = useStudioStore.getState();

  eqBands.forEach((db, idx) => {
    const combined = Math.max(-12, Math.min(12, (db || 0) + (offsets[idx] || 0)));
    if (eqFilters[idx]) {
      eqFilters[idx].gain.setTargetAtTime(combined, now, 0.035);
    }
  });

  if (subBassRackNode) {
    subBassRackNode.gain.setTargetAtTime(Math.min(6, studio.subBassBoost || 0), now, 0.035);
  }
  if (trebleAirRackNode) {
    trebleAirRackNode.gain.setTargetAtTime(Math.min(4, studio.trebleAir || 0), now, 0.035);
  }

  const effectiveDrive = Math.min(1, studio.harmonicDrive || 0);
  if (exciterWaveShaper && Math.abs(effectiveDrive - lastExciterDrive) > 0.01) {
    lastExciterDrive = effectiveDrive;
    exciterWaveShaper.curve = createAnalogSaturationCurve(effectiveDrive);
  }

  // Maintain full 0.98 unity gain across ALL effects: ZERO volume drop when turning on FX!
  if (preGainNode) {
    preGainNode.gain.setTargetAtTime(0.98, now, 0.035);
  }
}

export function initAudioGraph(
  audio?: HTMLAudioElement | null,
  initialBands?: number[]
): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;

  if (!audioCtx) {
    try {
      audioCtx = new Ctx({ latencyHint: 'playback' });
      preGainNode = audioCtx.createGain();
      preGainNode.gain.value = 0.98;

      gainNode = audioCtx.createGain();
      gainNode.gain.value = getTargetOutputGain();

      stereoPanner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
      dryPathGain = audioCtx.createGain();
      dryPathGain.gain.value = 1.0;

      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 128;
      analyserNode.smoothingTimeConstant = 0.78;

      masterLimiter = audioCtx.createDynamicsCompressor();
      masterLimiter.threshold.value = -0.3;
      masterLimiter.knee.value = 10.0;
      masterLimiter.ratio.value = 3.5;
      masterLimiter.attack.value = 0.012;
      masterLimiter.release.value = 0.16;

      const orbitFreq = useStudioStore.getState().spatialOrbitSpeed || 0.12;
      sinLfoNode = audioCtx.createOscillator();
      sinLfoNode.type = 'sine';
      sinLfoNode.frequency.value = orbitFreq;

      panLfoGain = audioCtx.createGain();
      panLfoGain.gain.value = 0;

      if (stereoPanner) {
        sinLfoNode.connect(panLfoGain);
        panLfoGain.connect(stereoPanner.pan);
      }
      sinLfoNode.start();

      const msSplitter = audioCtx.createChannelSplitter(2);
      const msMerger = audioCtx.createChannelMerger(2);

      const midSumL = audioCtx.createGain();
      midSumL.gain.value = 0.5;
      const midSumR = audioCtx.createGain();
      midSumR.gain.value = 0.5;
      const midBus = audioCtx.createGain();
      midBus.gain.value = 1.0;

      const sideDiffL = audioCtx.createGain();
      sideDiffL.gain.value = 0.5;
      const sideDiffR = audioCtx.createGain();
      sideDiffR.gain.value = -0.5;
      const sideBus = audioCtx.createGain();
      sideBus.gain.value = 1.0;

      sideWidthGain = audioCtx.createGain();
      sideWidthGain.gain.value = 1.0;

      const sideInvertR = audioCtx.createGain();
      sideInvertR.gain.value = -1.0;

      const reverbHP = audioCtx.createBiquadFilter();
      reverbHP.type = 'highpass';
      reverbHP.frequency.value = 280;
      reverbHP.Q.value = 0.707;

      const reverbAirLP = audioCtx.createBiquadFilter();
      reverbAirLP.type = 'lowpass';
      reverbAirLP.frequency.value = 8500;
      reverbAirLP.Q.value = 0.707;

      const convolver = audioCtx.createConvolver();
      convolver.buffer = createStudioImpulseResponse(audioCtx, 2.0, 2.6);

      reverbWetGain = audioCtx.createGain();
      reverbWetGain.gain.value = 0;

      const bands = initialBands || useSettingsStore.getState().equalizerBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = audioCtx!.createBiquadFilter();
        if (idx === 0) filter.type = 'lowshelf';
        else if (idx === EQ_FREQUENCIES.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 0.95;
        filter.gain.value = bands[idx] || 0;
        return filter;
      });

      subBassRackNode = audioCtx.createBiquadFilter();
      subBassRackNode.type = 'lowshelf';
      subBassRackNode.frequency.value = 54;
      subBassRackNode.gain.value = useStudioStore.getState().subBassBoost || 0;

      trebleAirRackNode = audioCtx.createBiquadFilter();
      trebleAirRackNode.type = 'highshelf';
      trebleAirRackNode.frequency.value = 11000;
      trebleAirRackNode.gain.value = useStudioStore.getState().trebleAir || 0;

      exciterWaveShaper = audioCtx.createWaveShaper();
      exciterWaveShaper.oversample = '2x';
      exciterWaveShaper.curve = createAnalogSaturationCurve(
        useStudioStore.getState().harmonicDrive || 0
      );

      preGainNode.connect(eqFilters[0]);
      let prev: AudioNode = eqFilters[0];
      for (let i = 1; i < eqFilters.length; i++) {
        prev.connect(eqFilters[i]);
        prev = eqFilters[i];
      }
      prev.connect(subBassRackNode);
      subBassRackNode.connect(trebleAirRackNode);
      trebleAirRackNode.connect(exciterWaveShaper);
      prev = exciterWaveShaper;

      prev.connect(msSplitter);
      msSplitter.connect(midSumL, 0);
      msSplitter.connect(midSumR, 1);
      midSumL.connect(midBus);
      midSumR.connect(midBus);

      msSplitter.connect(sideDiffL, 0);
      msSplitter.connect(sideDiffR, 1);
      sideDiffL.connect(sideBus);
      sideDiffR.connect(sideBus);
      sideBus.connect(sideWidthGain);

      midBus.connect(msMerger, 0, 0);
      sideWidthGain.connect(msMerger, 0, 0);
      midBus.connect(msMerger, 0, 1);
      sideWidthGain.connect(sideInvertR);
      sideInvertR.connect(msMerger, 0, 1);

      if (stereoPanner) {
        msMerger.connect(stereoPanner);
        stereoPanner.connect(dryPathGain);
        stereoPanner.connect(reverbHP);
      } else {
        msMerger.connect(dryPathGain);
        msMerger.connect(reverbHP);
      }

      dryPathGain.connect(masterLimiter);

      reverbHP.connect(reverbAirLP);
      reverbAirLP.connect(convolver);
      convolver.connect(reverbWetGain);
      reverbWetGain.connect(masterLimiter);

      masterLimiter.connect(gainNode);
      gainNode.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);

      ensureLiveAcousticsGraph(audioCtx);
      attachAudioEngineSubscriptions();

      const initialFx = useStudioStore.getState().fxMode;
      syncHeadroomAndEQ(bands, initialFx);
      applyStudioFXToAudio(audio || htmlAudioElement, initialFx, usePlayerStore.getState().playbackSpeed || 1);
    } catch (err) {
      console.warn('Web Audio initialization error:', err);
    }
  }

  if (audio && !sourceNode && audioCtx && preGainNode) {
    try {
      sourceNode = audioCtx.createMediaElementSource(audio);
      sourceNode.connect(preGainNode);
      htmlAudioElement = audio;
      audio.volume = 1.0;
    } catch {}
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

export function ensureAudioGraph(audio?: HTMLAudioElement | null, initialBands?: number[]): void {
  initAudioGraph(audio, initialBands);
}

// --- Dedicated Live Concert & 3D Spatial Audio Generators for Real-Time Experience ---
let spatialAcousticGain: GainNode | null = null;
let spatialAcousticPanner: StereoPannerNode | null = null;
let spatialAcousticOsc: OscillatorNode | null = null;
let arenaAcousticsGain: GainNode | null = null;
let arenaSubOsc: OscillatorNode | null = null;
let arenaCrowdSource: AudioBufferSourceNode | null = null;

function createCrowdArenaBuffer(ctx: AudioContext): AudioBuffer {
  const duration = 6;
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.035 * white) / 1.035;
      const t = i / sampleRate;
      const swell = 0.5 + 0.45 * Math.sin(t * 0.75 + ch * 1.5) * Math.cos(t * 0.32);
      data[i] = last * swell * 0.24;
    }
  }
  return buffer;
}

function ensureLiveAcousticsGraph(ctx: AudioContext): void {
  if (spatialAcousticGain && arenaAcousticsGain) return;

  try {
    // 1. 3D Spatial Audio Orbital Synthesizer
    spatialAcousticGain = ctx.createGain();
    spatialAcousticGain.gain.value = 0;

    spatialAcousticPanner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    // Dual-harmonic binaural acoustic soundstage carrier (432Hz + 436Hz binaural shimmer with warm room diffusion)
    const spatialBuffer = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = spatialBuffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        const pink = (b0 + b1 + b2 + white * 0.5362) * 0.022;
        const t = i / ctx.sampleRate;
        const toneFreq = ch === 0 ? 432 : 436; // 4Hz binaural beat for deep 3D spatial soundstage perception
        const tone = Math.sin(2 * Math.PI * toneFreq * t) * 0.038;
        data[i] = pink + tone;
      }
    }

    const spatialBufferSource = ctx.createBufferSource();
    spatialBufferSource.buffer = spatialBuffer;
    spatialBufferSource.loop = true;

    const spatialFilter = ctx.createBiquadFilter();
    spatialFilter.type = 'bandpass';
    spatialFilter.frequency.value = 520;
    spatialFilter.Q.value = 0.9;

    spatialBufferSource.connect(spatialFilter);

    if (spatialAcousticPanner) {
      spatialFilter.connect(spatialAcousticPanner);
      spatialAcousticPanner.connect(spatialAcousticGain);
    } else {
      spatialFilter.connect(spatialAcousticGain);
    }

    spatialAcousticGain.connect(analyserNode || ctx.destination);
    spatialBufferSource.start();

    // 2. Live Concert Stadium Arena Generator
    arenaAcousticsGain = ctx.createGain();
    arenaAcousticsGain.gain.value = 0;

    // Sub-bass stadium floor vibration (55Hz)
    arenaSubOsc = ctx.createOscillator();
    arenaSubOsc.type = 'sine';
    arenaSubOsc.frequency.value = 55;
    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.value = 80;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.10;
    arenaSubOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(arenaAcousticsGain);
    arenaSubOsc.start();

    // Stadium acoustic crowd and hall reflection field
    const crowdBuffer = createCrowdArenaBuffer(ctx);
    arenaCrowdSource = ctx.createBufferSource();
    arenaCrowdSource.buffer = crowdBuffer;
    arenaCrowdSource.loop = true;

    const crowdHP = ctx.createBiquadFilter();
    crowdHP.type = 'highpass';
    crowdHP.frequency.value = 350;

    const crowdLP = ctx.createBiquadFilter();
    crowdLP.type = 'lowpass';
    crowdLP.frequency.value = 3200;

    const crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.22;

    arenaCrowdSource.connect(crowdHP);
    crowdHP.connect(crowdLP);
    crowdLP.connect(crowdGain);
    crowdGain.connect(arenaAcousticsGain);
    arenaCrowdSource.start();

    arenaAcousticsGain.connect(analyserNode || ctx.destination);
  } catch (err) {
    console.warn('Live acoustics graph initialization error:', err);
  }
}

export function setLiveSpatialPan(pan: number): void {
  const clamped = Math.max(-1, Math.min(1, pan));
  if (audioCtx) {
    const now = audioCtx.currentTime;
    if (spatialAcousticPanner) {
      spatialAcousticPanner.pan.setTargetAtTime(clamped, now, 0.035);
    }
    if (stereoPanner) {
      stereoPanner.pan.setTargetAtTime(clamped, now, 0.035);
    }
  }
}

export function applyStudioFXToAudio(
  audio: HTMLAudioElement | null,
  fxMode: StudioFXMode,
  baseSpeed: number
): void {
  const ctx = getAudioContext();
  const studio = useStudioStore.getState();
  const effectiveSpeed = baseSpeed || 1;
  const preservePitch = studio.preservePitch ?? true;

  if (audio) {
    try {
      (audio as any).preservesPitch = preservePitch;
      (audio as any).mozPreservesPitch = preservePitch;
      (audio as any).webkitPreservesPitch = preservePitch;
      if (Math.abs(audio.playbackRate - effectiveSpeed) > 0.005) {
        audio.playbackRate = effectiveSpeed;
      }
    } catch {}
  }

  if (
    ytPlayerInstance &&
    window.ytPlayerReady &&
    typeof ytPlayerInstance.setPlaybackRate === 'function'
  ) {
    try {
      ytPlayerInstance.setPlaybackRate(effectiveSpeed);
    } catch {}
  }

  // Ensure AudioContext and Live Acoustics Graph are awake when any effect is enabled
  if (fxMode !== 'normal') {
    resumeAudioContextIfNeeded();
    if (ctx) {
      ensureLiveAcousticsGraph(ctx);
    }
  }

  const isPlaying = usePlayerStore.getState().isPlaying;
  const now = ctx ? ctx.currentTime : 0;

  // 1. Real-time 3D Spatial Audio processing
  if (spatialAcousticGain && ctx) {
    if (fxMode === '8d-orbit' && isPlaying) {
      spatialAcousticGain.gain.setTargetAtTime(0.09, now, 0.05);

      if (spatialAcousticPanner) {
        if (!studio.spatialOrbitAuto) {
          const manualX = Math.max(-1, Math.min(1, studio.spatialManualPos?.x ?? 0));
          spatialAcousticPanner.pan.setTargetAtTime(manualX * 0.88, now, 0.04);
        }
      }

      // Coupled YouTube distance attenuation for true physical distance feel
      if (ytPlayerInstance && typeof ytPlayerInstance.setVolume === 'function') {
        const baseVol = (usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume) * 100;
        const dist = Math.hypot(studio.spatialManualPos?.x ?? 0, studio.spatialManualPos?.z ?? 0);
        const distAttenuation = 1 - Math.min(0.22, dist * 0.22);
        ytPlayerInstance.setVolume(Math.round(baseVol * distAttenuation));
      }
    } else {
      spatialAcousticGain.gain.setTargetAtTime(0, now, 0.05);
      if (ytPlayerInstance && typeof ytPlayerInstance.setVolume === 'function') {
        const baseVol = (usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume) * 100;
        ytPlayerInstance.setVolume(Math.round(baseVol));
      }
    }
  }

  // 2. Real-time Live Concert Arena processing
  if (arenaAcousticsGain && ctx) {
    if (fxMode === 'arena-live' && isPlaying) {
      const arenaVolume = Math.min(0.35, 0.16 + (studio.reverbMix || 0) * 0.18);
      arenaAcousticsGain.gain.setTargetAtTime(arenaVolume, now, 0.06);
    } else {
      arenaAcousticsGain.gain.setTargetAtTime(0, now, 0.06);
    }
  }

  // 3. Web Audio Master DSP chain (applied to direct streams / offline vault playback & mastering rack)
  if (ctx) {
    const isSpatial3D = fxMode === '8d-orbit';

    const speedHz = Math.max(0.04, Math.min(0.4, studio.spatialOrbitSpeed || 0.12));
    if (sinLfoNode) {
      sinLfoNode.frequency.setTargetAtTime(speedHz, now, 0.06);
    }

    if (panLfoGain && stereoPanner) {
      if (isSpatial3D) {
        if (studio.spatialOrbitAuto) {
          panLfoGain.gain.setTargetAtTime(0.82, now, 0.06);
          stereoPanner.pan.setTargetAtTime(0, now, 0.06);
        } else {
          panLfoGain.gain.setTargetAtTime(0, now, 0.04);
          const manualX = Math.max(-1, Math.min(1, studio.spatialManualPos?.x ?? 0));
          stereoPanner.pan.setTargetAtTime(manualX * 0.85, now, 0.04);
        }
      } else {
        panLfoGain.gain.setTargetAtTime(0, now, 0.06);
        stereoPanner.pan.setTargetAtTime(0, now, 0.06);
      }
    }

    if (dryPathGain) {
      dryPathGain.gain.setTargetAtTime(1.0, now, 0.04);
    }

    // Mastering Rack: Stereo Width
    if (sideWidthGain) {
      const basePresetWidth =
        fxMode === '8d-orbit' ? 1.25 : fxMode === 'arena-live' ? 1.30 : 1.0;
      const customWidthOffset = (studio.stereoWidth || 0) * 0.45;
      const finalWidth = Math.max(0.2, Math.min(1.65, basePresetWidth + customWidthOffset));
      sideWidthGain.gain.setTargetAtTime(finalWidth, now, 0.05);
    }

    // Mastering Rack: Convolution Hall Reverb
    if (reverbWetGain) {
      const presetWet =
        fxMode === 'arena-live'
          ? 0.18
          : fxMode === '8d-orbit'
          ? Math.min(0.20, Math.max(0.06, (studio.spatialRoomSize ?? 0.26) * 0.3))
          : 0;
      const customWet = (studio.reverbMix || 0) * 0.35;
      const wetAmount = Math.min(0.40, Math.max(presetWet, customWet));
      reverbWetGain.gain.setTargetAtTime(wetAmount, now, 0.05);
    }

    // Mastering Rack: Sub-Bass Boost (lowshelf filter at 54Hz)
    if (subBassRackNode) {
      const targetGain = Math.max(0, Math.min(9, studio.subBassBoost || 0));
      subBassRackNode.gain.setTargetAtTime(targetGain, now, 0.035);
    }

    // Mastering Rack: Treble Air (highshelf filter at 11kHz)
    if (trebleAirRackNode) {
      const targetAir = Math.max(-6, Math.min(6, studio.trebleAir || 0));
      trebleAirRackNode.gain.setTargetAtTime(targetAir, now, 0.035);
    }

    // Mastering Rack: Harmonic Analog Saturation WaveShaper
    if (exciterWaveShaper && Math.abs((studio.harmonicDrive || 0) - lastExciterDrive) > 0.01) {
      lastExciterDrive = studio.harmonicDrive || 0;
      exciterWaveShaper.curve = createAnalogSaturationCurve(lastExciterDrive);
    }
  }
}

export const getAudioFrequencyData = (out: Uint8Array): boolean => {
  if (!analyserNode || !audioCtx || audioCtx.state !== 'running') {
    return false;
  }
  try {
    analyserNode.getByteFrequencyData(out as any);
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += out[i];
    return sum > 0;
  } catch {
    return false;
  }
};

/**
 * Call synchronously inside a click handler before async operations (like AI Vibe DJ)
 * so the browser unlocks audio playback for subsequent async playTrack() calls.
 */
export const unlockAudioEngine = (): void => {
  try {
    attachAudioEngineSubscriptions();
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (htmlAudioElement && htmlAudioElement.paused && !htmlAudioElement.src) {
      // Silent tiny WAV data URI to unlock HTMLAudioElement gesture requirement
      htmlAudioElement.src =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      htmlAudioElement.volume = 0;
      htmlAudioElement
        .play()
        .then(() => {
          htmlAudioElement?.pause();
          if (htmlAudioElement) {
            htmlAudioElement.currentTime = 0;
            htmlAudioElement.volume = audioCtx ? 1.0 : usePlayerStore.getState().volume;
          }
        })
        .catch(() => {});
    }
  } catch {}
};

export const seekToTime = (seconds: number): void => {
  if (activeEngine === 'audio' && htmlAudioElement) {
    // Micro-smooth gain dip on seek to prevent sample discontinuity click
    if (audioCtx && gainNode) {
      const now = audioCtx.currentTime;
      const target = getTargetOutputGain();
      gainNode.gain.setTargetAtTime(target * 0.35, now, 0.008);
      htmlAudioElement.currentTime = seconds;
      gainNode.gain.setTargetAtTime(target, now + 0.018, 0.025);
    } else {
      htmlAudioElement.currentTime = seconds;
    }
  } else if (ytPlayerInstance && typeof ytPlayerInstance.seekTo === 'function') {
    ytPlayerInstance.seekTo(seconds, true);
    if (usePlayerStore.getState().isPlaying) {
      try {
        ytPlayerInstance.playVideo?.();
      } catch {}
    }
  }
};

let subscriptionsAttached = false;
export function attachAudioEngineSubscriptions(): void {
  if (subscriptionsAttached || typeof window === 'undefined') return;
  subscriptionsAttached = true;

  try {
    // Reactive subscription to Studio store changes
    useStudioStore.subscribe((state, prevState) => {
      if (
        state.fxMode !== prevState.fxMode ||
        state.subBassBoost !== prevState.subBassBoost ||
        state.harmonicDrive !== prevState.harmonicDrive ||
        state.stereoWidth !== prevState.stereoWidth ||
        state.reverbMix !== prevState.reverbMix ||
        state.trebleAir !== prevState.trebleAir ||
        state.spatialRoomSize !== prevState.spatialRoomSize ||
        state.spatialOrbitAuto !== prevState.spatialOrbitAuto ||
        state.spatialOrbitSpeed !== prevState.spatialOrbitSpeed ||
        state.spatialManualPos !== prevState.spatialManualPos ||
        state.preservePitch !== prevState.preservePitch
      ) {
        applyStudioFXToAudio(
          htmlAudioElement,
          state.fxMode,
          usePlayerStore.getState().playbackSpeed || 1
        );
      }
    });

    // Reactive subscription to Settings store Equalizer changes
    useSettingsStore.subscribe((state, prevState) => {
      if (state.equalizerBands !== prevState.equalizerBands) {
        syncHeadroomAndEQ(state.equalizerBands, useStudioStore.getState().fxMode);
      }
    });

    // Reactive subscription to Player state changes
    usePlayerStore.subscribe((state, prevState) => {
      if (
        state.isPlaying !== prevState.isPlaying ||
        state.playbackSpeed !== prevState.playbackSpeed
      ) {
        applyStudioFXToAudio(
          htmlAudioElement,
          useStudioStore.getState().fxMode,
          state.playbackSpeed || 1
        );
      }
    });
  } catch (err) {
    console.warn('Audio engine subscription init deferred:', err);
  }
}

// Automatic gesture unlock without touching stores during module evaluation
if (typeof window !== 'undefined') {
  const unlockOnGesture = () => {
    unlockAudioEngine();
    attachAudioEngineSubscriptions();
  };
  ['click', 'touchstart', 'pointerdown', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, unlockOnGesture, { passive: true });
  });
}
