import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStudioStore, type StudioFXMode } from '../../stores/studioStore';
import { searchTracks } from '../../services/youtube';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import { getOfflineAudioObjectUrl, isTrackOffline } from '../../services/offlineVault';
import type { Track } from '../../types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
    ytPlayerReady: boolean;
  }
}

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Audiophile-tuned EQ offsets (gentle, musical curves paired with automatic headroom compensation)
const FX_EQ_OFFSETS: Record<StudioFXMode, number[]> = {
  normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  '8d-orbit': [1.6, 1.3, 0.5, 0, 0, 0.4, 1.1, 1.7, 2.1, 2.0],
  'slowed-reverb': [2.2, 1.8, 1.0, 0, -0.4, 0, 0.5, 1.0, 1.2, 1.0],
  nightcore: [1.0, 1.0, 0.4, 0, 0.3, 0.8, 1.3, 1.7, 1.9, 2.0],
  'bass-cinema': [4.5, 3.8, 2.0, 0.5, 0, 0, 0.8, 1.4, 1.8, 2.0],
  'vocal-stage': [0.5, 0.4, 0, 0.6, 1.8, 2.4, 2.2, 1.8, 1.4, 1.2]
};

let ytPlayerInstance: any = null;
let htmlAudioElement: HTMLAudioElement | null = null;
let preloadAudioElement: HTMLAudioElement | null = null;
let activeEngine: 'audio' | 'youtube' = 'audio';

// Web Audio API Studio Mastering Graph, Lossless 3D Spatial Stage & Real-time Visualizer Analyser
let audioCtx: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let preGainNode: GainNode | null = null;
let eqFilters: BiquadFilterNode[] = [];
let stereoPanner: StereoPannerNode | null = null;
let panLfoGain: GainNode | null = null;
let spatialWidthGain: GainNode | null = null;
let reverbWetGain: GainNode | null = null;
let masterLimiter: DynamicsCompressorNode | null = null;
let gainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;

/**
 * Generates a high-definition 32-bit float stereo Hall Impulse Response
 * with decorrelated L/R reflections so reverb is lush and phase-pure (zero slapback comb filtering).
 */
function createStudioImpulseResponse(ctx: AudioContext, durationSec = 2.1, decayRate = 2.6): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Smooth pre-delay fade-in (first 12ms) + exponential hall decay
      const preDelayEnv = Math.min(1, i / (ctx.sampleRate * 0.012));
      const envelope = preDelayEnv * Math.pow(1 - t, decayRate);
      channelData[i] = (Math.random() * 2 - 1) * envelope * 0.38;
    }
  }
  return impulse;
}

function getTargetOutputGain(): number {
  const pState = usePlayerStore.getState();
  const userVol = pState.isMuted ? 0 : Math.max(0, Math.min(1, pState.volume));
  const studioState = useStudioStore.getState();
  const sleepScale =
    studioState.sleepActive && !studioState.sleepEndAtTrack && studioState.sleepSeconds <= 10
      ? Math.max(0, studioState.sleepSeconds / 10)
      : 1;
  return userVol * sleepScale;
}

function syncHeadroomAndEQ(eqBands: number[], fxMode: StudioFXMode) {
  if (!audioCtx || eqFilters.length === 0) return;
  const now = audioCtx.currentTime;
  const offsets = FX_EQ_OFFSETS[fxMode] || FX_EQ_OFFSETS.normal;

  let maxPositiveBoostDb = 0;
  eqBands.forEach((db, idx) => {
    const combined = Math.max(-12, Math.min(12, (db || 0) + (offsets[idx] || 0)));
    if (combined > maxPositiveBoostDb) maxPositiveBoostDb = combined;
    if (eqFilters[idx]) {
      eqFilters[idx].gain.setTargetAtTime(combined, now, 0.035);
    }
  });

  // Extra headroom for wet spatial/reverb bus so summing never clips
  const wetExtraDb =
    fxMode === 'slowed-reverb'
      ? 1.5
      : fxMode === '8d-orbit'
      ? 1.2
      : fxMode === 'vocal-stage'
      ? 0.8
      : 0;

  // Attenuate pre-gain proportionally to positive boosts to preserve 100% clean dynamic range
  const totalCompensationDb = maxPositiveBoostDb * 0.55 + wetExtraDb;
  const headroomLinear = Math.pow(10, -totalCompensationDb / 20);
  if (preGainNode) {
    preGainNode.gain.setTargetAtTime(Math.max(0.45, Math.min(1.0, headroomLinear)), now, 0.04);
  }
}

function ensureAudioGraph(audio: HTMLAudioElement, initialBands: number[]) {
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

    // 1. Lossless 3D Spatial Binaural Orbit LFO (0.11 Hz smooth 360° rotation without collapsing stereo)
    const panLfo = audioCtx.createOscillator();
    panLfo.type = 'sine';
    panLfo.frequency.value = 0.11;
    panLfoGain = audioCtx.createGain();
    panLfoGain.gain.value = 0; // 0 by default, 0.42 in 3D Spatial Audio so neither ear ever drops out
    panLfo.connect(panLfoGain);
    panLfoGain.connect(stereoPanner.pan);
    panLfo.start();

    // 2. Binaural Micro-Haas 3D Stereo Widener (keeps lows centered, widens stereo field above 220Hz)
    const widenerHP = audioCtx.createBiquadFilter();
    widenerHP.type = 'highpass';
    widenerHP.frequency.value = 220;
    widenerHP.Q.value = 0.707;

    const splitter = audioCtx.createChannelSplitter(2);
    const merger = audioCtx.createChannelMerger(2);
    const haasDelayL = audioCtx.createDelay(0.05);
    const haasDelayR = audioCtx.createDelay(0.05);
    haasDelayL.delayTime.value = 0.0005; // 0.5ms L
    haasDelayR.delayTime.value = 0.0075; // 7.5ms R decorrelation for wide 3D stage

    spatialWidthGain = audioCtx.createGain();
    spatialWidthGain.gain.value = 0;

    widenerHP.connect(splitter);
    // Cross-feed inverted/decorrelated high-passed stereo difference for wide 3D stage
    splitter.connect(haasDelayL, 0);
    splitter.connect(haasDelayR, 1);
    haasDelayL.connect(merger, 0, 1);
    haasDelayR.connect(merger, 0, 0);
    merger.connect(spatialWidthGain);

    // 3. True Stereo Convolution Hall Reverb (high-passed at 220Hz, airy up to 9.5kHz — zero mud!)
    const reverbHP = audioCtx.createBiquadFilter();
    reverbHP.type = 'highpass';
    reverbHP.frequency.value = 220;
    reverbHP.Q.value = 0.707;

    const reverbAirLP = audioCtx.createBiquadFilter();
    reverbAirLP.type = 'lowpass';
    reverbAirLP.frequency.value = 9500;
    reverbAirLP.Q.value = 0.707;

    const convolver = audioCtx.createConvolver();
    convolver.buffer = createStudioImpulseResponse(audioCtx, 2.1, 2.6);

    reverbWetGain = audioCtx.createGain();
    reverbWetGain.gain.value = 0;

    // 4. 10-Band Studio Graphic Equalizer (musical Q = 0.95 to avoid phase ringing)
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

    // Wire series EQ chain: sourceNode -> preGainNode -> eqFilters...
    sourceNode.connect(preGainNode);
    let prev: AudioNode = preGainNode;
    for (const f of eqFilters) {
      prev.connect(f);
      prev = f;
    }

    // Dry high-resolution path -> stereoPanner -> masterLimiter
    prev.connect(stereoPanner);
    stereoPanner.connect(masterLimiter);

    // 3D Binaural Stereo Widener path -> masterLimiter
    prev.connect(widenerHP);
    spatialWidthGain.connect(masterLimiter);

    // Studio Convolution Hall Reverb path -> masterLimiter
    prev.connect(reverbHP);
    reverbHP.connect(reverbAirLP);
    reverbAirLP.connect(convolver);
    convolver.connect(reverbWetGain);
    reverbWetGain.connect(masterLimiter);

    // Final Mastering Output Chain: masterLimiter -> gainNode -> analyserNode -> destination
    masterLimiter.connect(gainNode);
    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    syncHeadroomAndEQ(initialBands, useStudioStore.getState().fxMode);
  } catch (err) {
    console.warn('Web Audio EQ initialization skipped:', err);
  }
}

function applyStudioFXToAudio(audio: HTMLAudioElement | null, fxMode: StudioFXMode, baseSpeed: number) {
  const effectiveSpeed =
    fxMode === 'slowed-reverb'
      ? 0.88
      : fxMode === 'nightcore'
      ? 1.18
      : baseSpeed || 1;

  const preservePitch = fxMode !== 'slowed-reverb' && fxMode !== 'nightcore';

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

  if (ytPlayerInstance && window.ytPlayerReady && typeof ytPlayerInstance.setPlaybackRate === 'function') {
    try {
      ytPlayerInstance.setPlaybackRate(effectiveSpeed);
    } catch {}
  }

  if (audioCtx && panLfoGain && reverbWetGain && stereoPanner && spatialWidthGain) {
    const now = audioCtx.currentTime;
    const isSpatial3D = fxMode === '8d-orbit';

    // Gentle 360° binaural pan depth (0.42 keeps both ears full and preserves stereo imaging)
    panLfoGain.gain.setTargetAtTime(isSpatial3D ? 0.42 : 0, now, 0.08);
    if (!isSpatial3D) {
      stereoPanner.pan.setTargetAtTime(0, now, 0.08);
    }

    // 3D Stereo Widener intensity (widens the soundstage in 3D Spatial Audio & Vocal Stage)
    const widthAmount =
      fxMode === '8d-orbit'
        ? 0.26
        : fxMode === 'vocal-stage'
        ? 0.14
        : fxMode === 'bass-cinema'
        ? 0.12
        : 0;
    spatialWidthGain.gain.setTargetAtTime(widthAmount, now, 0.08);

    // Convolution Hall Reverb wet mix (minimal 0.06 room air in 3D Spatial so clarity is 100% preserved)
    const wetAmount =
      fxMode === 'slowed-reverb'
        ? 0.32
        : fxMode === 'vocal-stage'
        ? 0.14
        : fxMode === '8d-orbit'
        ? 0.06
        : 0;
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

export const getPlayer = () => ytPlayerInstance;

/**
 * Call synchronously inside a click handler before async operations (like AI Vibe DJ)
 * so the browser unlocks audio playback for subsequent async playTrack() calls.
 */
export const unlockAudioEngine = () => {
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

export const seekToTime = (seconds: number) => {
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

export default function YouTubeEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const lastRecordedTrackId = useRef<string | null>(null);
  const activeLoadedTrackKeyRef = useRef<string | null>(null);
  const lastPreloadedUrl = useRef<string | null>(null);
  const isFetchingAutoplay = useRef<boolean>(false);
  const resolvingTrackIdRef = useRef<string | null>(null);
  const resolvingNextTrackIdRef = useRef<string | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setIsLoading = usePlayerStore((s) => s.setIsLoading);

  const eqBands = useSettingsStore((s) => s.equalizerBands);
  const crossfadeDuration = useSettingsStore((s) => s.crossfadeDuration);
  const autoplay = useSettingsStore((s) => s.autoplay);
  const fxMode = useStudioStore((s) => s.fxMode);
  const pomodoroActive = useStudioStore((s) => s.pomodoroActive);
  const tickPomodoro = useStudioStore((s) => s.tickPomodoro);
  const sleepActive = useStudioStore((s) => s.sleepActive);
  const sleepEndAtTrack = useStudioStore((s) => s.sleepEndAtTrack);
  const tickSleepTimer = useStudioStore((s) => s.tickSleepTimer);

  // Sync 10-band Equalizer gains + Studio FX EQ offsets + dynamic headroom in real time
  useEffect(() => {
    syncHeadroomAndEQ(eqBands, fxMode);
    applyStudioFXToAudio(audioRef.current, fxMode, playbackSpeed || 1);
  }, [eqBands, fxMode, playbackSpeed]);

  // Global Focus Pomodoro Timer 1s ticker
  useEffect(() => {
    if (!pomodoroActive) return;
    const id = setInterval(() => tickPomodoro(), 1000);
    return () => clearInterval(id);
  }, [pomodoroActive, tickPomodoro]);

  // Unified Sleep Timer 1s ticker with smooth 10-second volume fade-out
  useEffect(() => {
    if (!sleepActive || sleepEndAtTrack) return;
    const id = setInterval(() => {
      const st = useStudioStore.getState();
      if (!st.sleepActive || st.sleepEndAtTrack) return;
      if (st.sleepSeconds <= 1) {
        st.tickSleepTimer();
        usePlayerStore.getState().pause();
        const restoreVol = usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume;
        if (audioCtx && gainNode) {
          gainNode.gain.setTargetAtTime(restoreVol, audioCtx.currentTime, 0.05);
        } else if (audioRef.current) {
          audioRef.current.volume = restoreVol;
        }
      } else {
        st.tickSleepTimer();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sleepActive, sleepEndAtTrack]);

  // Preload next track in queue & proactively resolve 320kbps stream for zero-latency transitions
  useEffect(() => {
    if (!preloadRef.current) {
      const pre = new Audio();
      pre.preload = 'auto';
      pre.crossOrigin = 'anonymous';
      preloadRef.current = pre;
      preloadAudioElement = pre;
    }

    const nextCandidate =
      queue[queueIndex + 1] || (repeatMode === 'all' && queue.length > 0 ? queue[0] : null);

    if (nextCandidate?.audioUrl && lastPreloadedUrl.current !== nextCandidate.audioUrl) {
      lastPreloadedUrl.current = nextCandidate.audioUrl;
      preloadRef.current.src = nextCandidate.audioUrl;
      preloadRef.current.load();
    } else if (
      nextCandidate &&
      !nextCandidate.audioUrl &&
      resolvingNextTrackIdRef.current !== nextCandidate.id
    ) {
      resolvingNextTrackIdRef.current = nextCandidate.id;
      searchTracks(`${nextCandidate.title} ${nextCandidate.artist}`)
        .then((results) => {
          const best = results.find((r) => r.audioUrl);
          if (best?.audioUrl) {
            nextCandidate.audioUrl = best.audioUrl;
            if (preloadRef.current && lastPreloadedUrl.current !== best.audioUrl) {
              lastPreloadedUrl.current = best.audioUrl;
              preloadRef.current.src = best.audioUrl;
              preloadRef.current.load();
            }
          }
        })
        .catch(() => {});
    }

    if (
      autoplay &&
      currentTrack &&
      queue.length > 0 &&
      queueIndex >= queue.length - 2 &&
      !isFetchingAutoplay.current
    ) {
      isFetchingAutoplay.current = true;
      getSmartRecommendations(currentTrack, queue, 8)
        .then((recommended) => {
          const existingIds = new Set(usePlayerStore.getState().queue.map((t) => t.id));
          const fresh = recommended.filter((t) => !existingIds.has(t.id));
          fresh.forEach((t) => usePlayerStore.getState().addToQueue(t));
        })
        .catch(() => {})
        .finally(() => {
          isFetchingAutoplay.current = false;
        });
    }
  }, [currentTrack, queue, queueIndex, repeatMode, autoplay]);

  // Initialize HTML5 Audio & Listeners
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audioRef.current = audio;
      htmlAudioElement = audio;
    }

    const audio = audioRef.current;
    let lastReportedTime = -1;

    const onLoadedMetadata = () => {
      if (activeEngine !== 'audio') return;
      lastReportedTime = -1;
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setIsLoading(false);
    };

    const onCanPlay = () => {
      if (activeEngine === 'audio') {
        setIsLoading(false);
      }
    };

    const onTimeUpdate = () => {
      if (activeEngine !== 'audio') return;
      const cur = audio.currentTime || 0;
      const dur = audio.duration || currentTrack?.duration || 1;

      if (Math.abs(cur - lastReportedTime) >= 0.08 || cur < 0.15) {
        lastReportedTime = cur;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        setProgress(pct, cur);
        if (dur > 0 && !isNaN(dur) && isFinite(dur) && Math.abs(dur - usePlayerStore.getState().duration) > 0.5) {
          setDuration(dur);
        }
      }

      const cf = useSettingsStore.getState().crossfadeDuration;
      const baseTargetGain = getTargetOutputGain();

      let finalGain = baseTargetGain;
      if (cf > 0 && dur > cf * 2 && dur - cur <= cf && dur - cur > 0.15) {
        const remainingRatio = Math.max(0, Math.min(1, (dur - cur) / cf));
        // Smooth equal-power cosine fade-out curve
        finalGain = baseTargetGain * Math.sin(remainingRatio * 0.5 * Math.PI);
      }

      if (audioCtx && gainNode) {
        gainNode.gain.setTargetAtTime(finalGain, audioCtx.currentTime, 0.045);
      } else if (Math.abs(audio.volume - finalGain) > 0.01) {
        audio.volume = Math.max(0, Math.min(1, finalGain));
      }
    };

    const onEnded = () => {
      if (activeEngine !== 'audio') return;
      const restoreGain = getTargetOutputGain();
      if (audioCtx && gainNode) {
        gainNode.gain.setTargetAtTime(restoreGain, audioCtx.currentTime, 0.03);
      } else {
        audio.volume = restoreGain;
      }

      // If Sleep Timer is set to "End of Song", stop playback right here
      const studio = useStudioStore.getState();
      if (studio.sleepActive && studio.sleepEndAtTrack) {
        studio.stopSleepTimer();
        usePlayerStore.getState().pause();
        return;
      }

      const pState = usePlayerStore.getState();
      // If we are at the end of the queue and autoplay is on, ensure a smart recommendation plays next
      if (
        pState.repeatMode === 'off' &&
        pState.queueIndex >= pState.queue.length - 1 &&
        useSettingsStore.getState().autoplay &&
        pState.currentTrack
      ) {
        getSmartRecommendations(pState.currentTrack, pState.queue, 8)
          .then((recs) => {
            if (recs.length > 0) {
              recs.forEach((t) => usePlayerStore.getState().addToQueue(t));
              usePlayerStore.getState().nextTrack();
            }
          })
          .catch(() => {});
        return;
      }

      nextTrack();
    };

    const onWaiting = () => {
      if (activeEngine === 'audio') setIsLoading(true);
    };

    const onPlaying = () => {
      if (activeEngine === 'audio') {
        setIsLoading(false);
        ensureAudioGraph(audio, useSettingsStore.getState().equalizerBands);
        syncHeadroomAndEQ(
          useSettingsStore.getState().equalizerBands,
          useStudioStore.getState().fxMode
        );
        applyStudioFXToAudio(
          audio,
          useStudioStore.getState().fxMode,
          usePlayerStore.getState().playbackSpeed || 1
        );
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        // Smooth anti-pop micro-fade-in to target output gain
        if (audioCtx && gainNode) {
          gainNode.gain.setTargetAtTime(getTargetOutputGain(), audioCtx.currentTime, 0.03);
        }
      }
    };

    const onError = () => {
      if (activeEngine !== 'audio') return;
      const state = usePlayerStore.getState();
      const track = state.currentTrack;

      // 1. If _320.mp4 returned 404/error on CDN, automatically fallback to _160.mp4 then _96.mp4
      if (audio.src.includes('_320.mp4')) {
        audio.src = audio.src.replace('_320.mp4', '_160.mp4');
        if (state.isPlaying) audio.play().catch(() => {});
        return;
      }
      if (audio.src.includes('_160.mp4')) {
        audio.src = audio.src.replace('_160.mp4', '_96.mp4');
        if (state.isPlaying) audio.play().catch(() => {});
        return;
      }

      // 2. Fallback to YouTube engine if youtubeId is present
      if (track?.youtubeId && ytPlayerInstance && window.ytPlayerReady) {
        activeEngine = 'youtube';
        ytPlayerInstance.loadVideoById(track.youtubeId);
        if (state.isPlaying) ytPlayerInstance.playVideo();
      } else if (track && resolvingTrackIdRef.current !== track.id) {
        // 3. Dynamically search & resolve stream if track had no valid stream
        resolvingTrackIdRef.current = track.id;
        searchTracks(`${track.title} ${track.artist}`)
          .then((found) => {
            const match = found.find((t) => t.audioUrl || t.youtubeId);
            if (match && usePlayerStore.getState().currentTrack?.id === track.id) {
              if (match.audioUrl) {
                activeEngine = 'audio';
                audio.src = match.audioUrl;
                audio.play().catch(() => setIsLoading(false));
              } else if (match.youtubeId && ytPlayerInstance && window.ytPlayerReady) {
                activeEngine = 'youtube';
                ytPlayerInstance.loadVideoById(match.youtubeId);
                ytPlayerInstance.playVideo();
              }
            } else {
              setIsLoading(false);
            }
          })
          .catch(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
    };
  }, [nextTrack, setDuration, setIsLoading, setProgress, currentTrack?.duration, crossfadeDuration]);

  // Initialize YouTube IFrame Player for YouTube-only tracks
  useEffect(() => {
    if (window.ytPlayerReady && ytPlayerInstance) return;

    const initPlayer = () => {
      if (!containerRef.current || !window.YT || !window.YT.Player) return;

      ytPlayerInstance = new window.YT.Player(containerRef.current, {
        height: '200',
        width: '200',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin
        },
        events: {
          onReady: (e: any) => {
            window.ytPlayerReady = true;
            const state = usePlayerStore.getState();
            e.target.setVolume((state.volume ?? 0.8) * 100);
            if (state.currentTrack && !state.currentTrack.audioUrl && state.currentTrack.youtubeId) {
              activeEngine = 'youtube';
              e.target.loadVideoById(state.currentTrack.youtubeId);
              if (state.isPlaying) e.target.playVideo();
            }
          },
          onStateChange: (e: any) => {
            if (activeEngine !== 'youtube') return;
            const state = e.data;
            if (state === window.YT.PlayerState.ENDED) {
              const studio = useStudioStore.getState();
              if (studio.sleepActive && studio.sleepEndAtTrack) {
                studio.stopSleepTimer();
                usePlayerStore.getState().pause();
                return;
              }
              const pState = usePlayerStore.getState();
              if (
                pState.repeatMode === 'off' &&
                pState.queueIndex >= pState.queue.length - 1 &&
                useSettingsStore.getState().autoplay &&
                pState.currentTrack
              ) {
                getSmartRecommendations(pState.currentTrack, pState.queue, 8)
                  .then((recs) => {
                    if (recs.length > 0) {
                      recs.forEach((t) => usePlayerStore.getState().addToQueue(t));
                      usePlayerStore.getState().nextTrack();
                    }
                  })
                  .catch(() => {});
                return;
              }
              usePlayerStore.getState().nextTrack();
            } else if (state === window.YT.PlayerState.PLAYING) {
              usePlayerStore.getState().setIsLoading(false);
              const dur = e.target.getDuration?.();
              if (dur && dur > 0) {
                usePlayerStore.getState().setDuration(dur);
              }
            } else if (state === window.YT.PlayerState.BUFFERING) {
              usePlayerStore.getState().setIsLoading(true);
            }
          },
          onError: () => {
            if (activeEngine !== 'youtube') return;
            usePlayerStore.getState().setIsLoading(false);
            usePlayerStore.getState().nextTrack();
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.getElementById('yt-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }, []);

  // Helper to load and start playing a track on the appropriate engine with anti-pop gain smoothing
  const startTrackPlayback = (track: Track, shouldPlay: boolean) => {
    const audio = audioRef.current;

    const playSmoothly = (targetUrl: string) => {
      if (!audio) return;
      if (ytPlayerInstance && window.ytPlayerReady && typeof ytPlayerInstance.stopVideo === 'function') {
        try {
          ytPlayerInstance.stopVideo();
        } catch {}
      }
      activeEngine = 'audio';

      // Soft micro-dip before switching source to avoid speaker pop
      if (audioCtx && gainNode) {
        gainNode.gain.setTargetAtTime(0.001, audioCtx.currentTime, 0.01);
        audio.volume = 1.0;
      } else {
        audio.volume = isMuted ? 0 : volume;
      }

      if (audio.src !== targetUrl) {
        audio.src = targetUrl;
      }
      applyStudioFXToAudio(audio, useStudioStore.getState().fxMode, playbackSpeed || 1);

      if (shouldPlay) {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        audio
          .play()
          .then(() => {
            if (audioCtx && gainNode) {
              gainNode.gain.setTargetAtTime(getTargetOutputGain(), audioCtx.currentTime, 0.03);
            }
          })
          .catch((err) => {
            setIsLoading(false);
            if (err?.name === 'NotAllowedError') {
              usePlayerStore.getState().pause();
            }
          });
      }
    };

    // 1. Check Offline 320kbps Audio Vault first for zero-latency local playback
    if (audio && isTrackOffline(track.id)) {
      getOfflineAudioObjectUrl(track.id)
        .then((blobUrl) => {
          const targetUrl = blobUrl || track.audioUrl;
          if (!targetUrl || usePlayerStore.getState().currentTrack?.id !== track.id) return;
          playSmoothly(targetUrl);
        })
        .catch(() => {});
      return;
    }

    if (track.audioUrl && audio) {
      playSmoothly(track.audioUrl);
      return;
    }

    if (track.youtubeId) {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
      }
      activeEngine = 'youtube';
      if (ytPlayerInstance && window.ytPlayerReady && typeof ytPlayerInstance.loadVideoById === 'function') {
        ytPlayerInstance.loadVideoById(track.youtubeId);
        if (shouldPlay) ytPlayerInstance.playVideo();
        else ytPlayerInstance.pauseVideo();
      }
      return;
    }

    // Track has neither audioUrl nor youtubeId (e.g. raw metadata track from an album): resolve on the fly!
    setIsLoading(true);
    searchTracks(`${track.title} ${track.artist}`)
      .then((results) => {
        const best = results.find((r) => r.audioUrl || r.youtubeId);
        if (best && usePlayerStore.getState().currentTrack?.id === track.id) {
          track.audioUrl = best.audioUrl;
          track.youtubeId = best.youtubeId;
          activeLoadedTrackKeyRef.current = `${track.id}::${track.audioUrl || track.youtubeId || ''}`;
          startTrackPlayback(track, usePlayerStore.getState().isPlaying);
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => {
        setIsLoading(false);
      });
  };

  // Load new track when currentTrack changes (deduplicated so metadata updates never restart playback)
  useEffect(() => {
    if (!currentTrack) return;

    const trackKey = `${currentTrack.id}::${currentTrack.audioUrl || currentTrack.youtubeId || ''}`;
    if (activeLoadedTrackKeyRef.current === trackKey && audioRef.current?.src) {
      return;
    }
    activeLoadedTrackKeyRef.current = trackKey;

    if (lastRecordedTrackId.current !== currentTrack.id) {
      lastRecordedTrackId.current = currentTrack.id;
      const lib = useLibraryStore.getState();
      lib.addToRecentlyPlayed(currentTrack);
      lib.recordPlay(currentTrack.id, currentTrack.duration || 210, currentTrack.title, currentTrack.artist);
    }

    if (currentTrack.duration) {
      setDuration(currentTrack.duration);
    }

    startTrackPlayback(currentTrack, isPlaying);
  }, [currentTrack]);

  // Sync Play / Pause when isPlaying toggles on the current track
  useEffect(() => {
    if (!currentTrack) return;
    if (activeEngine === 'audio' && audioRef.current) {
      if (isPlaying) {
        if (!audioRef.current.src && currentTrack.audioUrl) {
          audioRef.current.src = currentTrack.audioUrl;
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        if (audioRef.current.paused) {
          if (audioCtx && gainNode) {
            gainNode.gain.setTargetAtTime(0.001, audioCtx.currentTime, 0.008);
          }
          audioRef.current
            .play()
            .then(() => {
              if (audioCtx && gainNode) {
                gainNode.gain.setTargetAtTime(getTargetOutputGain(), audioCtx.currentTime, 0.03);
              }
            })
            .catch((err) => {
              setIsLoading(false);
              if (err?.name === 'NotAllowedError') {
                usePlayerStore.getState().pause();
              }
            });
        }
      } else {
        audioRef.current.pause();
      }
    } else if (activeEngine === 'youtube' && ytPlayerInstance && window.ytPlayerReady) {
      if (isPlaying && typeof ytPlayerInstance.playVideo === 'function') {
        ytPlayerInstance.playVideo();
      } else if (!isPlaying && typeof ytPlayerInstance.pauseVideo === 'function') {
        ytPlayerInstance.pauseVideo();
      }
    }
  }, [isPlaying]);

  // Sync Volume & Mute via zipper-free Web Audio GainNode
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      if (audioCtx && gainNode) {
        audioRef.current.volume = 1.0;
        gainNode.gain.setTargetAtTime(getTargetOutputGain(), audioCtx.currentTime, 0.035);
      } else {
        audioRef.current.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
      }
    }
    if (ytPlayerInstance && window.ytPlayerReady && typeof ytPlayerInstance.setVolume === 'function') {
      ytPlayerInstance.setVolume(volume * 100);
      if (isMuted) ytPlayerInstance.mute?.();
      else ytPlayerInstance.unMute?.();
    }
  }, [volume, isMuted]);

  // Sync Playback Speed
  useEffect(() => {
    applyStudioFXToAudio(audioRef.current, fxMode, playbackSpeed || 1);
  }, [playbackSpeed, fxMode]);

  // Progress Tracker for YouTube engine
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        activeEngine === 'youtube' &&
        ytPlayerInstance &&
        isPlaying &&
        window.ytPlayerReady &&
        typeof ytPlayerInstance.getCurrentTime === 'function'
      ) {
        const current = ytPlayerInstance.getCurrentTime() || 0;
        const duration = ytPlayerInstance.getDuration() || currentTrack?.duration || 1;
        if (duration > 0) {
          setProgress((current / duration) * 100, current);
          setDuration(duration);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPlaying, setProgress, setDuration, currentTrack?.duration]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '-9999px',
        left: '-9999px',
        width: '200px',
        height: '200px',
        opacity: 0.01,
        pointerEvents: 'none',
        zIndex: -1
      }}
    >
      <div ref={containerRef} />
    </div>
  );
}
