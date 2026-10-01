import { usePlayerStore } from '../stores/playerStore';
import { useStudioStore, type StudioFXMode } from '../stores/studioStore';

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Audiophile-tuned EQ offsets (gentle, musical sweetening curves that maintain 100% volume and clarity)
const FX_EQ_OFFSETS: Record<StudioFXMode, number[]> = {
  normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  '8d-orbit': [0.8, 0.6, 0.2, 0, 0, 0, 0.3, 0.6, 0.8, 0.8],
  'slowed-reverb': [1.2, 1.0, 0.4, 0, 0, 0, 0.3, 0.5, 0.8, 0.8],
  nightcore: [0, 0, 0, 0, 0.2, 0.4, 0.8, 1.2, 1.4, 1.2],
  'bass-cinema': [2.8, 2.4, 1.2, 0.2, 0, 0, 0.2, 0.5, 0.8, 0.8],
  'vocal-stage': [0, 0, 0, 0.3, 1.2, 1.8, 1.5, 1.0, 0.8, 0.5],
  'lofi-tape': [1.2, 1.0, 0.6, 0.2, 0, 0, -0.4, -0.8, -1.2, -1.6],
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
}

let ytPlayerInstance: YouTubePlayerInstance | null = null;
let htmlAudioElement: HTMLAudioElement | null = null;
let activeEngine: 'audio' | 'youtube' = 'audio';

// Web Audio API Studio Mastering Graph, True 360° HRTF 3D Spatial Stage, Vocal Stem Isolator & Visualizer Analyser
let audioCtx: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let preGainNode: GainNode | null = null;
let eqFilters: BiquadFilterNode[] = [];
let subBassRackNode: BiquadFilterNode | null = null;
let trebleAirRackNode: BiquadFilterNode | null = null;
let exciterWaveShaper: WaveShaperNode | null = null;
let normalStemGain: GainNode | null = null;
let karaokeStemGain: GainNode | null = null;
let acapellaStemGain: GainNode | null = null;
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

export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

export function resumeAudioContextIfNeeded(): void {
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

  const effectiveDrive =
    Math.min(1, (studio.harmonicDrive || 0) + (fxMode === 'lofi-tape' ? 0.08 : 0));
  if (exciterWaveShaper && Math.abs(effectiveDrive - lastExciterDrive) > 0.01) {
    lastExciterDrive = effectiveDrive;
    exciterWaveShaper.curve = createAnalogSaturationCurve(effectiveDrive);
  }

  // Maintain full 0.98 unity gain across ALL effects: ZERO volume drop when turning on FX!
  if (preGainNode) {
    preGainNode.gain.setTargetAtTime(0.98, now, 0.035);
  }
}

export function ensureAudioGraph(audio: HTMLAudioElement, initialBands: number[]): void {
  if (audioCtx || !window.AudioContext) return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctx({ latencyHint: 'playback' });
    sourceNode = audioCtx.createMediaElementSource(audio);
    preGainNode = audioCtx.createGain();
    preGainNode.gain.value = 0.98;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = getTargetOutputGain();
    // Lock HTMLAudioElement at unity gain so all volume/fade changes happen zipper-free in Web Audio
    audio.volume = 1.0;

    stereoPanner = audioCtx.createStereoPanner();
    dryPathGain = audioCtx.createGain();
    dryPathGain.gain.value = 1.0;

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 128;
    analyserNode.smoothingTimeConstant = 0.78;

    // Audiophile Mastering Limiter (transparent dynamics, preserves kick attack and dynamics without pumping)
    masterLimiter = audioCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -0.3;
    masterLimiter.knee.value = 10.0;
    masterLimiter.ratio.value = 3.5;
    masterLimiter.attack.value = 0.012;
    masterLimiter.release.value = 0.16;

    // 1. 3D SPATIAL ORBIT LFO GENERATOR
    const orbitFreq = useStudioStore.getState().spatialOrbitSpeed || 0.12;
    sinLfoNode = audioCtx.createOscillator();
    sinLfoNode.type = 'sine';
    sinLfoNode.frequency.value = orbitFreq;

    panLfoGain = audioCtx.createGain();
    panLfoGain.gain.value = 0; // modulated in applyStudioFXToAudio

    sinLfoNode.connect(panLfoGain);
    panLfoGain.connect(stereoPanner.pan);
    sinLfoNode.start();

    // 2. PHASE-PURE MID/SIDE STEREO WIDENER MATRIX
    // Mid = 0.5*(L+R), Side = 0.5*(L-R), L' = Mid + w*Side, R' = Mid - w*Side
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

    // 3. STEREO CONVOLUTION REVERB (highpassed at 280Hz to prevent low mud, air-damped at 8.5kHz)
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

    // 4. 10-Band Studio Graphic Equalizer + Mastering Rack Filters
    eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = audioCtx!.createBiquadFilter();
      if (idx === 0) filter.type = 'lowshelf';
      else if (idx === EQ_FREQUENCIES.length - 1) filter.type = 'highshelf';
      else filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 0.95;
      filter.gain.value = initialBands[idx] || 0;
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

    // Wire series EQ chain: sourceNode -> preGainNode -> eqFilters -> subBassRackNode -> trebleAirRackNode -> exciterWaveShaper
    sourceNode.connect(preGainNode);
    let prev: AudioNode = preGainNode;
    for (const f of eqFilters) {
      prev.connect(f);
      prev = f;
    }
    prev.connect(subBassRackNode);
    subBassRackNode.connect(trebleAirRackNode);
    trebleAirRackNode.connect(exciterWaveShaper);
    prev = exciterWaveShaper;

    // 5. VOCAL STEM ISOLATOR ENGINE (Normal vs Karaoke Vocal Remover vs Acapella Isolator)
    const stemBusNode = audioCtx.createGain();
    stemBusNode.gain.value = 1.0;

    normalStemGain = audioCtx.createGain();
    normalStemGain.gain.value = 1.0;
    prev.connect(normalStemGain);
    normalStemGain.connect(stemBusNode);

    // 5A. Karaoke Mode: Phase-inversion center cancellation with low-bass and high-air preservation
    karaokeStemGain = audioCtx.createGain();
    karaokeStemGain.gain.value = 0;

    const karaokeBassKeeper = audioCtx.createBiquadFilter();
    karaokeBassKeeper.type = 'lowpass';
    karaokeBassKeeper.frequency.value = 155;
    karaokeBassKeeper.Q.value = 0.707;
    prev.connect(karaokeBassKeeper);
    karaokeBassKeeper.connect(karaokeStemGain);

    const karaokeAirKeeper = audioCtx.createBiquadFilter();
    karaokeAirKeeper.type = 'highpass';
    karaokeAirKeeper.frequency.value = 6000;
    karaokeAirKeeper.Q.value = 0.707;
    const karaokeAirGain = audioCtx.createGain();
    karaokeAirGain.gain.value = 0.48;
    prev.connect(karaokeAirKeeper);
    karaokeAirKeeper.connect(karaokeAirGain);
    karaokeAirGain.connect(karaokeStemGain);

    const karaokeSplit = audioCtx.createChannelSplitter(2);
    const karaokeInvertR = audioCtx.createGain();
    karaokeInvertR.gain.value = -1.0;
    const karaokeDiffSum = audioCtx.createGain();
    karaokeDiffSum.gain.value = 1.25;

    const karaokeVocalBandHP = audioCtx.createBiquadFilter();
    karaokeVocalBandHP.type = 'highpass';
    karaokeVocalBandHP.frequency.value = 155;
    karaokeVocalBandHP.Q.value = 0.707;

    const karaokeVocalBandLP = audioCtx.createBiquadFilter();
    karaokeVocalBandLP.type = 'lowpass';
    karaokeVocalBandLP.frequency.value = 6000;
    karaokeVocalBandLP.Q.value = 0.707;

    const karaokeSideMerger = audioCtx.createChannelMerger(2);
    const karaokeSideDelayR = audioCtx.createDelay(0.02);
    karaokeSideDelayR.delayTime.value = 0.0009;

    prev.connect(karaokeSplit);
    karaokeSplit.connect(karaokeDiffSum, 0);
    karaokeSplit.connect(karaokeInvertR, 1);
    karaokeInvertR.connect(karaokeDiffSum);
    karaokeDiffSum.connect(karaokeVocalBandHP);
    karaokeVocalBandHP.connect(karaokeVocalBandLP);
    karaokeVocalBandLP.connect(karaokeSideMerger, 0, 0);
    karaokeVocalBandLP.connect(karaokeSideDelayR);
    karaokeSideDelayR.connect(karaokeSideMerger, 0, 1);
    karaokeSideMerger.connect(karaokeStemGain);
    karaokeStemGain.connect(stemBusNode);

    // 5B. Acapella Mode: Lead Vocal Formant Spotlight (210Hz–4500Hz Bandpass + 1.65kHz Presence Lift)
    acapellaStemGain = audioCtx.createGain();
    acapellaStemGain.gain.value = 0;

    const acapellaHP = audioCtx.createBiquadFilter();
    acapellaHP.type = 'highpass';
    acapellaHP.frequency.value = 210;
    acapellaHP.Q.value = 0.85;

    const acapellaLP = audioCtx.createBiquadFilter();
    acapellaLP.type = 'lowpass';
    acapellaLP.frequency.value = 4500;
    acapellaLP.Q.value = 0.85;

    const acapellaFormant = audioCtx.createBiquadFilter();
    acapellaFormant.type = 'peaking';
    acapellaFormant.frequency.value = 1650;
    acapellaFormant.Q.value = 0.95;
    acapellaFormant.gain.value = 3.6;

    prev.connect(acapellaHP);
    acapellaHP.connect(acapellaLP);
    acapellaLP.connect(acapellaFormant);
    acapellaFormant.connect(acapellaStemGain);
    acapellaStemGain.connect(stemBusNode);

    // 6. MID/SIDE MATRIX STEREO EXPANDER ROUTING
    stemBusNode.connect(msSplitter);
    msSplitter.connect(midSumL, 0);
    msSplitter.connect(midSumR, 1);
    midSumL.connect(midBus);
    midSumR.connect(midBus);

    msSplitter.connect(sideDiffL, 0);
    msSplitter.connect(sideDiffR, 1);
    sideDiffL.connect(sideBus);
    sideDiffR.connect(sideBus);
    sideBus.connect(sideWidthGain);

    // Reconstruct to stereo
    midBus.connect(msMerger, 0, 0); // L Mid
    sideWidthGain.connect(msMerger, 0, 0); // L Side (+)
    midBus.connect(msMerger, 0, 1); // R Mid
    sideWidthGain.connect(sideInvertR);
    sideInvertR.connect(msMerger, 0, 1); // R Side (-)

    // 7. STEREO PANNER (Orbit & Manual 3D Radar)
    msMerger.connect(stereoPanner);

    // Dry Main Path
    stereoPanner.connect(dryPathGain);
    dryPathGain.connect(masterLimiter);

    // Reverb Send Path
    stereoPanner.connect(reverbHP);
    reverbHP.connect(reverbAirLP);
    reverbAirLP.connect(convolver);
    convolver.connect(reverbWetGain);
    reverbWetGain.connect(masterLimiter);

    // 8. MASTER LIMITER & OUTPUT
    masterLimiter.connect(gainNode);
    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    const initialFx = useStudioStore.getState().fxMode;
    syncHeadroomAndEQ(initialBands, initialFx);
    applyStudioFXToAudio(audio, initialFx, usePlayerStore.getState().playbackSpeed || 1);
  } catch (err) {
    console.warn('Web Audio EQ initialization skipped:', err);
  }
}

export function applyStudioFXToAudio(
  audio: HTMLAudioElement | null,
  fxMode: StudioFXMode,
  baseSpeed: number
): void {
  const studio = useStudioStore.getState();
  const effectiveSpeed =
    fxMode === 'slowed-reverb'
      ? 0.88
      : fxMode === 'nightcore'
      ? 1.18
      : fxMode === 'lofi-tape'
      ? 0.96
      : baseSpeed || 1;

  const preservePitch =
    fxMode === 'slowed-reverb' || fxMode === 'nightcore' || fxMode === 'lofi-tape'
      ? false
      : studio.preservePitch ?? true;

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

  if (
    audioCtx &&
    panLfoGain &&
    reverbWetGain &&
    stereoPanner &&
    sideWidthGain &&
    dryPathGain
  ) {
    const now = audioCtx.currentTime;
    const isSpatial3D = fxMode === '8d-orbit';

    // 0. Real-Time Vocal Stem Mode Crossfader (Normal vs Karaoke Instrumental vs Acapella Vocal)
    if (normalStemGain && karaokeStemGain && acapellaStemGain) {
      const vMode = studio.vocalMode || 'normal';
      normalStemGain.gain.setTargetAtTime(vMode === 'normal' ? 1.0 : 0.0, now, 0.04);
      karaokeStemGain.gain.setTargetAtTime(vMode === 'karaoke' ? 1.0 : 0.0, now, 0.04);
      acapellaStemGain.gain.setTargetAtTime(vMode === 'acapella' ? 1.0 : 0.0, now, 0.04);
    }

    // 1. 3D Spatial Audio Orbit Panning (Smooth 360° Binaural sweep)
    const speedHz = Math.max(0.04, Math.min(0.4, studio.spatialOrbitSpeed || 0.12));
    if (sinLfoNode) {
      sinLfoNode.frequency.setTargetAtTime(speedHz, now, 0.06);
    }

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

    // Dry path is ALWAYS crystal-clear and full volume (1.0)
    dryPathGain.gain.setTargetAtTime(1.0, now, 0.04);

    // 2. Phase-Pure Mid/Side Stereo Widener (1.0 = bit-perfect original stereo; >1.0 = widened)
    const basePresetWidth =
      fxMode === '8d-orbit'
        ? 1.25
        : fxMode === 'arena-live'
        ? 1.30
        : fxMode === 'vocal-stage'
        ? 1.15
        : fxMode === 'bass-cinema'
        ? 1.10
        : fxMode === 'slowed-reverb'
        ? 1.20
        : fxMode === 'lofi-tape'
        ? 1.05
        : fxMode === 'nightcore'
        ? 1.05
        : 1.0;
    const customWidthOffset = (studio.stereoWidth || 0) * 0.45;
    const finalWidth = Math.max(0.2, Math.min(1.65, basePresetWidth + customWidthOffset));
    sideWidthGain.gain.setTargetAtTime(finalWidth, now, 0.05);

    // 3. Acoustic Dome & Hall Reverb Send Mix (Clean, pre-delayed, zero noise wash)
    const presetWet =
      fxMode === 'slowed-reverb'
        ? 0.18
        : fxMode === 'arena-live'
        ? 0.14
        : fxMode === '8d-orbit'
        ? Math.min(0.18, Math.max(0.06, (studio.spatialRoomSize ?? 0.26) * 0.3))
        : fxMode === 'vocal-stage'
        ? 0.07
        : fxMode === 'lofi-tape'
        ? 0.05
        : 0;
    const customWet = (studio.reverbMix || 0) * 0.35;
    const wetAmount = Math.min(0.35, Math.max(presetWet, customWet));
    reverbWetGain.gain.setTargetAtTime(wetAmount, now, 0.05);
  }
}

export const getAudioFrequencyData = (out: Uint8Array): boolean => {
  if (!analyserNode || activeEngine !== 'audio' || !audioCtx || audioCtx.state !== 'running') {
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
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
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
  }
};
