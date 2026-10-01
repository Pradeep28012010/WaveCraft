import { usePlayerStore } from '../stores/playerStore';
import { useStudioStore, type StudioFXMode } from '../stores/studioStore';

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Audiophile-tuned EQ offsets (gentle, musical curves paired with automatic headroom compensation)
const FX_EQ_OFFSETS: Record<StudioFXMode, number[]> = {
  normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  '8d-orbit': [1.6, 1.3, 0.5, 0, 0, 0.4, 1.1, 1.7, 2.1, 2.0],
  'slowed-reverb': [2.2, 1.8, 1.0, 0, -0.4, 0, 0.5, 1.0, 1.2, 1.0],
  nightcore: [1.0, 1.0, 0.4, 0, 0.3, 0.8, 1.3, 1.7, 1.9, 2.0],
  'bass-cinema': [4.5, 3.8, 2.0, 0.5, 0, 0, 0.8, 1.4, 1.8, 2.0],
  'vocal-stage': [0.5, 0.4, 0, 0.6, 1.8, 2.4, 2.2, 1.8, 1.4, 1.2],
  'lofi-tape': [2.4, 2.6, 1.6, 0.8, 0.2, -0.4, -1.2, -2.5, -4.2, -6.0],
  'arena-live': [3.0, 2.6, 1.2, -0.5, 0.2, 1.0, 1.8, 2.2, 2.4, 2.2]
};

export interface YouTubePlayerInstance {
  playVideo?: () => void;
  pauseVideo?: () => void;
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
let hrtfPanner: PannerNode | null = null;
let spatialOrbitBusGain: GainNode | null = null;
let subAnchorGain: GainNode | null = null;
let sinLfoNode: OscillatorNode | null = null;
let cosLfoNode: OscillatorNode | null = null;
let elevLfoNode: OscillatorNode | null = null;
let panLfoGain: GainNode | null = null;
let hrtfXGain: GainNode | null = null;
let hrtfYGain: GainNode | null = null;
let hrtfZGain: GainNode | null = null;
let spatialWidthGain: GainNode | null = null;
let reverbWetGain: GainNode | null = null;
let masterLimiter: DynamicsCompressorNode | null = null;
let gainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let lastExciterDrive = -1;

function createAnalogSaturationCurve(driveAmount: number): Float32Array<ArrayBuffer> {
  const samples = 4096;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const k = Math.max(0, Math.min(1, driveAmount)) * 3.2;
  if (k < 0.02) {
    for (let i = 0; i < samples; i++) {
      curve[i] = (i * 2) / (samples - 1) - 1;
    }
    return curve;
  }
  const norm = Math.tanh(1 + k);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * (1 + k)) / norm;
  }
  return curve;
}

export function setHtmlAudioElement(el: HTMLAudioElement | null): void {
  htmlAudioElement = el;
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
 * Generates a high-definition 32-bit float stereo Hall Impulse Response
 * with decorrelated L/R reflections so reverb is lush and phase-pure (zero slapback comb filtering).
 */
function createStudioImpulseResponse(
  ctx: AudioContext,
  durationSec = 2.3,
  decayRate = 2.4
): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Smooth pre-delay fade-in (first 12ms) + exponential hall decay
      const preDelayEnv = Math.min(1, i / (ctx.sampleRate * 0.012));
      const envelope = preDelayEnv * Math.pow(1 - t, decayRate);
      channelData[i] = (Math.random() * 2 - 1) * envelope * 0.4;
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

  let maxPositiveBoostDb = 0;
  eqBands.forEach((db, idx) => {
    const combined = Math.max(-12, Math.min(12, (db || 0) + (offsets[idx] || 0)));
    if (combined > maxPositiveBoostDb) maxPositiveBoostDb = combined;
    if (eqFilters[idx]) {
      eqFilters[idx].gain.setTargetAtTime(combined, now, 0.035);
    }
  });

  if (subBassRackNode) {
    subBassRackNode.gain.setTargetAtTime(studio.subBassBoost || 0, now, 0.035);
  }
  if (trebleAirRackNode) {
    trebleAirRackNode.gain.setTargetAtTime(studio.trebleAir || 0, now, 0.035);
  }

  const effectiveDrive =
    Math.min(1, (studio.harmonicDrive || 0) + (fxMode === 'lofi-tape' ? 0.32 : 0));
  if (exciterWaveShaper && Math.abs(effectiveDrive - lastExciterDrive) > 0.015) {
    lastExciterDrive = effectiveDrive;
    exciterWaveShaper.curve = createAnalogSaturationCurve(effectiveDrive);
  }

  // Extra headroom for wet spatial/reverb bus + custom sub-bass/air boosts so summing never clips
  const wetExtraDb =
    fxMode === 'slowed-reverb' || fxMode === 'arena-live'
      ? 1.5
      : fxMode === '8d-orbit'
      ? 1.0
      : fxMode === 'vocal-stage'
      ? 0.8
      : 0;
  const rackBoostDb = Math.max(0, studio.subBassBoost || 0) * 0.45 + Math.max(0, studio.trebleAir || 0) * 0.25;

  // Attenuate pre-gain proportionally to positive boosts to preserve 100% clean dynamic range
  const totalCompensationDb = maxPositiveBoostDb * 0.52 + wetExtraDb + rackBoostDb;
  const headroomLinear = Math.pow(10, -totalCompensationDb / 20);
  if (preGainNode) {
    preGainNode.gain.setTargetAtTime(Math.max(0.42, Math.min(1.0, headroomLinear)), now, 0.04);
  }
}

export function ensureAudioGraph(audio: HTMLAudioElement, initialBands: number[]): void {
  if (audioCtx || !window.AudioContext) return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctx({ latencyHint: 'playback' });
    sourceNode = audioCtx.createMediaElementSource(audio);
    preGainNode = audioCtx.createGain();
    preGainNode.gain.value = 1.0;

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

    // Studio Brickwall Mastering Limiter (prevents any digital clipping across all FX/EQ modes)
    masterLimiter = audioCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -0.8;
    masterLimiter.knee.value = 4.0;
    masterLimiter.ratio.value = 20.0;
    masterLimiter.attack.value = 0.002;
    masterLimiter.release.value = 0.06;

    // 1. TRUE 360° HRTF 3D SPATIAL ORBIT ENGINE (X/Y/Z Head-Related Transfer Function + Wide Binaural Sweep)
    hrtfPanner = audioCtx.createPanner();
    hrtfPanner.panningModel = 'HRTF';
    hrtfPanner.distanceModel = 'inverse';
    hrtfPanner.refDistance = 1.2;
    hrtfPanner.maxDistance = 10;
    hrtfPanner.rolloffFactor = 0.85;

    spatialOrbitBusGain = audioCtx.createGain();
    spatialOrbitBusGain.gain.value = 0;

    // Quadrature Sine (Left <-> Right X-axis) & Cosine (Front <-> Back Z-axis) Oscillators
    const orbitFreq = useStudioStore.getState().spatialOrbitSpeed || 0.145;
    const sinLfo = audioCtx.createOscillator();
    sinLfo.type = 'sine';
    sinLfo.frequency.value = orbitFreq;
    sinLfoNode = sinLfo;

    // Exact 90°-shifted Cosine PeriodicWave for circular Z-axis (Front-to-Back depth around head)
    const cosWave = audioCtx.createPeriodicWave(
      new Float32Array([0, 1]),
      new Float32Array([0, 0]),
      { disableNormalization: true }
    );
    const cosLfo = audioCtx.createOscillator();
    cosLfo.setPeriodicWave(cosWave);
    cosLfo.frequency.value = orbitFreq;
    cosLfoNode = cosLfo;

    // 2nd-Harmonic Vertical Halo LFO (Y-axis elevation)
    const elevLfo = audioCtx.createOscillator();
    elevLfo.type = 'sine';
    elevLfo.frequency.value = orbitFreq * 2;
    elevLfoNode = elevLfo;

    panLfoGain = audioCtx.createGain();
    panLfoGain.gain.value = 0; // 0.90 in 3D Spatial Audio for unmistakable Left-to-Right ear travel

    hrtfXGain = audioCtx.createGain();
    hrtfXGain.gain.value = 2.3; // ±2.3m Left <-> Right 3D HRTF orbit radius

    hrtfZGain = audioCtx.createGain();
    hrtfZGain.gain.value = 1.85; // ±1.85m Front <-> Behind-Head 3D HRTF depth radius

    hrtfYGain = audioCtx.createGain();
    hrtfYGain.gain.value = 0.45; // ±0.45m vertical halo elevation

    sinLfo.connect(panLfoGain);
    panLfoGain.connect(stereoPanner.pan);

    if (hrtfPanner.positionX && hrtfPanner.positionZ && hrtfPanner.positionY) {
      sinLfo.connect(hrtfXGain);
      hrtfXGain.connect(hrtfPanner.positionX);

      cosLfo.connect(hrtfZGain);
      hrtfZGain.connect(hrtfPanner.positionZ);

      elevLfo.connect(hrtfYGain);
      hrtfYGain.connect(hrtfPanner.positionY);
    }

    const startTime = audioCtx.currentTime;
    sinLfo.start(startTime);
    cosLfo.start(startTime);
    elevLfo.start(startTime);

    // Dedicated Center Sub-Bass Crossover Anchor (< 95Hz stays warm & punchy in both ears while mids/highs orbit 360°)
    const subAnchorLP = audioCtx.createBiquadFilter();
    subAnchorLP.type = 'lowpass';
    subAnchorLP.frequency.value = 95;
    subAnchorLP.Q.value = 0.707;

    subAnchorGain = audioCtx.createGain();
    subAnchorGain.gain.value = 0;
    subAnchorLP.connect(subAnchorGain);

    // 2. Binaural Micro-Haas 3D Stereo Widener (keeps lows centered, widens stereo field above 200Hz)
    const widenerHP = audioCtx.createBiquadFilter();
    widenerHP.type = 'highpass';
    widenerHP.frequency.value = 200;
    widenerHP.Q.value = 0.707;

    const splitter = audioCtx.createChannelSplitter(2);
    const merger = audioCtx.createChannelMerger(2);
    const haasDelayL = audioCtx.createDelay(0.05);
    const haasDelayR = audioCtx.createDelay(0.05);
    haasDelayL.delayTime.value = 0.0006; // 0.6ms L
    haasDelayR.delayTime.value = 0.011; // 11ms R decorrelation for expansive 3D externalization

    spatialWidthGain = audioCtx.createGain();
    spatialWidthGain.gain.value = 0;

    widenerHP.connect(splitter);
    splitter.connect(haasDelayL, 0);
    splitter.connect(haasDelayR, 1);
    haasDelayL.connect(merger, 0, 1);
    haasDelayR.connect(merger, 0, 0);
    merger.connect(spatialWidthGain);

    // 3. True Stereo Convolution Hall Reverb (high-passed at 210Hz, airy up to 10.5kHz — zero mud!)
    const reverbHP = audioCtx.createBiquadFilter();
    reverbHP.type = 'highpass';
    reverbHP.frequency.value = 210;
    reverbHP.Q.value = 0.707;

    const reverbAirLP = audioCtx.createBiquadFilter();
    reverbAirLP.type = 'lowpass';
    reverbAirLP.frequency.value = 10500;
    reverbAirLP.Q.value = 0.707;

    const convolver = audioCtx.createConvolver();
    convolver.buffer = createStudioImpulseResponse(audioCtx, 2.3, 2.4);

    reverbWetGain = audioCtx.createGain();
    reverbWetGain.gain.value = 0;

    // 4. 10-Band Studio Graphic Equalizer + Mastering Rack Filters (Sub-Bass Punch, Treble Air, Analog Tube Exciter)
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

    // 5. REAL-TIME VOCAL REMOVER (KARAOKE) & ACAPELLA STEM ISOLATOR ENGINE
    const stemBusNode = audioCtx.createGain();
    stemBusNode.gain.value = 1.0;

    normalStemGain = audioCtx.createGain();
    normalStemGain.gain.value = 1.0;
    prev.connect(normalStemGain);
    normalStemGain.connect(stemBusNode);

    // 5A. Karaoke Mode: Bass-Preserving Mid/Side Phase Canceller (L - R in 155Hz–6000Hz + intact <155Hz Sub-Bass & >6kHz Air)
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

    // Stereoize the cancelled side signal via a 0.9ms micro-decorrelation delay on R so instrumental feels wide
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

    // 5B. Acapella Mode: Lead Vocal Formant Spotlight (210Hz–4400Hz Bandpass + 1.6kHz Presence Lift)
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
    acapellaFormant.gain.value = 4.2;

    prev.connect(acapellaHP);
    acapellaHP.connect(acapellaLP);
    acapellaLP.connect(acapellaFormant);
    acapellaFormant.connect(acapellaStemGain);
    acapellaStemGain.connect(stemBusNode);

    // Path A: Primary Stereo Panner Path -> dryPathGain -> masterLimiter
    stemBusNode.connect(stereoPanner);
    stereoPanner.connect(dryPathGain);
    dryPathGain.connect(masterLimiter);

    // Path B: True 3D HRTF 360° Orbit Bus -> spatialOrbitBusGain -> masterLimiter
    stemBusNode.connect(hrtfPanner);
    hrtfPanner.connect(spatialOrbitBusGain);
    spatialOrbitBusGain.connect(masterLimiter);

    // Path C: Center Sub-Bass Foundation Anchor (< 95Hz) -> masterLimiter
    stemBusNode.connect(subAnchorLP);
    subAnchorGain.connect(masterLimiter);

    // Path D: 3D Binaural Stereo Widener -> masterLimiter
    stemBusNode.connect(widenerHP);
    spatialWidthGain.connect(masterLimiter);

    // Path E: 3D Acoustic Concert Dome Reverb -> masterLimiter
    stereoPanner.connect(reverbHP);
    reverbHP.connect(reverbAirLP);
    reverbAirLP.connect(convolver);
    convolver.connect(reverbWetGain);
    reverbWetGain.connect(masterLimiter);

    // Final Mastering Output Chain: masterLimiter -> gainNode -> analyserNode -> destination
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
    spatialWidthGain &&
    dryPathGain &&
    spatialOrbitBusGain &&
    subAnchorGain
  ) {
    const now = audioCtx.currentTime;
    const isSpatial3D = fxMode === '8d-orbit';

    // 0. Real-Time Vocal Stem Mode Crossfader (Normal vs Karaoke Instrumental vs Acapella Vocal)
    if (normalStemGain && karaokeStemGain && acapellaStemGain) {
      const vMode = studio.vocalMode || 'normal';
      normalStemGain.gain.setTargetAtTime(vMode === 'normal' ? 1.0 : 0.0, now, 0.05);
      karaokeStemGain.gain.setTargetAtTime(vMode === 'karaoke' ? 1.05 : 0.0, now, 0.05);
      acapellaStemGain.gain.setTargetAtTime(vMode === 'acapella' ? 1.1 : 0.0, now, 0.05);
    }

    // Update 360° LFO Orbit Speed in real time
    const speedHz = Math.max(0.04, Math.min(0.4, studio.spatialOrbitSpeed || 0.145));
    if (sinLfoNode && cosLfoNode && elevLfoNode) {
      sinLfoNode.frequency.setTargetAtTime(speedHz, now, 0.06);
      cosLfoNode.frequency.setTargetAtTime(speedHz, now, 0.06);
      elevLfoNode.frequency.setTargetAtTime(speedHz * 2, now, 0.06);
    }

    // 1. Deep 360° Binaural Pan Sweep + True 3D HRTF Orbit Bus (Auto-Orbit vs Manual 3D Joypad)
    if (isSpatial3D) {
      if (studio.spatialOrbitAuto) {
        panLfoGain.gain.setTargetAtTime(0.9, now, 0.08);
        if (hrtfXGain && hrtfZGain && hrtfYGain) {
          hrtfXGain.gain.setTargetAtTime(2.3, now, 0.08);
          hrtfZGain.gain.setTargetAtTime(1.85, now, 0.08);
          hrtfYGain.gain.setTargetAtTime(0.45, now, 0.08);
        }
        stereoPanner.pan.setTargetAtTime(0, now, 0.08);
        if (hrtfPanner?.positionX && hrtfPanner?.positionZ) {
          hrtfPanner.positionX.setTargetAtTime(0, now, 0.08);
          hrtfPanner.positionZ.setTargetAtTime(0, now, 0.08);
        }
      } else {
        // Manual 3D Position Radar Pad Mode
        panLfoGain.gain.setTargetAtTime(0, now, 0.05);
        if (hrtfXGain && hrtfZGain && hrtfYGain) {
          hrtfXGain.gain.setTargetAtTime(0, now, 0.05);
          hrtfZGain.gain.setTargetAtTime(0, now, 0.05);
          hrtfYGain.gain.setTargetAtTime(0.15, now, 0.05);
        }
        const manualX = Math.max(-1, Math.min(1, studio.spatialManualPos?.x ?? 0));
        const manualZ = Math.max(-1, Math.min(1, studio.spatialManualPos?.z ?? -0.5));
        stereoPanner.pan.setTargetAtTime(manualX * 0.92, now, 0.04);
        if (hrtfPanner?.positionX && hrtfPanner?.positionZ) {
          hrtfPanner.positionX.setTargetAtTime(manualX * 2.6, now, 0.04);
          hrtfPanner.positionZ.setTargetAtTime(manualZ * 2.2, now, 0.04);
        }
      }
    } else {
      panLfoGain.gain.setTargetAtTime(0, now, 0.08);
      stereoPanner.pan.setTargetAtTime(0, now, 0.08);
    }

    // Balance between sweeping stereo path + true 3D HRTF pinna orbit + centered <95Hz sub-bass anchor
    dryPathGain.gain.setTargetAtTime(isSpatial3D ? 0.78 : 1.0, now, 0.08);
    spatialOrbitBusGain.gain.setTargetAtTime(isSpatial3D ? 0.95 : 0, now, 0.08);
    subAnchorGain.gain.setTargetAtTime(isSpatial3D ? 0.45 : 0, now, 0.08);

    const roomAmt = Math.max(0, Math.min(0.65, studio.spatialRoomSize ?? 0.26));

    // 2. Binaural Haas 3D Stereo Widener (Preset + Custom Mastering Rack Stereo Width)
    const presetWidth =
      fxMode === '8d-orbit'
        ? Math.min(0.45, 0.2 + roomAmt * 0.5)
        : fxMode === 'arena-live'
        ? 0.36
        : fxMode === 'vocal-stage'
        ? 0.16
        : fxMode === 'bass-cinema'
        ? 0.14
        : 0;
    const customWidth = (studio.stereoWidth || 0) * 0.48;
    const widthAmount = Math.min(0.55, Math.max(presetWidth, customWidth));
    spatialWidthGain.gain.setTargetAtTime(widthAmount, now, 0.08);

    // 3. 3D Acoustic Concert Dome Reverb (Preset + Custom Mastering Rack Reverb Mix)
    const presetWet =
      fxMode === 'slowed-reverb'
        ? 0.34
        : fxMode === 'arena-live'
        ? 0.38
        : fxMode === '8d-orbit'
        ? roomAmt
        : fxMode === 'vocal-stage'
        ? 0.15
        : fxMode === 'lofi-tape'
        ? 0.14
        : 0;
    const customWet = studio.reverbMix || 0;
    const wetAmount = Math.min(0.75, Math.max(presetWet, customWet));
    reverbWetGain.gain.setTargetAtTime(wetAmount, now, 0.08);
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
