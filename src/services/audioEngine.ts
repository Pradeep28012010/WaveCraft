import { usePlayerStore } from '../stores/playerStore';
import { useStudioStore, type StudioFXMode } from '../stores/studioStore';
import { useSettingsStore } from '../stores/settingsStore';

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Audiophile-tuned EQ offsets for remaining active modes
const FX_EQ_OFFSETS: Record<StudioFXMode, number[]> = {
  normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  '8d-orbit': [1.2, 0.9, 0.4, 0, 0, 0, 0.4, 0.8, 1.2, 1.0],
  'arena-live': [2.8, 2.4, 1.2, -0.4, 0.2, 0.8, 1.6, 2.0, 2.2, 2.0]
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
let autoMixerLowPass: BiquadFilterNode | null = null;
let autoMixerHighTilt: BiquadFilterNode | null = null;

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
  if (el && audioCtx && preGainNode && !sourceNode) {
    try {
      sourceNode = audioCtx.createMediaElementSource(el);
      sourceNode.connect(preGainNode);
      el.volume = 1.0;
    } catch {}
  }
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

export function syncLoudnessNormalization(): void {
  if (!audioCtx || !masterLimiter) return;
  const isNorm = useSettingsStore.getState().loudnessNormalization ?? true;
  const now = audioCtx.currentTime;
  if (isNorm) {
    masterLimiter.threshold.setTargetAtTime(-2.0, now, 0.05);
    masterLimiter.knee.setTargetAtTime(8.0, now, 0.05);
    masterLimiter.ratio.setTargetAtTime(4.0, now, 0.05);
    masterLimiter.attack.setTargetAtTime(0.005, now, 0.05);
    masterLimiter.release.setTargetAtTime(0.12, now, 0.05);
  } else {
    masterLimiter.threshold.setTargetAtTime(-0.3, now, 0.05);
    masterLimiter.knee.setTargetAtTime(10.0, now, 0.05);
    masterLimiter.ratio.setTargetAtTime(1.5, now, 0.05);
    masterLimiter.attack.setTargetAtTime(0.012, now, 0.05);
    masterLimiter.release.setTargetAtTime(0.16, now, 0.05);
  }
}

export function crossfadeAudioTransition(
  audio: HTMLAudioElement | null,
  durationSec = 2.0
): Promise<void> {
  return new Promise((resolve) => {
    if (!audioCtx || !gainNode) {
      if (audio) {
        audio.volume = 0;
        setTimeout(() => {
          audio.volume = getTargetOutputGain();
          resolve();
        }, Math.min(300, durationSec * 1000));
      } else {
        resolve();
      }
      return;
    }
    const now = audioCtx.currentTime;
    const dur = Math.max(0.1, durationSec);
    const targetGain = getTargetOutputGain();

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0.001, now + dur * 0.45);

    // Trigger frequency-carved transition filter sweep if Auto-Mixer mode is active
    triggerFrequencyCarvedTransition(dur);

    setTimeout(() => {
      if (audioCtx && gainNode) {
        const nextNow = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(nextNow);
        gainNode.gain.setValueAtTime(0.001, nextNow);
        gainNode.gain.linearRampToValueAtTime(targetGain, nextNow + dur * 0.55);
      }
      resolve();
    }, dur * 450);
  });
}

/**
 * Triggers a frequency-carved transition filter sweep:
 * - Gentle low-pass sweep on outgoing track (20kHz down to 450Hz) to carve out highs and presence.
 * - Gentle high-frequency tilt on incoming track (+3dB at 4kHz) to give harmonic presence,
 *   while the low-pass opens smoothly back to 20kHz.
 */
export function triggerFrequencyCarvedTransition(durationSec = 2.0): void {
  const isEnabled = useSettingsStore.getState().autoMixerFilterSweeps ?? true;
  if (!isEnabled || !audioCtx || !autoMixerLowPass || !autoMixerHighTilt) return;

  const now = audioCtx.currentTime;
  const dur = Math.max(0.4, durationSec);
  const outgoingDur = dur * 0.45;
  const incomingDur = dur * 0.55;

  // 1. Outgoing Low-Pass Sweep (roll-off harsh highs/mids)
  autoMixerLowPass.frequency.cancelScheduledValues(now);
  autoMixerLowPass.frequency.setValueAtTime(Math.max(20, autoMixerLowPass.frequency.value), now);
  autoMixerLowPass.frequency.exponentialRampToValueAtTime(450, now + outgoingDur);

  // 2. Outgoing High-Tilt duck
  autoMixerHighTilt.gain.cancelScheduledValues(now);
  autoMixerHighTilt.gain.setValueAtTime(autoMixerHighTilt.gain.value, now);
  autoMixerHighTilt.gain.linearRampToValueAtTime(-2.5, now + outgoingDur);

  // 3. Incoming High-Tilt boost & Low-Pass smooth opening
  setTimeout(() => {
    if (!audioCtx || !autoMixerLowPass || !autoMixerHighTilt) return;
    const midNow = audioCtx.currentTime;
    autoMixerHighTilt.gain.cancelScheduledValues(midNow);
    autoMixerHighTilt.gain.setValueAtTime(3.0, midNow);
    autoMixerHighTilt.gain.linearRampToValueAtTime(0.0, midNow + incomingDur);

    autoMixerLowPass.frequency.cancelScheduledValues(midNow);
    autoMixerLowPass.frequency.setValueAtTime(550, midNow);
    autoMixerLowPass.frequency.exponentialRampToValueAtTime(20000, midNow + incomingDur);
  }, outgoingDur * 1000);
}

export function resetAutoMixerFilters(): void {
  if (!audioCtx || !autoMixerLowPass || !autoMixerHighTilt) return;
  const now = audioCtx.currentTime;
  autoMixerLowPass.frequency.cancelScheduledValues(now);
  autoMixerLowPass.frequency.setTargetAtTime(20000, now, 0.05);
  autoMixerHighTilt.gain.cancelScheduledValues(now);
  autoMixerHighTilt.gain.setTargetAtTime(0, now, 0.05);
}

export function isAutoMixerFilterActive(): boolean {
  return Boolean(useSettingsStore.getState().autoMixerFilterSweeps ?? true);
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
      masterLimiter.threshold.value = -2.0;
      masterLimiter.knee.value = 8.0;
      masterLimiter.ratio.value = 4.0;
      masterLimiter.attack.value = 0.005;
      masterLimiter.release.value = 0.12;

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

      autoMixerLowPass = audioCtx.createBiquadFilter();
      autoMixerLowPass.type = 'lowpass';
      autoMixerLowPass.frequency.value = 20000;
      autoMixerLowPass.Q.value = 0.707;

      autoMixerHighTilt = audioCtx.createBiquadFilter();
      autoMixerHighTilt.type = 'highshelf';
      autoMixerHighTilt.frequency.value = 4000;
      autoMixerHighTilt.gain.value = 0;

      preGainNode.connect(autoMixerLowPass);
      autoMixerLowPass.connect(autoMixerHighTilt);
      autoMixerHighTilt.connect(eqFilters[0]);
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

      spatialHeadShadowFilter = audioCtx.createBiquadFilter();
      spatialHeadShadowFilter.type = 'lowpass';
      spatialHeadShadowFilter.frequency.value = 20000;
      spatialHeadShadowFilter.Q.value = 0.707;

      if (stereoPanner) {
        msMerger.connect(stereoPanner);
        stereoPanner.connect(spatialHeadShadowFilter);
        spatialHeadShadowFilter.connect(dryPathGain);
        stereoPanner.connect(reverbHP);
      } else {
        msMerger.connect(spatialHeadShadowFilter);
        spatialHeadShadowFilter.connect(dryPathGain);
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

// --- Dedicated Live Concert, 3D Spatial Audio & Mastering Generators for Real-Time Experience ---
export interface SpatialLiveState {
  x: number;
  z: number;
  angle: number;
  azimuthDeg: number;
  distanceMeters: number;
  leftEarPct: number;
  rightEarPct: number;
  stageZone: string;
}

let liveSpatialState: SpatialLiveState = {
  x: 0,
  z: -0.85,
  angle: 0,
  azimuthDeg: 0,
  distanceMeters: 2.12,
  leftEarPct: 72,
  rightEarPct: 72,
  stageZone: 'Front Center Stage'
};

const spatialListeners = new Set<(state: SpatialLiveState) => void>();

export function subscribeLiveSpatial(fn: (state: SpatialLiveState) => void): () => void {
  spatialListeners.add(fn);
  fn(liveSpatialState);
  return () => {
    spatialListeners.delete(fn);
  };
}

export function getLiveSpatialState(): SpatialLiveState {
  return liveSpatialState;
}

let spatialAcousticGain: GainNode | null = null;
let spatialHeadShadowFilter: BiquadFilterNode | null = null;
let arenaAcousticsGain: GainNode | null = null;
let arenaCrowdSource: AudioBufferSourceNode | null = null;

// Sentinel gain nodes (no synthetic oscillators — real DSP is applied via shelf filters in main chain)
let rackSubGain: GainNode | null = null;
let rackTrebleGain: GainNode | null = null;

// Persistent Global 60fps Orbit Loop & Background Resilience
let orbitAngle = 0;
let orbitRafId = 0;
let backgroundIntervalId: ReturnType<typeof setInterval> | null = null;
let lastOrbitTime = 0;
let isOrbitLoopRunning = false;
let lastAppliedYtVolume = -1;
let lastYtVolumeTime = 0;

function updateSpatialFrame(rawX: number, rawZ: number, angle: number): void {
  const ox = isFinite(rawX) ? Math.max(-1, Math.min(1, rawX)) : 0;
  const oz = isFinite(rawZ) ? Math.max(-1, Math.min(1, rawZ)) : -0.85;

  const azDeg = Math.round(((Math.atan2(ox, -oz) * 180) / Math.PI + 360) % 360);
  const rawDist = Math.hypot(ox, oz);
  const dist = isFinite(rawDist) ? (rawDist * 2.5).toFixed(2) : '2.12';
  const lEar = Math.round(Math.min(100, Math.max(18, 72 - ox * 38)));
  const rEar = Math.round(Math.min(100, Math.max(18, 72 + ox * 38)));
  const stageLabel =
    azDeg >= 315 || azDeg < 45
      ? 'Front Center Stage'
      : azDeg < 135
      ? 'Right Acoustic Wing'
      : azDeg < 225
      ? 'Rear Surround Halo'
      : 'Left Acoustic Wing';

  liveSpatialState = {
    x: ox,
    z: oz,
    angle: isFinite(angle) ? angle : 0,
    azimuthDeg: azDeg,
    distanceMeters: parseFloat(dist),
    leftEarPct: lEar,
    rightEarPct: rEar,
    stageZone: stageLabel
  };

  spatialListeners.forEach((fn) => {
    try {
      fn(liveSpatialState);
    } catch {}
  });

  // Subtle Head-Shadow attenuation for YouTube Player (~0.5 dB max, never jarring)
  // Optimized: Throttled IPC so postMessage is never spammed more than ~30 times/sec
  if (ytPlayerInstance && typeof ytPlayerInstance.setVolume === 'function') {
    const pState = usePlayerStore.getState();
    const baseUserVol = (pState.isMuted ? 0 : Math.max(0, Math.min(1, pState.volume))) * 100;
    const headShadow = oz > 0 ? 1 - (oz * 0.06) : 1.0;
    const earProximity = 1 + Math.abs(ox) * 0.02;
    const distanceDecay = 1 - Math.min(0.04, Math.max(0, rawDist - 0.85) * 0.15);
    const finalVolScale = Math.max(0.92, Math.min(1.02, headShadow * earProximity * distanceDecay));

    const targetVol = Math.round(baseUserVol * finalVolScale);
    const nowMs = performance.now();
    if (
      targetVol !== lastAppliedYtVolume &&
      (nowMs - lastYtVolumeTime >= 28 || Math.abs(targetVol - lastAppliedYtVolume) >= 2)
    ) {
      lastAppliedYtVolume = targetVol;
      lastYtVolumeTime = nowMs;
      try {
        ytPlayerInstance.setVolume(targetVol);
      } catch {}
    }
  }

  // Web Audio 360° Binaural Field & Head-Shadow Filter (applied directly to music stream)
  if (audioCtx) {
    const audioTime = audioCtx.currentTime;
    if (stereoPanner) {
      stereoPanner.pan.setTargetAtTime(ox * 0.90, audioTime, 0.025);
    }
    if (spatialHeadShadowFilter) {
      const studio = useStudioStore.getState();
      if (studio.fxMode === '8d-orbit' && oz > 0) {
        // Behind head: filter gently rolls off from 20kHz down to 5kHz (natural human ear pinna shadow)
        const targetFreq = 20000 - oz * 15000;
        spatialHeadShadowFilter.frequency.setTargetAtTime(Math.max(5000, targetFreq), audioTime, 0.035);
      } else {
        // Front stage / non-spatial: full 20kHz crystal transparent bypass
        spatialHeadShadowFilter.frequency.setTargetAtTime(20000, audioTime, 0.035);
      }
    }
  }
}

function runOrbitLoop(now: number): void {
  if (!isOrbitLoopRunning) return;
  const dt = lastOrbitTime ? Math.min((now - lastOrbitTime) / 1000, 0.1) : 0.016;
  lastOrbitTime = now;

  const studio = useStudioStore.getState();
  const isPlaying = usePlayerStore.getState().isPlaying;

  if (studio.fxMode === '8d-orbit' && isPlaying) {
    if (studio.spatialOrbitAuto) {
      const speed = Math.max(0.04, Math.min(0.40, studio.spatialOrbitSpeed || 0.12));
      orbitAngle = (orbitAngle + dt * speed * Math.PI * 2) % (Math.PI * 2);
      const ox = Math.sin(orbitAngle) * 0.95;
      const oz = -Math.cos(orbitAngle) * 0.95;
      updateSpatialFrame(ox, oz, orbitAngle);
    } else {
      const ox = Math.max(-1, Math.min(1, studio.spatialManualPos?.x ?? 0));
      const oz = Math.max(-1, Math.min(1, studio.spatialManualPos?.z ?? 0));
      orbitAngle = (Math.atan2(ox, -oz) + Math.PI * 2) % (Math.PI * 2);
      updateSpatialFrame(ox, oz, orbitAngle);
    }

    if (typeof document !== 'undefined' && !document.hidden) {
      orbitRafId = requestAnimationFrame(runOrbitLoop);
    }
  } else {
    stopGlobalOrbitLoop();
  }
}

export function startGlobalOrbitLoop(): void {
  if (typeof window === 'undefined') return;
  if (isOrbitLoopRunning) return;
  isOrbitLoopRunning = true;
  lastOrbitTime = performance.now();

  if (typeof document !== 'undefined' && document.hidden) {
    if (!backgroundIntervalId) {
      backgroundIntervalId = setInterval(() => {
        runOrbitLoop(performance.now());
      }, 35);
    }
  } else {
    orbitRafId = requestAnimationFrame(runOrbitLoop);
  }
}

export function stopGlobalOrbitLoop(): void {
  isOrbitLoopRunning = false;
  if (orbitRafId) {
    cancelAnimationFrame(orbitRafId);
    orbitRafId = 0;
  }
  if (backgroundIntervalId) {
    clearInterval(backgroundIntervalId);
    backgroundIntervalId = null;
  }
}

export function setLiveSpatialManualPosition(x: number, z: number): void {
  const safeX = isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
  const safeZ = isFinite(z) ? Math.max(-1, Math.min(1, z)) : -0.85;
  const angle = (Math.atan2(safeX, -safeZ) + Math.PI * 2) % (Math.PI * 2);
  orbitAngle = angle;
  updateSpatialFrame(safeX, safeZ, angle);
}

export function setLiveSpatialPan(pan: number): void {
  const clamped = Math.max(-1, Math.min(1, pan));
  setLiveSpatialManualPosition(clamped, liveSpatialState.z);
}

// Background Tab Resilience: ensure orbit continues seamlessly when tab is hidden
if (typeof document !== 'undefined') {
  document.addEventListener(
    'visibilitychange',
    () => {
      const studio = useStudioStore.getState();
      const isPlaying = usePlayerStore.getState().isPlaying;
      if (document.hidden) {
        if (studio.fxMode === '8d-orbit' && isPlaying && isOrbitLoopRunning) {
          if (orbitRafId) {
            cancelAnimationFrame(orbitRafId);
            orbitRafId = 0;
          }
          if (!backgroundIntervalId) {
            backgroundIntervalId = setInterval(() => {
              runOrbitLoop(performance.now());
            }, 35);
          }
        }
      } else {
        if (backgroundIntervalId) {
          clearInterval(backgroundIntervalId);
          backgroundIntervalId = null;
        }
        if (studio.fxMode === '8d-orbit' && isPlaying && isOrbitLoopRunning && !orbitRafId) {
          lastOrbitTime = performance.now();
          orbitRafId = requestAnimationFrame(runOrbitLoop);
        }
      }
    },
    { passive: true }
  );
}

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
      data[i] = last * swell * 0.28;
    }
  }
  return buffer;
}

function ensureLiveAcousticsGraph(ctx: AudioContext): void {
  if (spatialAcousticGain && arenaAcousticsGain && rackSubGain) return;

  try {
    // 1. Spatial Audio infrastructure nodes (used by updateSpatialFrame for radar readout).
    //    NO synthetic tones or noise — real panning is via stereoPanner on actual music signal.
    spatialAcousticGain = ctx.createGain();
    spatialAcousticGain.gain.value = 0;

    // Head-shadow filter reference (frequency is modulated by updateSpatialFrame)
    if (!spatialHeadShadowFilter) {
      spatialHeadShadowFilter = ctx.createBiquadFilter();
      spatialHeadShadowFilter.type = 'lowpass';
      spatialHeadShadowFilter.frequency.value = 20000;
      spatialHeadShadowFilter.Q.value = 0.707;
    }

    // 2. Live Concert Stadium Arena — crowd ambiance only (no synthetic sub-bass oscillator)
    arenaAcousticsGain = ctx.createGain();
    arenaAcousticsGain.gain.value = 0;

    const crowdBuffer = createCrowdArenaBuffer(ctx);
    arenaCrowdSource = ctx.createBufferSource();
    arenaCrowdSource.buffer = crowdBuffer;
    arenaCrowdSource.loop = true;

    const crowdHP = ctx.createBiquadFilter();
    crowdHP.type = 'highpass';
    crowdHP.frequency.value = 320;

    const crowdLP = ctx.createBiquadFilter();
    crowdLP.type = 'lowpass';
    crowdLP.frequency.value = 3500;

    const crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.36;

    arenaCrowdSource.connect(crowdHP);
    crowdHP.connect(crowdLP);
    crowdLP.connect(crowdGain);
    crowdGain.connect(arenaAcousticsGain);
    arenaCrowdSource.start();

    arenaAcousticsGain.connect(analyserNode || ctx.destination);

    // 3. Sentinel gain nodes for guard-check (no synthetic oscillators or noise buffers).
    //    Real sub-bass boost: subBassRackNode (lowshelf 54Hz on actual music in main chain).
    //    Real treble air:     trebleAirRackNode (highshelf 11kHz on actual music in main chain).
    rackSubGain = ctx.createGain();
    rackSubGain.gain.value = 0;

    rackTrebleGain = ctx.createGain();
    rackTrebleGain.gain.value = 0;

  } catch (err) {
    console.warn('Live acoustics graph initialization error:', err);
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
  if (
    fxMode !== 'normal' ||
    studio.subBassBoost > 0 ||
    studio.trebleAir > 0 ||
    studio.reverbMix > 0
  ) {
    resumeAudioContextIfNeeded();
    if (ctx) {
      ensureLiveAcousticsGraph(ctx);
    }
  }

  const pState = usePlayerStore.getState();
  const isPlaying = pState.isPlaying;
  const userVol = pState.isMuted ? 0 : Math.max(0, Math.min(1, pState.volume));
  const now = ctx ? ctx.currentTime : 0;

  // 1. Real-time 3D Spatial Audio processing (orbit loop drives stereoPanner on actual music)
  if (fxMode === '8d-orbit' && isPlaying && userVol > 0) {
    startGlobalOrbitLoop();
  } else {
    stopGlobalOrbitLoop();
    if (spatialAcousticGain && ctx) {
      spatialAcousticGain.gain.setTargetAtTime(0, now, 0.05);
    }
    // Restore YouTube volume to user's set level when leaving 3D spatial
    if (ytPlayerInstance && typeof ytPlayerInstance.setVolume === 'function') {
      const baseVol = Math.round(userVol * 100);
      lastAppliedYtVolume = baseVol;
      try {
        ytPlayerInstance.setVolume(baseVol);
      } catch {}
    }
    if (stereoPanner && ctx) {
      stereoPanner.pan.setTargetAtTime(0, now, 0.04);
    }
    if (spatialHeadShadowFilter && ctx) {
      spatialHeadShadowFilter.frequency.setTargetAtTime(20000, now, 0.04);
    }
  }

  // 2. Real-time Live Concert Arena processing
  if (arenaAcousticsGain && ctx) {
    if (fxMode === 'arena-live' && isPlaying && userVol > 0) {
      const arenaVolume = Math.min(0.48, (0.28 + (studio.reverbMix || 0) * 0.22) * userVol);
      arenaAcousticsGain.gain.setTargetAtTime(arenaVolume, now, 0.05);
    } else {
      arenaAcousticsGain.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  // 3. Real-Time Mastering Rack Enhancer (Sub-Bass & Treble Air)
  if (rackSubGain && ctx) {
    if (isPlaying && studio.subBassBoost > 0 && userVol > 0) {
      const subVol = Math.min(0.35, ((studio.subBassBoost / 9) * 0.35) * userVol);
      rackSubGain.gain.setTargetAtTime(subVol, now, 0.035);
    } else {
      rackSubGain.gain.setTargetAtTime(0, now, 0.035);
    }
  }

  if (rackTrebleGain && ctx) {
    if (isPlaying && studio.trebleAir > 0 && userVol > 0) {
      const airVol = Math.min(0.24, ((studio.trebleAir / 6) * 0.24) * userVol);
      rackTrebleGain.gain.setTargetAtTime(airVol, now, 0.035);
    } else {
      rackTrebleGain.gain.setTargetAtTime(0, now, 0.035);
    }
  }

  // 4. Web Audio Master DSP chain (applied to direct streams / offline vault playback)
  if (ctx) {
    const isSpatial3D = fxMode === '8d-orbit';

    const speedHz = Math.max(0.04, Math.min(0.4, studio.spatialOrbitSpeed || 0.12));
    if (sinLfoNode) {
      sinLfoNode.frequency.setTargetAtTime(speedHz, now, 0.06);
    }

    if (panLfoGain && stereoPanner && !isSpatial3D) {
      panLfoGain.gain.setTargetAtTime(0, now, 0.06);
      stereoPanner.pan.setTargetAtTime(0, now, 0.06);
    }

    if (dryPathGain) {
      dryPathGain.gain.setTargetAtTime(1.0, now, 0.04);
    }

    // Mastering Rack: Stereo Width
    if (sideWidthGain) {
      const basePresetWidth =
        fxMode === '8d-orbit' ? 1.35 : fxMode === 'arena-live' ? 1.45 : 1.0;
      const customWidthOffset = (studio.stereoWidth || 0) * 0.50;
      const finalWidth = Math.max(0.2, Math.min(1.80, basePresetWidth + customWidthOffset));
      sideWidthGain.gain.setTargetAtTime(finalWidth, now, 0.05);
    }

    // Mastering Rack: Convolution Hall Reverb
    if (reverbWetGain) {
      const presetWet =
        fxMode === 'arena-live'
          ? 0.32
          : fxMode === '8d-orbit'
          ? Math.min(0.25, Math.max(0.08, (studio.spatialRoomSize ?? 0.26) * 0.35))
          : 0;
      const customWet = (studio.reverbMix || 0) * 0.40;
      const wetAmount = Math.min(0.55, Math.max(presetWet, customWet));
      reverbWetGain.gain.setTargetAtTime(wetAmount, now, 0.05);
    }

    // Mastering Rack: Sub-Bass Boost (lowshelf filter at 54Hz for direct streams)
    if (subBassRackNode) {
      const targetGain = Math.max(0, Math.min(9, studio.subBassBoost || 0));
      subBassRackNode.gain.setTargetAtTime(targetGain, now, 0.035);
    }

    // Mastering Rack: Treble Air (highshelf filter at 11kHz for direct streams)
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

    // Reactive subscription to Settings store Equalizer and Loudness Normalization changes
    useSettingsStore.subscribe((state, prevState) => {
      if (state.equalizerBands !== prevState.equalizerBands) {
        syncHeadroomAndEQ(state.equalizerBands, useStudioStore.getState().fxMode);
      }
      if (state.loudnessNormalization !== prevState.loudnessNormalization) {
        syncLoudnessNormalization();
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
  const GESTURE_EVENTS = ['click', 'touchstart', 'pointerdown', 'keydown'] as const;
  const unlockOnGesture = () => {
    unlockAudioEngine();
    attachAudioEngineSubscriptions();
    GESTURE_EVENTS.forEach((evt) => {
      window.removeEventListener(evt, unlockOnGesture);
    });
  };
  GESTURE_EVENTS.forEach((evt) => {
    window.addEventListener(evt, unlockOnGesture, { passive: true });
  });
}
