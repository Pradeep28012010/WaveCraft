import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStudioStore } from '../../stores/studioStore';
import { searchTracks, findStrictTrackMatch } from '../../services/youtube';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import {
  getOfflineAudioObjectUrl,
  isTrackOffline,
  autoCacheTrack,
  precacheTrack
} from '../../services/offlineVault';
import { cleanTrackQuery, resolveDirectAudio, isPlayableAudioStreamUrl, getCachedDirectAudio } from '../../services/streamResolver';
import {
  setHtmlAudioElement,
  setYtPlayerInstance,
  getPlayer,
  getActiveEngine,
  setActiveEngine,
  setSmoothOutputGain,
  getTargetOutputGain,
  hasWebAudioGain,
  resumeAudioContextIfNeeded,
  syncHeadroomAndEQ,
  applyStudioFXToAudio,
  ensureAudioGraph,
  getAudioFrequencyData,
  unlockAudioEngine,
  seekToTime,
  triggerFrequencyCarvedTransition,
  resetAutoMixerFilters
} from '../../services/audioEngine';
import { jamSyncEngine } from '../../services/jamSyncEngine';
import { useJamStore } from '../../stores/jamStore';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { isAndroidNative, PROD_API_ORIGIN, apiUrl } from '../../services/apiConfig';
import {
  startAndroidBackgroundAudio,
  stopAndroidBackgroundAudio
} from '../../services/nativeAndroid';
import { updateMediaSessionMetadata } from '../../hooks/useMediaSession';
import type { Track, YTPlayerEvent } from '../../types';

// Re-export audio engine controls so existing consumers continue to work seamlessly
export { getAudioFrequencyData, getPlayer, unlockAudioEngine, seekToTime };

let cachedSilentAudioUrl: string | null = null;
function getSilentAudioUrl(): string {
  if (cachedSilentAudioUrl) return cachedSilentAudioUrl;
  if (typeof window === 'undefined') return '';
  try {
    const sampleRate = 44100;
    const numFrames = sampleRate; // 1.0 second of genuine audio frames to prevent mobile OS idling
    const buffer = new ArrayBuffer(44 + numFrames * 2);
    const view = new DataView(buffer);

    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + numFrames * 2, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, numFrames * 2, true);

    const blob = new Blob([buffer], { type: 'audio/wav' });
    cachedSilentAudioUrl = URL.createObjectURL(blob);
    return cachedSilentAudioUrl;
  } catch {
    return 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  }
}

export default function YouTubeEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioAnchorRef = useRef<HTMLAudioElement | null>(null);
  const lastRecordedTrackId = useRef<string | null>(null);
  const isFetchingAutoplay = useRef<boolean>(false);
  const trackTransitionIntentRef = useRef<boolean>(false);
  const userInitiatedPauseRef = useRef<boolean>(false);
  const isSwitchingTrackRef = useRef<boolean>(false);
  const activeLoadedYtIdRef = useRef<string | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const lastHandledPlayTriggerRef = useRef<number>(0);
  const resolvingTokenRef = useRef<number>(0);
  const preResolvingIndexRef = useRef<number>(-1);
  const isCrossfadingRef = useRef<boolean>(false);
  const retryAttemptRef = useRef<number>(0);
  const bufferingStartTimeRef = useRef<number>(0);
  const trackLoadStartTimeRef = useRef<number>(0);
  const ytStallRecoveryCountRef = useRef<number>(0);
  const ytBufferingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossfadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rampTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unintendedPauseCountRef = useRef<number>(0);
  const lastUnintendedPauseTimeRef = useRef<number>(0);
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCachedTracksRef = useRef<Set<string>>(new Set());
  const shortDurationRetriedRef = useRef<Set<string>>(new Set());
  const eagerPreloadedNextTrackIdRef = useRef<string | null>(null);
  const searchAndPlayYouTubeRef = useRef<((track: Track, shouldPlay: boolean) => void) | null>(null);
  const fallbackToYouTubeRef = useRef<((track: Track, ytId: string, shouldPlay: boolean) => void) | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setIsLoading = usePlayerStore((s) => s.setIsLoading);
  const playTriggerId = usePlayerStore((s) => s.playTriggerId);

  const eqBands = useSettingsStore((s) => s.equalizerBands);
  const autoplay = useSettingsStore((s) => s.autoplay);
  const crossfadeDuration = useSettingsStore((s) => s.crossfadeDuration || s.crossfade || 0);
  const crossfadeDurationRef = useRef(crossfadeDuration);
  crossfadeDurationRef.current = crossfadeDuration;
  const loudnessNormalization = useSettingsStore((s) => s.loudnessNormalization ?? true);
  const offlineModeOnly = useSettingsStore((s) => s.offlineModeOnly ?? false);
  const fxMode = useStudioStore((s) => s.fxMode);
  const spatialOrbitAuto = useStudioStore((s) => s.spatialOrbitAuto);
  const spatialOrbitSpeed = useStudioStore((s) => s.spatialOrbitSpeed);
  const spatialRoomSize = useStudioStore((s) => s.spatialRoomSize);
  const spatialManualPos = useStudioStore((s) => s.spatialManualPos);
  const subBassBoost = useStudioStore((s) => s.subBassBoost);
  const harmonicDrive = useStudioStore((s) => s.harmonicDrive);
  const stereoWidth = useStudioStore((s) => s.stereoWidth);
  const reverbMix = useStudioStore((s) => s.reverbMix);
  const trebleAir = useStudioStore((s) => s.trebleAir);
  const preservePitch = useStudioStore((s) => s.preservePitch);
  const pomodoroActive = useStudioStore((s) => s.pomodoroActive);
  const tickPomodoro = useStudioStore((s) => s.tickPomodoro);
  const sleepActive = useStudioStore((s) => s.sleepActive);
  const sleepEndAtTrack = useStudioStore((s) => s.sleepEndAtTrack);

  // Proactively unlock AudioContext, HTMLAudioElement and Background Audio Anchor on first interaction
  useEffect(() => {
    const unlockOnInteraction = () => {
      unlockAudioEngine();
      if (audioAnchorRef.current) {
        audioAnchorRef.current.volume = 0.001;
        audioAnchorRef.current.src = getSilentAudioUrl();
        audioAnchorRef.current
          .play()
          .then(() => {
            if (!usePlayerStore.getState().isPlaying) {
              audioAnchorRef.current?.pause();
            }
          })
          .catch(() => {});
      }
      window.removeEventListener('pointerdown', unlockOnInteraction);
      window.removeEventListener('touchstart', unlockOnInteraction);
    };
    window.addEventListener('pointerdown', unlockOnInteraction, { passive: true });
    window.addEventListener('touchstart', unlockOnInteraction, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnInteraction);
      window.removeEventListener('touchstart', unlockOnInteraction);
    };
  }, []);

  // Sync 10-band Equalizer gains + Studio FX in real time
  useEffect(() => {
    syncHeadroomAndEQ(eqBands, fxMode);
    applyStudioFXToAudio(audioRef.current, fxMode, playbackSpeed || 1);
  }, [
    isPlaying,
    eqBands,
    fxMode,
    playbackSpeed,
    spatialOrbitAuto,
    spatialOrbitSpeed,
    spatialRoomSize,
    spatialManualPos,
    subBassBoost,
    harmonicDrive,
    stereoWidth,
    reverbMix,
    trebleAir,
    preservePitch
  ]);

  // Global Focus Pomodoro Timer 1s ticker
  useEffect(() => {
    if (!pomodoroActive) return;
    const id = setInterval(() => tickPomodoro(), 1000);
    return () => clearInterval(id);
  }, [pomodoroActive, tickPomodoro]);

  // Unified Sleep Timer 1s ticker with smooth volume fade-out
  useEffect(() => {
    if (!sleepActive || sleepEndAtTrack) return;
    const id = setInterval(() => {
      const st = useStudioStore.getState();
      if (!st.sleepActive || st.sleepEndAtTrack) return;
      if (st.sleepSeconds <= 1) {
        clearInterval(id);
        st.tickSleepTimer();
        usePlayerStore.getState().pause();
        const restoreVol = usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume;
        setSmoothOutputGain(audioRef.current, restoreVol, 0.05);
      } else {
        st.tickSleepTimer();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sleepActive, sleepEndAtTrack]);

  // Autoplay prefetch when approaching end of queue
  useEffect(() => {
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
  }, [currentTrack, queue, queueIndex, autoplay]);

  // Bulletproof Helper: Completely extinguish YouTube Engine so it CANNOT make sound or run timers
  const killYouTubeEngine = () => {
    if (rampTimerRef.current) {
      clearInterval(rampTimerRef.current);
      rampTimerRef.current = null;
    }
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    if (autoResumeTimerRef.current) {
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }
    if (ytBufferingDebounceTimerRef.current) {
      clearTimeout(ytBufferingDebounceTimerRef.current);
      ytBufferingDebounceTimerRef.current = null;
    }
    bufferingStartTimeRef.current = 0;
    trackLoadStartTimeRef.current = 0;
    activeLoadedYtIdRef.current = null;

    const ytPlayer = getPlayer();
    if (ytPlayer && window.ytPlayerReady) {
      try {
        ytPlayer.mute?.();
        ytPlayer.setVolume?.(0);
        ytPlayer.stopVideo?.();
        ytPlayer.pauseVideo?.();
      } catch {}
    }
  };

  // Bulletproof Helper: Completely extinguish Native HTML5 Audio Engine
  const killNativeAudioEngine = () => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {}
    }
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
  };

  // Gracefully skip unplayable track without deleting or mutating the user's queue
  const skipFailedTrack = (failedTrackId: string) => {
    const store = usePlayerStore.getState();
    console.warn(`[WaveCraft] Skipping unplayable track: ${failedTrackId}`);
    trackTransitionIntentRef.current = true;
    userInitiatedPauseRef.current = false;
    setIsLoading(false);
    store.nextTrack();
  };

  // Initialize HTML5 Audio (retained for direct 320kbps streams and offline vault)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setHtmlAudioElement(audio);
    ensureAudioGraph(audio, eqBands);

    let lastReportedTime = -1;

    const onLoadedMetadata = () => {
      if (getActiveEngine() !== 'audio') return;
      lastReportedTime = -1;
      const dur = audio.duration;
      const curTrack = usePlayerStore.getState().currentTrack;
      const expectedDur = curTrack?.duration || 0;

      // Detect and reject any 30-second preview clips mistakenly loaded into native audio
      if (
        dur > 0 &&
        dur < 50 &&
        expectedDur >= 90 &&
        curTrack &&
        !shortDurationRetriedRef.current.has(curTrack.id)
      ) {
        shortDurationRetriedRef.current.add(curTrack.id);
        console.warn(`[WaveCraft] Audio source duration (${dur}s) is a 30s preview for "${curTrack.title}" (expected >= ${expectedDur}s). Rejecting preview...`);
        try { audio.pause(); } catch {}
        audio.removeAttribute('src');
        audio.load();
        curTrack.audioUrl = undefined;
        usePlayerStore.setState((s) => ({
          currentTrack: s.currentTrack?.id === curTrack.id ? { ...s.currentTrack, audioUrl: undefined } : s.currentTrack,
          queue: s.queue.map((t) => (t.id === curTrack.id ? { ...t, audioUrl: undefined } : t))
        }));
        const effYt =
          curTrack.youtubeId ||
          (curTrack.id.startsWith('yt_') ? curTrack.id.replace('yt_', '') : '') ||
          (curTrack.id.startsWith('yt-') ? curTrack.id.replace('yt-', '') : '');
        if (effYt) {
          fallbackToYouTubeRef.current?.(curTrack, effYt, true);
        } else {
          searchAndPlayYouTubeRef.current?.(curTrack, true);
        }
        return;
      }

      if (dur && !isNaN(dur) && isFinite(dur)) {
        setDuration(dur);
      }
      setIsLoading(false);
    };

    const onCanPlay = () => {
      if (getActiveEngine() === 'audio') {
        setIsLoading(false);
        if (audio) {
          setSmoothOutputGain(audio, getTargetOutputGain(), 0.02);
        }
      }
    };

    const onTimeUpdate = () => {
      if (getActiveEngine() !== 'audio') return;
      const cur = audio.currentTime || 0;
      const dur = audio.duration || currentTrack?.duration || 1;

      if (Math.abs(cur - lastReportedTime) >= 0.25 || cur < 0.15) {
        lastReportedTime = cur;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        setProgress(pct, cur);
        if (
          dur > 0 &&
          !isNaN(dur) &&
          isFinite(dur) &&
          Math.abs(dur - usePlayerStore.getState().duration) > 0.5
        ) {
          setDuration(dur);
        }
      }

      // Eager lookahead for upcoming track in background / zero-gap queue transition
      if (dur > 5 && cur >= 5.0) {
        const { queue: q, queueIndex: qIdx } = usePlayerStore.getState();
        const nextSong = q[qIdx + 1];
        if (nextSong && !nextSong.audioUrl && eagerPreloadedNextTrackIdRef.current !== nextSong.id) {
          eagerPreloadedNextTrackIdRef.current = nextSong.id;
          const effNextYt = nextSong.youtubeId || (nextSong.id.startsWith('yt_') ? nextSong.id.replace('yt_', '') : '');
          resolveDirectAudio(nextSong.title, nextSong.artist, nextSong.duration, effNextYt)
            .then((directUrl) => {
              if (isPlayableAudioStreamUrl(directUrl)) {
                nextSong.audioUrl = directUrl;
                nextSong.quality = directUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
                usePlayerStore.setState((s) => ({
                  queue: s.queue.map((t) => (t.id === nextSong.id ? { ...t, audioUrl: directUrl, quality: nextSong.quality } : t))
                }));
              }
            })
            .catch(() => {});
        }
      }

      // Smooth audio crossfading transition near track completion
      const activeCrossfade = crossfadeDurationRef.current;
      const isRepeatOne = usePlayerStore.getState().repeatMode === 'one';
      if (
        activeCrossfade > 0 &&
        !isRepeatOne &&
        dur > 15 &&
        cur >= dur - activeCrossfade &&
        !isCrossfadingRef.current &&
        !trackTransitionIntentRef.current
      ) {
        isCrossfadingRef.current = true;
        setSmoothOutputGain(audio, 0, activeCrossfade * 0.7);
        triggerFrequencyCarvedTransition(activeCrossfade);
        if (crossfadeTimeoutRef.current) {
          clearTimeout(crossfadeTimeoutRef.current);
        }
        crossfadeTimeoutRef.current = setTimeout(() => {
          crossfadeTimeoutRef.current = null;
          if (trackTransitionIntentRef.current) return;
          trackTransitionIntentRef.current = true;
          usePlayerStore.getState().nextTrack();
        }, Math.min(3000, activeCrossfade * 750));
      }
    };

    const onEnded = () => {
      if (getActiveEngine() !== 'audio') return;
      if (crossfadeTimeoutRef.current) {
        clearTimeout(crossfadeTimeoutRef.current);
        crossfadeTimeoutRef.current = null;
      }
      if (trackTransitionIntentRef.current) {
        return;
      }
      const jam = useJamStore.getState();
      if (jam.roomCode && !jam.isHost) {
        // Guest in Jam room: wait for Host to command next track
        return;
      }
      const studio = useStudioStore.getState();
      if (studio.sleepActive && studio.sleepEndAtTrack) {
        studio.stopSleepTimer();
        usePlayerStore.getState().pause();
        return;
      }
      const pState = usePlayerStore.getState();
      if (pState.repeatMode === 'one') {
        lastRecordedTrackId.current = null;
        usePlayerStore.setState({ progress: 0, currentTime: 0 });
        audio.currentTime = 0;
        audio.play().catch(() => {
          usePlayerStore.setState({ isPlaying: false, isLoading: false });
        });
        return;
      }
      const curTrack = usePlayerStore.getState().currentTrack;
      if (curTrack?.id && !autoCachedTracksRef.current.has(curTrack.id)) {
        autoCachedTracksRef.current.add(curTrack.id);
        autoCacheTrack(curTrack);
      }
      // Delegate advancing queue and autoplay recommendations directly to playerStore
      trackTransitionIntentRef.current = true;
      nextTrack();
    };

    let audioLoadingDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let audioStallNudgeTimer: ReturnType<typeof setTimeout> | null = null;
    let audioStallHardRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearAudioTimers = () => {
      if (crossfadeTimeoutRef.current) {
        clearTimeout(crossfadeTimeoutRef.current);
        crossfadeTimeoutRef.current = null;
      }
      if (audioLoadingDebounceTimer) {
        clearTimeout(audioLoadingDebounceTimer);
        audioLoadingDebounceTimer = null;
      }
      if (audioStallNudgeTimer) {
        clearTimeout(audioStallNudgeTimer);
        audioStallNudgeTimer = null;
      }
      if (audioStallHardRecoveryTimer) {
        clearTimeout(audioStallHardRecoveryTimer);
        audioStallHardRecoveryTimer = null;
      }
    };

    const onWaiting = () => {
      if (getActiveEngine() !== 'audio') return;
      // Debounce loading indicator so transient network micro-buffers (e.g. 100-300ms) do NOT flash the UI
      if (!audioLoadingDebounceTimer) {
        audioLoadingDebounceTimer = setTimeout(() => {
          if (getActiveEngine() === 'audio' && audio.readyState < 3) {
            setIsLoading(true);
          }
        }, 450);
      }
    };

    const onStalled = () => {
      if (getActiveEngine() !== 'audio') return;
      if (!usePlayerStore.getState().isPlaying) return;

      if (!audioLoadingDebounceTimer) {
        audioLoadingDebounceTimer = setTimeout(() => {
          if (getActiveEngine() === 'audio' && audio.readyState < 3) {
            setIsLoading(true);
          }
        }, 450);
      }

      // Step 1: After 2s of stalling, gently prompt play without seeking (avoids aborting in-flight HTTP buffer)
      if (!audioStallNudgeTimer) {
        audioStallNudgeTimer = setTimeout(() => {
          audioStallNudgeTimer = null;
          if (getActiveEngine() === 'audio' && usePlayerStore.getState().isPlaying && audio.readyState < 3) {
            if (audio.paused) {
              audio.play().catch(() => {});
            }
          }
        }, 2000);
      }

      // Step 2: After 2.8s of persistent stall on native audio, switch to reliable YouTube stream
      if (!audioStallHardRecoveryTimer) {
        audioStallHardRecoveryTimer = setTimeout(() => {
          audioStallHardRecoveryTimer = null;
          if (getActiveEngine() === 'audio' && usePlayerStore.getState().isPlaying && audio.readyState < 3) {
            console.warn('[WaveCraft] Persistent native audio stall after 2.8s, switching to reliable YouTube stream');
            onError();
          }
        }, 2800);
      }
    };

    const onPlaying = () => {
      clearAudioTimers();
      trackLoadStartTimeRef.current = 0;
      bufferingStartTimeRef.current = 0;
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      if (getActiveEngine() === 'audio') {
        setIsLoading(false);
      }
    };

    const onError = () => {
      clearAudioTimers();
      if (getActiveEngine() !== 'audio') return;
      const cur = usePlayerStore.getState().currentTrack;
      const effectiveYtId =
        cur?.youtubeId ||
        (cur?.id.startsWith('yt_') ? cur.id.replace('yt_', '') : '') ||
        (cur?.id.startsWith('yt-') ? cur.id.replace('yt-', '') : '');
      const ytPlayer = getPlayer();
      const isHidden = typeof document !== 'undefined' && document.hidden;

      // In background tabs/screens, hidden YouTube iframes are strictly blocked by browsers.
      // Prioritize re-resolving direct audio streams so audio stays in native <audio>!
      if (isHidden && cur && retryAttemptRef.current < 2) {
        retryAttemptRef.current++;
        resolveDirectAudio(cur.title, cur.artist, cur.duration, effectiveYtId)
          .then((freshUrl) => {
            if (freshUrl && isPlayableAudioStreamUrl(freshUrl)) {
              cur.audioUrl = freshUrl;
              playNativeAudio(freshUrl, usePlayerStore.getState().isPlaying, audio.currentTime || 0);
            } else {
              skipFailedTrack(cur.id);
            }
          })
          .catch(() => skipFailedTrack(cur.id));
        return;
      }

      if (
        !isHidden &&
        effectiveYtId &&
        ytPlayer &&
        (typeof navigator === 'undefined' || navigator.onLine)
      ) {
        killNativeAudioEngine();
        fallbackToYouTube(cur, effectiveYtId, usePlayerStore.getState().isPlaying);
        return;
      }

      if (cur && retryAttemptRef.current < 2) {
        retryAttemptRef.current++;
        resolveDirectAudio(cur.title, cur.artist, cur.duration, effectiveYtId)
          .then((freshUrl) => {
            if (freshUrl && isPlayableAudioStreamUrl(freshUrl)) {
              cur.audioUrl = freshUrl;
              playNativeAudio(freshUrl, usePlayerStore.getState().isPlaying, audio.currentTime || 0);
            } else {
              skipFailedTrack(cur.id);
            }
          })
          .catch(() => skipFailedTrack(cur.id));
        return;
      }

      setIsLoading(false);
      skipFailedTrack(cur ? cur.id : '');
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('error', onError);

    return () => {
      clearAudioTimers();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
    };
  }, [nextTrack, setDuration, setIsLoading, setProgress, currentTrack?.duration]);

  // Initialize YouTube IFrame Player (Primary and sole streaming engine)
  useEffect(() => {
    if (window.ytPlayerReady && getPlayer()) return;

    const initPlayer = () => {
      if (!containerRef.current || !window.YT || !window.YT.Player) return;

      const ytOrigin =
        isAndroidNative() ||
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'file:'
          ? PROD_API_ORIGIN
          : window.location.origin;

      const player = new window.YT.Player(containerRef.current, {
        height: '180',
        width: '320',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: ytOrigin
        },
        events: {
          onReady: (e: YTPlayerEvent) => {
            window.ytPlayerReady = true;
            const state = usePlayerStore.getState();
            e.target.setVolume?.((state.volume ?? 0.8) * 100);
            if (state.isMuted) e.target.mute?.();

            // Force minimal video quality for audio streaming data savings (144p)
            try {
              e.target.setPlaybackQuality?.('small');
            } catch {}

            const cur = state.currentTrack;
            const effectiveId =
              activeLoadedYtIdRef.current ||
              cur?.youtubeId ||
              (cur?.id.startsWith('yt_') ? cur.id.replace('yt_', '') : '') ||
              (cur?.id.startsWith('yt-') ? cur.id.replace('yt-', '') : '');

            if (effectiveId) {
              activeLoadedYtIdRef.current = effectiveId;
              setActiveEngine('youtube');
              if (state.isPlaying) {
                e.target.loadVideoById?.(effectiveId);
              } else {
                // Cue only on refresh so data isn't consumed and audio doesn't start unexpectedly
                e.target.cueVideoById?.(effectiveId);
              }
            }
          },
          onStateChange: (e: YTPlayerEvent) => {
            if (getActiveEngine() !== 'youtube') {
              killYouTubeEngine();
              return;
            }
            const state = e.data;
            if (state === window.YT?.PlayerState?.ENDED) {
              if (fadeIntervalRef.current) {
                clearInterval(fadeIntervalRef.current);
                fadeIntervalRef.current = null;
              }
              if (trackTransitionIntentRef.current) {
                return;
              }
              const jam = useJamStore.getState();
              if (jam.roomCode && !jam.isHost) {
                // Guest in Jam room: wait for Host to command next track
                return;
              }
              const studio = useStudioStore.getState();
              if (studio.sleepActive && studio.sleepEndAtTrack) {
                studio.stopSleepTimer();
                usePlayerStore.getState().pause();
                return;
              }
              const pState = usePlayerStore.getState();
              if (pState.repeatMode === 'one') {
                e.target.seekTo?.(0);
                e.target.playVideo?.();
                return;
              }
              if (
                pState.repeatMode === 'off' &&
                pState.queueIndex >= pState.queue.length - 1 &&
                useSettingsStore.getState().autoplay &&
                !useSettingsStore.getState().offlineModeOnly &&
                pState.currentTrack
              ) {
                getSmartRecommendations(pState.currentTrack, pState.queue, 8)
                  .then((recs) => {
                    if (recs.length > 0) {
                      const existingIds = new Set(usePlayerStore.getState().queue.map((t) => t.id));
                      const fresh = recs.filter((t) => !existingIds.has(t.id));
                      if (fresh.length > 0) {
                        fresh.forEach((t) => usePlayerStore.getState().addToQueue(t));
                      }
                    }
                    trackTransitionIntentRef.current = true;
                    usePlayerStore.getState().nextTrack();
                  })
                  .catch(() => {
                    trackTransitionIntentRef.current = true;
                    usePlayerStore.getState().nextTrack();
                  });
                return;
              }
              trackTransitionIntentRef.current = true;
              usePlayerStore.getState().nextTrack();
            } else if (state === window.YT?.PlayerState?.PLAYING) {
              if (getActiveEngine() !== 'youtube') {
                killYouTubeEngine();
                return;
              }
              if (ytBufferingDebounceTimerRef.current) {
                clearTimeout(ytBufferingDebounceTimerRef.current);
                ytBufferingDebounceTimerRef.current = null;
              }
              if (autoResumeTimerRef.current) {
                clearTimeout(autoResumeTimerRef.current);
                autoResumeTimerRef.current = null;
              }
              isSwitchingTrackRef.current = false;
              trackTransitionIntentRef.current = false;
              userInitiatedPauseRef.current = false;
              isCrossfadingRef.current = false;
              bufferingStartTimeRef.current = 0;
              trackLoadStartTimeRef.current = 0;
              ytStallRecoveryCountRef.current = 0;
              unintendedPauseCountRef.current = 0;
              usePlayerStore.setState({ isPlaying: true, isLoading: false });

              // Strictly ensure YouTube is unmuted and restored to active volume on playback start
              const pState = usePlayerStore.getState();
              if (!pState.isMuted) {
                try {
                  e.target.unMute?.();
                  const targetVol = Math.round((pState.volume ?? 0.8) * 100);
                  e.target.setVolume?.(targetVol);
                } catch {}
              }
              const dur = e.target.getDuration?.();
              if (dur && dur > 0) {
                const curTrack = usePlayerStore.getState().currentTrack;
                const expectedDur = curTrack?.duration || 0;
                // If YouTube video is < 55s for a track expected to be >= 90s, it's a short/teaser, not the full song
                if (dur < 55 && expectedDur >= 90 && curTrack && !shortDurationRetriedRef.current.has(curTrack.id)) {
                  shortDurationRetriedRef.current.add(curTrack.id);
                  console.warn(`[WaveCraft] YouTube video duration (${dur}s) is too short for "${curTrack.title}" (expected >= ${expectedDur}s). Re-querying full length version...`);
                  curTrack.youtubeId = undefined;
                  searchAndPlayYouTubeRef.current?.(curTrack, true);
                  return;
                }
                usePlayerStore.getState().setDuration(dur);
              }
            } else if (state === window.YT?.PlayerState?.PAUSED) {
              bufferingStartTimeRef.current = 0;
              // Ignore transient PAUSED event during track transition or when awaiting a new track
              if (isSwitchingTrackRef.current || trackTransitionIntentRef.current) {
                return;
              }
              // If user intentionally paused or stopped, commit pause state
              if (userInitiatedPauseRef.current || !usePlayerStore.getState().isPlaying) {
                if (autoResumeTimerRef.current) {
                  clearTimeout(autoResumeTimerRef.current);
                  autoResumeTimerRef.current = null;
                }
                unintendedPauseCountRef.current = 0;
                usePlayerStore.setState({ isPlaying: false, isLoading: false });
                return;
              }

              // Background Tab Protection & Hot-Swap to Native Audio:
              // Mobile and desktop browsers pause background iframes automatically.
              // If the tab is hidden or unintended pauses occur, DO NOT stop playback!
              // Hot-swap immediately to native HTML5 <audio> so audio continues playing seamlessly!
              const isHidden = typeof document !== 'undefined' && document.hidden;
              const curTrack = usePlayerStore.getState().currentTrack;
              if (curTrack && !userInitiatedPauseRef.current && usePlayerStore.getState().isPlaying) {
                const curTime = e.target.getCurrentTime?.() || 0;
                const effectiveId =
                  activeLoadedYtIdRef.current ||
                  curTrack.youtubeId ||
                  (curTrack.id.startsWith('yt_') ? curTrack.id.replace('yt_', '') : '');

                if (curTrack.audioUrl && isPlayableAudioStreamUrl(curTrack.audioUrl)) {
                  playNativeAudio(curTrack.audioUrl, true, curTime);
                  return;
                } else if (isHidden || unintendedPauseCountRef.current >= 2) {
                  resolveDirectAudio(curTrack.title, curTrack.artist, curTrack.duration, effectiveId)
                    .then((bgUrl) => {
                      if (isPlayableAudioStreamUrl(bgUrl) && !userInitiatedPauseRef.current && usePlayerStore.getState().isPlaying) {
                        curTrack.audioUrl = bgUrl;
                        playNativeAudio(bgUrl, true, curTime);
                      }
                    })
                    .catch(() => {});
                  if (isHidden) return;
                }
              }

              // Guard against synchronous postMessage ping-pong recursion storms:
              // If YouTube repeatedly rejects play commands in an unplayable state,
              // prevent tight synchronous looping that starves the browser JS event loop!
              const now = Date.now();
              if (now - lastUnintendedPauseTimeRef.current > 3000) {
                unintendedPauseCountRef.current = 0;
              }
              lastUnintendedPauseTimeRef.current = now;
              unintendedPauseCountRef.current++;

              if (unintendedPauseCountRef.current > 4) {
                unintendedPauseCountRef.current = 0;
                if (autoResumeTimerRef.current) {
                  clearTimeout(autoResumeTimerRef.current);
                  autoResumeTimerRef.current = null;
                }
                if (!document.hidden && userInitiatedPauseRef.current) {
                  usePlayerStore.setState({ isPlaying: false, isLoading: false });
                }
                return;
              }

              // Debounce auto-resume kick so it never starves the UI thread
              if (autoResumeTimerRef.current) {
                clearTimeout(autoResumeTimerRef.current);
              }
              autoResumeTimerRef.current = setTimeout(() => {
                autoResumeTimerRef.current = null;
                if (
                  !userInitiatedPauseRef.current &&
                  usePlayerStore.getState().isPlaying &&
                  getActiveEngine() === 'youtube'
                ) {
                  try {
                    e.target.playVideo?.();
                  } catch {}
                }
              }, 220);
            } else if (state === window.YT?.PlayerState?.BUFFERING) {
              bufferingStartTimeRef.current = Date.now();
              // Debounce visual loading state so transient sub-second frame buffers don't cause UI flashing
              if (!ytBufferingDebounceTimerRef.current) {
                ytBufferingDebounceTimerRef.current = setTimeout(() => {
                  if (bufferingStartTimeRef.current > 0) {
                    usePlayerStore.getState().setIsLoading(true);
                  }
                }, 450);
              }
            } else if (state === window.YT?.PlayerState?.CUED) {
              if (usePlayerStore.getState().isPlaying) {
                try {
                  e.target.unMute?.();
                  e.target.playVideo?.();
                } catch {}
                return;
              }
              usePlayerStore.setState({ isPlaying: false, isLoading: false });
            }
          },
          onError: (e: YTPlayerEvent) => {
            if (getActiveEngine() !== 'youtube') return;
            const cur = usePlayerStore.getState().currentTrack;
            const errCode = e?.data;

            // Smart automatic fallback: retry alternative YouTube stream before skipping
            if (cur && retryAttemptRef.current < 2) {
              retryAttemptRef.current++;
              console.warn(
                `[WaveCraft] Stream playback error (code ${errCode}), executing fallback match #${retryAttemptRef.current}...`
              );
              setIsLoading(true);

              const retryQuery = `${cur.title} ${cur.artist} audio`;
              searchTracks(retryQuery)
                .then((results) => {
                  const failedId = cur.youtubeId || '';
                  const alt = results.find((r) => r.youtubeId && r.youtubeId !== failedId);
                  if (alt?.youtubeId) {
                    cur.youtubeId = alt.youtubeId;
                    fallbackToYouTube(cur, alt.youtubeId, true);
                  } else {
                    skipOnError();
                  }
                })
                .catch(() => skipOnError());
              return;
            }

            function skipOnError() {
              if (cur) {
                skipFailedTrack(cur.id);
              } else {
                trackTransitionIntentRef.current = true;
                userInitiatedPauseRef.current = false;
                setIsLoading(false);
                usePlayerStore.getState().nextTrack();
              }
            }

            skipOnError();
          }
        }
      });

      setYtPlayerInstance(player);
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

    return () => {
      killYouTubeEngine();
      try {
        const player = getPlayer();
        player?.destroy?.();
      } catch {}
      setYtPlayerInstance(null);
    };
  }, []);

  // Helper to fallback or play on YouTube IFrame
  const fallbackToYouTube = (_track: Track, effectiveYtId: string, shouldPlay: boolean) => {
    fallbackToYouTubeRef.current = fallbackToYouTube;
    updateMediaSessionMetadata(_track);
    setActiveEngine('youtube');
    killNativeAudioEngine();
    const ytPlayer = getPlayer();
    if (!ytPlayer || (!window.ytPlayerReady && typeof ytPlayer.loadVideoById !== 'function')) {
      setTimeout(() => {
        const retryPlayer = getPlayer();
        if (retryPlayer && (window.ytPlayerReady || typeof retryPlayer.loadVideoById === 'function')) {
          fallbackToYouTube(_track, effectiveYtId, shouldPlay);
        }
      }, 200);
      return;
    }

    const ytPlayerState = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
    const isCuedOrUnstarted = ytPlayerState === window.YT?.PlayerState?.CUED || ytPlayerState === -1;

    if (activeLoadedYtIdRef.current === effectiveYtId && !isCuedOrUnstarted) {
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      if (shouldPlay) {
        const pState = usePlayerStore.getState();
        const leveling = loudnessNormalization ? 0.94 : 1.0;
        const targetVol = Math.round((pState.isMuted ? 0 : pState.volume) * 100 * leveling);
        try {
          ytPlayer.unMute?.();
          ytPlayer.setVolume?.(targetVol);
        } catch {}
        ytPlayer.playVideo?.();
      } else {
        ytPlayer.pauseVideo?.();
      }
      return;
    }

    activeLoadedYtIdRef.current = effectiveYtId;
    trackLoadStartTimeRef.current = Date.now();
    bufferingStartTimeRef.current = Date.now();
    isSwitchingTrackRef.current = true;
    trackTransitionIntentRef.current = true;
    setIsLoading(true);
    setProgress(0, 0);

    if (shouldPlay) {
      const pState = usePlayerStore.getState();
      const leveling = loudnessNormalization ? 0.94 : 1.0;
      const targetVol = Math.round((pState.isMuted ? 0 : pState.volume) * 100 * leveling);
      try {
        ytPlayer.unMute?.();
        ytPlayer.setVolume?.(targetVol);
      } catch {}

      if (typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(effectiveYtId);
      }

      // Audiophile crossfade fade-in for YouTube streams
      if (crossfadeDuration > 0) {
        const pState = usePlayerStore.getState();
        const leveling = loudnessNormalization ? 0.94 : 1.0;
        const targetVol = Math.round((pState.isMuted ? 0 : pState.volume) * 100 * leveling);
        try {
          ytPlayer.setVolume?.(0);
          const rampSec = Math.min(crossfadeDuration, 2.5);
          const rampSteps = 8;
          let step = 0;
          if (rampTimerRef.current) {
            clearInterval(rampTimerRef.current);
          }
          rampTimerRef.current = setInterval(() => {
            step++;
            const curV = Math.round((targetVol * step) / rampSteps);
            try { ytPlayer.setVolume?.(curV); } catch {}
            if (step >= rampSteps) {
              if (rampTimerRef.current) {
                clearInterval(rampTimerRef.current);
                rampTimerRef.current = null;
              }
            }
          }, (rampSec * 1000) / rampSteps);
        } catch {}
      }

      const activeAnchor = jamSyncEngine.getActiveAnchor();
      const hostNow = jamSyncEngine.getSynchronizedHostEpoch();
      const waitMs =
        activeAnchor?.rendezvousAt && activeAnchor.rendezvousAt > hostNow
          ? activeAnchor.rendezvousAt - hostNow
          : 0;

      if (waitMs > 15 && waitMs < 2500) {
        ytPlayer.pauseVideo?.();
        setTimeout(() => {
          ytPlayer.playVideo?.();
          jamSyncEngine.clearRendezvous();
        }, waitMs);
      }
    } else {
      if (typeof ytPlayer.cueVideoById === 'function') {
        ytPlayer.cueVideoById(effectiveYtId);
      } else if (typeof ytPlayer.pauseVideo === 'function') {
        ytPlayer.pauseVideo();
      }
    }
  };

  // Helper to play on Native HTML5 Audio Engine with full Web Audio 8D / Live Concert DSP
  const playNativeAudio = (targetUrl: string, shouldPlay: boolean, startTimeSec: number = 0) => {
    const cur = usePlayerStore.getState().currentTrack;
    if (cur) updateMediaSessionMetadata(cur);
    const audio = audioRef.current;
    if (!audio) return;

    killYouTubeEngine();
    setActiveEngine('audio');
    setIsLoading(true);

    if (startTimeSec > 0) {
      const curDur = usePlayerStore.getState().duration || cur?.duration || 0;
      const pct = curDur > 0 ? (startTimeSec / curDur) * 100 : 0;
      setProgress(pct, startTimeSec);
    } else {
      setProgress(0, 0);
    }

    audio.loop = false;
    audio.preload = 'auto';
    const fullAudioUrl = targetUrl.startsWith('/') ? apiUrl(targetUrl) : targetUrl;
    const isSameOriginOrProxied =
      fullAudioUrl.startsWith('blob:') ||
      fullAudioUrl.startsWith('data:') ||
      fullAudioUrl.startsWith('/') ||
      fullAudioUrl.includes('/api/music') ||
      (typeof window !== 'undefined' && fullAudioUrl.startsWith(window.location.origin));

    // In web browsers, Web Audio API (MediaElementAudioSourceNode) forces 0dB SILENCE on cross-origin
    // audio elements unless they have valid CORS approval ('crossorigin="anonymous"').
    // External CDN links (e.g. JioSaavn / saavncdn.com) MUST be proxied through /api/music?action=proxy-stream
    // so the browser receives Access-Control-Allow-Origin: * and plays with full audible sound!
    const effectiveStreamUrl =
      !isAndroidNative() && !isSameOriginOrProxied && (fullAudioUrl.startsWith('http://') || fullAudioUrl.startsWith('https://'))
        ? apiUrl(`/api/music?action=proxy-stream&url=${encodeURIComponent(fullAudioUrl)}`)
        : fullAudioUrl;

    audio.crossOrigin = 'anonymous';

    if (audio.src !== effectiveStreamUrl) {
      audio.src = effectiveStreamUrl;
      audio.load();
    }
    if (startTimeSec > 0) {
      try {
        audio.currentTime = startTimeSec;
      } catch {}
    }
    applyStudioFXToAudio(audio, useStudioStore.getState().fxMode, playbackSpeed || 1);

    if (shouldPlay) {
      resumeAudioContextIfNeeded();
      audio
        .play()
        .then(() => {
          if (startTimeSec > 0 && Math.abs(audio.currentTime - startTimeSec) > 1.5) {
            try {
              audio.currentTime = startTimeSec;
            } catch {}
          }
          isSwitchingTrackRef.current = false;
          trackTransitionIntentRef.current = false;
          userInitiatedPauseRef.current = false;
          setSmoothOutputGain(audio, getTargetOutputGain(), 0.035);
          setIsLoading(false);
          usePlayerStore.setState({ isPlaying: true });
        })
        .catch((err) => {
          if (err?.name === 'AbortError') {
            // Expected interruption when rapid track switching interrupts in-flight play()
            return;
          }
          console.warn('[WaveCraft] Native audio play issue:', err);
          setIsLoading(false);
          const cur = usePlayerStore.getState().currentTrack;
          if (cur) cur.audioUrl = undefined;
          const isSuspectShort = Boolean(cur?.duration && cur.duration < 60);
          const effectiveYtId = isSuspectShort
            ? ''
            : cur?.youtubeId ||
              (cur?.id.startsWith('yt_') ? cur.id.replace('yt_', '') : '') ||
              (cur?.id.startsWith('yt-') ? cur.id.replace('yt-', '') : '');
          if (err?.name === 'NotAllowedError') {
            usePlayerStore.setState({ isPlaying: false, isLoading: false });
          } else if (cur && effectiveYtId && (typeof navigator === 'undefined' || navigator.onLine)) {
            fallbackToYouTube(cur, effectiveYtId, true);
          } else if (cur && (typeof navigator === 'undefined' || navigator.onLine)) {
            searchAndPlayYouTube(cur, true);
          } else if (cur) {
            skipFailedTrack(cur.id);
          }
        });
    } else {
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      setIsLoading(false);
    }
  };

  // Helper to load and start playing a track with automatic HD stream resolution
  const startTrackPlayback = (track: Track, shouldPlay: boolean, isNewTrack: boolean = true) => {
    updateMediaSessionMetadata(track);
    startAndroidBackgroundAudio(
      track.title,
      track.artist,
      track.thumbnailLarge || track.thumbnail,
      shouldPlay,
      0,
      track.duration || 0
    );
    const audio = audioRef.current;

    // Immediately increment resolving token to discard in-flight async operations
    const resolveToken = ++resolvingTokenRef.current;

    if (isNewTrack) {
      retryAttemptRef.current = 0;
      isCrossfadingRef.current = false;
      bufferingStartTimeRef.current = Date.now();
      trackLoadStartTimeRef.current = Date.now();
      ytStallRecoveryCountRef.current = 0;
      isSwitchingTrackRef.current = true;
      trackTransitionIntentRef.current = true;
      userInitiatedPauseRef.current = false;

      // Cleanly and immediately silence both engines to prevent prior song bleed
      killYouTubeEngine();
      killNativeAudioEngine();

      activeLoadedYtIdRef.current = null;
      setIsLoading(true);
      setProgress(0, 0);
      resetAutoMixerFilters();

      // Pre-cache upcoming song in queue for zero-gap playback
      const { queue: currentQueue, queueIndex: currentIdx } = usePlayerStore.getState();
      const nextSong = currentQueue[currentIdx + 1];
      if (nextSong && !isTrackOffline(nextSong.id)) {
        precacheTrack(nextSong);
      }
      eagerPreloadedNextTrackIdRef.current = null;
    }

    // 0. Instant playback for local imported files (MP3/FLAC/WAV/M4A)
    if (audio && (track.isLocal || track.id.startsWith('local_'))) {
      if (track.audioUrl && track.audioUrl.startsWith('blob:')) {
        playNativeAudio(track.audioUrl, shouldPlay);
        return;
      }
      getOfflineAudioObjectUrl(track.id)
        .then((blobUrl) => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
          if (blobUrl) {
            playNativeAudio(blobUrl, shouldPlay);
          } else {
            setIsLoading(false);
          }
        })
        .catch(() => setIsLoading(false));
      return;
    }

    // 1. Check Offline Audio Vault first for zero-latency local playback
    if (audio && isTrackOffline(track.id)) {
      getOfflineAudioObjectUrl(track.id)
        .then((blobUrl) => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
          if (blobUrl) {
            playNativeAudio(blobUrl, shouldPlay);
          } else {
            proceedOnline();
          }
        })
        .catch(() => {
          if (resolveToken !== resolvingTokenRef.current) return;
          proceedOnline();
        });
      return;
    }

    if (offlineModeOnly) {
      console.warn('[WaveCraft] Offline Mode active: track not available in offline vault.');
      setIsLoading(false);
      return;
    }

    proceedOnline();

    function proceedOnline() {
      // 1b. If device is offline, check if blob exists in storage before attempting online stream
      if (typeof navigator !== 'undefined' && !navigator.onLine && audio) {
        getOfflineAudioObjectUrl(track.id).then((blobUrl) => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (blobUrl) {
            playNativeAudio(blobUrl, shouldPlay);
          } else {
            setIsLoading(false);
          }
        });
        return;
      }

      // Helper to identify and reject 30-second audio previews (Apple Music / Spotify preview clips)
      const isAudioPreviewUrl = (url?: string): boolean => {
        if (!url) return false;
        return (
          url.includes('p.scdn.co') ||
          url.includes('itunes.apple.com') ||
          url.includes('mzstatic.com') ||
          url.includes('audio-ssl') ||
          url.includes('apple.com') ||
          url.includes('preview')
        );
      };

      if (track.audioUrl && isAudioPreviewUrl(track.audioUrl)) {
        track.audioUrl = undefined;
        usePlayerStore.setState((s) => ({
          currentTrack: s.currentTrack?.id === track.id ? { ...s.currentTrack, audioUrl: undefined } : s.currentTrack,
          queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: undefined } : t))
        }));
      }

      // 2. Direct 320kbps Audio Stream already available (MUST be full-length CDN stream, never 30s preview or throttled googlevideo)
      const isDirectCdnStream =
        Boolean(track.audioUrl) &&
        !isAudioPreviewUrl(track.audioUrl) &&
        isPlayableAudioStreamUrl(track.audioUrl);

      if (isDirectCdnStream && audio) {
        playNativeAudio(track.audioUrl!, shouldPlay);
        return;
      }

      const isSuspectShortId = Boolean(track.duration && track.duration < 60);
      const effectiveYtId = isSuspectShortId
        ? ''
        : track.youtubeId ||
          (track.id.startsWith('yt_') ? track.id.replace('yt_', '') : '') ||
          (track.id.startsWith('yt-') ? track.id.replace('yt-', '') : '');

      // 3. Lossless Audio First Strategy:
      // Always prioritize crystal-clear 320kbps Lossless HTML5 Audio over compressed YouTube.
      // A. Check in-memory stream cache first (0ms instantaneous start)
      const cachedDirectAudio = getCachedDirectAudio(track.title, track.artist, effectiveYtId);
      if (cachedDirectAudio && isPlayableAudioStreamUrl(cachedDirectAudio) && audio) {
        track.audioUrl = cachedDirectAudio;
        track.quality = cachedDirectAudio.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
        usePlayerStore.setState((s) => ({
          currentTrack:
            s.currentTrack?.id === track.id
              ? { ...s.currentTrack, audioUrl: cachedDirectAudio, quality: track.quality }
              : s.currentTrack,
          queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: cachedDirectAudio, quality: track.quality } : t))
        }));
        playNativeAudio(cachedDirectAudio, shouldPlay);
        return;
      }

      // B. Background Tab Continuity:
      // When the browser tab is hidden (document.hidden), NEVER start YouTube!
      // Browsers strictly block hidden YouTube iframes from autoplaying new tracks.
      // Wait for resolveDirectAudio so it begins seamlessly on native HTML5 <audio> without any tab-switch stall!
      const isHiddenMode = typeof document !== 'undefined' && document.hidden;
      if (isHiddenMode) {
        resolveDirectAudio(track.title, track.artist, track.duration, effectiveYtId)
          .then((directUrl) => {
            if (resolveToken !== resolvingTokenRef.current) return;
            if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
            if (isPlayableAudioStreamUrl(directUrl) && audio) {
              track.audioUrl = directUrl;
              track.quality = directUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
              usePlayerStore.setState((s) => ({
                currentTrack: s.currentTrack?.id === track.id ? { ...s.currentTrack, audioUrl: directUrl, quality: track.quality } : s.currentTrack,
                queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: directUrl, quality: track.quality } : t))
              }));
              playNativeAudio(directUrl, shouldPlay);
            } else if (effectiveYtId) {
              fallbackToYouTube(track, effectiveYtId, shouldPlay);
            } else {
              searchAndPlayYouTube(track, shouldPlay);
            }
          })
          .catch(() => {
            if (resolveToken !== resolvingTokenRef.current) return;
            if (effectiveYtId) fallbackToYouTube(track, effectiveYtId, shouldPlay);
            else searchAndPlayYouTube(track, shouldPlay);
          });
        return;
      }

      // C. Foreground Fast Race for Studio Lossless:
      // Give resolveDirectAudio a fast 450ms window.
      // Over 90% of songs resolve in 150-350ms (JioSaavn CDN or cached serverless stream).
      // This allows tracks to start immediately in 320kbps Studio Lossless without any hot-swap stutter or echo!
      const directAudioPromise = resolveDirectAudio(track.title, track.artist, track.duration, effectiveYtId);
      const fastRaceTimeout = new Promise<null>((res) => setTimeout(() => res(null), 450));

      Promise.race([directAudioPromise, fastRaceTimeout])
        .then((directUrl) => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;

          if (directUrl && isPlayableAudioStreamUrl(directUrl) && audio) {
            track.audioUrl = directUrl;
            track.quality = directUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
            usePlayerStore.setState((s) => ({
              currentTrack:
                s.currentTrack?.id === track.id
                  ? { ...s.currentTrack, audioUrl: directUrl, quality: track.quality }
                  : s.currentTrack,
              queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: directUrl, quality: track.quality } : t))
            }));
            playNativeAudio(directUrl, shouldPlay);
          } else if (effectiveYtId) {
            // Race timed out: fall back to YouTube for foreground playback
            fallbackToYouTube(track, effectiveYtId, shouldPlay);

            // Let direct audio finish resolving in background to warm cache for replay / loop / offline,
            // but DO NOT hot-swap mid-track while YouTube is playing stably (to avoid the audio echo/hiccup)
            directAudioPromise
              .then((bgUrl) => {
                if (resolveToken !== resolvingTokenRef.current) return;
                if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
                if (bgUrl && isPlayableAudioStreamUrl(bgUrl)) {
                  track.audioUrl = bgUrl;
                  track.quality = bgUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
                  usePlayerStore.setState((s) => ({
                    currentTrack:
                      s.currentTrack?.id === track.id
                        ? { ...s.currentTrack, audioUrl: bgUrl, quality: track.quality }
                        : s.currentTrack,
                    queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: bgUrl, quality: track.quality } : t))
                  }));
                  // Only hot-swap if the tab gets minimized while YouTube is playing
                  if (typeof document !== 'undefined' && document.hidden && usePlayerStore.getState().isPlaying) {
                    const yt = getPlayer();
                    const curTime = (yt && typeof yt.getCurrentTime === 'function' ? yt.getCurrentTime() : 0) || 0;
                    playNativeAudio(bgUrl, true, curTime);
                  }
                }
              })
              .catch(() => {});
          } else {
            searchAndPlayYouTube(track, shouldPlay);
          }
        })
        .catch(() => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (effectiveYtId) {
            fallbackToYouTube(track, effectiveYtId, shouldPlay);
          } else {
            searchAndPlayYouTube(track, shouldPlay);
          }
        });
    }
  };

  const searchAndPlayYouTube = (track: Track, shouldPlay: boolean) => {
    isSwitchingTrackRef.current = true;
    trackTransitionIntentRef.current = true;
    const ytPlayer = getPlayer();
    if (ytPlayer && window.ytPlayerReady) {
      try {
        ytPlayer.mute?.();
        ytPlayer.setVolume?.(0);
        ytPlayer.stopVideo?.();
        ytPlayer.pauseVideo?.();
      } catch {}
    }
    activeLoadedYtIdRef.current = null;
    setIsLoading(true);
    setProgress(0, 0);

    const token = ++resolvingTokenRef.current;
    const { cleanTitle, cleanArtist } = cleanTrackQuery(track.title, track.artist);
    const primaryQuery = cleanArtist ? `${cleanTitle} ${cleanArtist}`.trim() : cleanTitle || `${track.title} ${track.artist}`.trim();
    const isRetryShort = shortDurationRetriedRef.current.has(track.id);
    const searchQuery = isRetryShort ? `${primaryQuery} audio`.trim() : primaryQuery;

    searchTracks(searchQuery)
      .then(async (results) => {
        if (token !== resolvingTokenRef.current) return;
        if (usePlayerStore.getState().currentTrack?.id !== track.id) return;

        const targetDur = track.duration || 210;

        // Filter out clips < 60s when the song is expected to be >= 90s
        const validResults = results.filter((r) => {
          if (targetDur >= 90 && r.duration > 0 && r.duration < 60) return false;
          if (r.duration > 0 && r.duration < 35) return false;
          return true;
        });

        let best = findStrictTrackMatch(track.title, track.artist, validResults.length > 0 ? validResults : results, targetDur);

        // Fallback: If title had extra noise or no match, query with audio suffix or clean title
        if (!best) {
          try {
            const fallbackQuery = `${cleanTitle} ${cleanArtist} audio`.trim();
            const fallbackResults = await searchTracks(fallbackQuery);
            if (token !== resolvingTokenRef.current) return;
            if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
            const validFallback = fallbackResults.filter((r) => {
              if (targetDur >= 90 && r.duration > 0 && r.duration < 60) return false;
              if (r.duration > 0 && r.duration < 35) return false;
              return true;
            });
            best = findStrictTrackMatch(track.title, track.artist, validFallback.length > 0 ? validFallback : fallbackResults, targetDur);
          } catch {}
        }

        if (token !== resolvingTokenRef.current) return;
        if (usePlayerStore.getState().currentTrack?.id !== track.id) return;

        let resolved = best;
        if (!resolved && validResults.length > 0) {
          resolved = validResults.reduce((closest, curr) => {
            if (!closest) return curr;
            const diffClosest = Math.abs((closest.duration || 210) - targetDur);
            const diffCurr = Math.abs((curr.duration || 210) - targetDur);
            return diffCurr < diffClosest ? curr : closest;
          }, validResults[0]);
        } else if (!resolved && results.length > 0) {
          resolved = results[0];
        }

        const ytid =
          resolved?.youtubeId ||
          (resolved?.id.startsWith('yt_') ? resolved.id.replace('yt_', '') : '') ||
          (resolved?.id.startsWith('yt-') ? resolved.id.replace('yt-', '') : '');

        if (ytid) {
          track.youtubeId = ytid;
          usePlayerStore.setState((s) => ({
            currentTrack:
              s.currentTrack?.id === track.id
                ? { ...s.currentTrack, youtubeId: ytid, duration: resolved?.duration || s.currentTrack.duration }
                : s.currentTrack,
            queue: s.queue.map((t) =>
              t.id === track.id
                ? { ...t, youtubeId: ytid, duration: resolved?.duration || t.duration }
                : t
            )
          }));

          // A. If direct audio is already cached in memory, play native lossless immediately (0ms)
          const cachedDirectAudio = getCachedDirectAudio(track.title, track.artist, ytid);
          if (cachedDirectAudio && isPlayableAudioStreamUrl(cachedDirectAudio) && audio) {
            track.audioUrl = cachedDirectAudio;
            track.quality = cachedDirectAudio.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
            usePlayerStore.setState((s) => ({
              currentTrack: s.currentTrack?.id === track.id ? { ...s.currentTrack, audioUrl: cachedDirectAudio, quality: track.quality } : s.currentTrack,
              queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: cachedDirectAudio, quality: track.quality } : t))
            }));
            playNativeAudio(cachedDirectAudio, shouldPlay);
            return;
          }

          const isHidden = typeof document !== 'undefined' && document.hidden;
          if (isHidden) {
            resolveDirectAudio(track.title, track.artist, track.duration, ytid)
              .then((bgUrl) => {
                if (token !== resolvingTokenRef.current) return;
                if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
                if (isPlayableAudioStreamUrl(bgUrl) && audio) {
                  track.audioUrl = bgUrl;
                  track.quality = bgUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
                  usePlayerStore.setState((s) => ({
                    currentTrack: s.currentTrack?.id === track.id ? { ...s.currentTrack, audioUrl: bgUrl, quality: track.quality } : s.currentTrack,
                    queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: bgUrl, quality: track.quality } : t))
                  }));
                  playNativeAudio(bgUrl, shouldPlay);
                } else {
                  fallbackToYouTube(track, ytid, shouldPlay);
                }
              })
              .catch(() => fallbackToYouTube(track, ytid, shouldPlay));
            return;
          }

          // Foreground: Fast 450ms race for Studio Lossless direct audio
          const directPromise = resolveDirectAudio(track.title, track.artist, track.duration, ytid);
          const raceTimeout = new Promise<null>((res) => setTimeout(() => res(null), 450));

          Promise.race([directPromise, raceTimeout])
            .then((directUrl) => {
              if (token !== resolvingTokenRef.current) return;
              if (usePlayerStore.getState().currentTrack?.id !== track.id) return;

              if (directUrl && isPlayableAudioStreamUrl(directUrl) && audio) {
                track.audioUrl = directUrl;
                track.quality = directUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
                usePlayerStore.setState((s) => ({
                  currentTrack: s.currentTrack?.id === track.id ? { ...s.currentTrack, audioUrl: directUrl, quality: track.quality } : s.currentTrack,
                  queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: directUrl, quality: track.quality } : t))
                }));
                playNativeAudio(directUrl, shouldPlay);
              } else {
                fallbackToYouTube(track, ytid, shouldPlay);
                directPromise
                  .then((bgUrl) => {
                    if (token !== resolvingTokenRef.current) return;
                    if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
                    if (bgUrl && isPlayableAudioStreamUrl(bgUrl)) {
                      track.audioUrl = bgUrl;
                      track.quality = bgUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
                      usePlayerStore.setState((s) => ({
                        currentTrack: s.currentTrack?.id === track.id ? { ...s.currentTrack, audioUrl: bgUrl, quality: track.quality } : s.currentTrack,
                        queue: s.queue.map((t) => (t.id === track.id ? { ...t, audioUrl: bgUrl, quality: track.quality } : t))
                      }));
                      if (typeof document !== 'undefined' && document.hidden && usePlayerStore.getState().isPlaying) {
                        const yt = getPlayer();
                        const curTime = (yt && typeof yt.getCurrentTime === 'function' ? yt.getCurrentTime() : 0) || 0;
                        playNativeAudio(bgUrl, true, curTime);
                      }
                    }
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {
              if (token !== resolvingTokenRef.current) return;
              fallbackToYouTube(track, ytid, shouldPlay);
            });

          return;
        } else {
          console.warn(`[WaveCraft] Could not match YouTube audio for: "${track.title}" by "${track.artist}"`);
          setIsLoading(false);
          isSwitchingTrackRef.current = false;
          trackTransitionIntentRef.current = false;
          skipFailedTrack(track.id);
        }
      })
      .catch((err) => {
        if (token !== resolvingTokenRef.current) return;
        console.warn('[WaveCraft] Stream resolution network error:', err);
        setIsLoading(false);
        isSwitchingTrackRef.current = false;
        trackTransitionIntentRef.current = false;
        skipFailedTrack(track.id);
      });
  };
  searchAndPlayYouTubeRef.current = searchAndPlayYouTube;
  fallbackToYouTubeRef.current = fallbackToYouTube;

  // Load new track when currentTrack or playTriggerId changes
  useEffect(() => {
    if (!currentTrack) return;

    const isDifferentTrack = currentTrackIdRef.current !== currentTrack.id;
    const isNewPlayTrigger = playTriggerId !== undefined && playTriggerId !== lastHandledPlayTriggerRef.current;

    currentTrackIdRef.current = currentTrack.id;
    if (playTriggerId !== undefined) {
      lastHandledPlayTriggerRef.current = playTriggerId;
    }

    if (isDifferentTrack || lastRecordedTrackId.current !== currentTrack.id) {
      lastRecordedTrackId.current = currentTrack.id;
      const lib = useLibraryStore.getState();
      lib.addToRecentlyPlayed(currentTrack);
      lib.recordPlay(
        currentTrack.id,
        currentTrack.duration || 210,
        currentTrack.title,
        currentTrack.artist
      );
    }

    if (currentTrack.duration) {
      setDuration(currentTrack.duration);
    }

    const shouldPlay = usePlayerStore.getState().isPlaying || isPlaying;

    if (!isDifferentTrack) {
      // Replay ONLY if this was an EXPLICIT user play command (new playTriggerId)
      if (isNewPlayTrigger && shouldPlay) {
        trackTransitionIntentRef.current = true;
        userInitiatedPauseRef.current = false;
        seekToTime(0);
        const engine = getActiveEngine();
        if (engine === 'audio' && audioRef.current?.src) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {
            startTrackPlayback(currentTrack, shouldPlay, true);
          });
        } else if (engine === 'youtube') {
          const yt = getPlayer();
          if (yt && window.ytPlayerReady) {
            try {
              yt.seekTo?.(0, true);
              yt.playVideo?.();
            } catch {
              startTrackPlayback(currentTrack, shouldPlay, true);
            }
          } else {
            startTrackPlayback(currentTrack, shouldPlay, true);
          }
        } else {
          startTrackPlayback(currentTrack, shouldPlay, true);
        }
      }
      return;
    }

    if (shouldPlay) {
      trackTransitionIntentRef.current = true;
      userInitiatedPauseRef.current = false;
    }

    startTrackPlayback(currentTrack, shouldPlay, true);
  }, [currentTrack, playTriggerId]);

  // Proactive Queue Lookahead: Pre-resolve direct audio & YouTube ID for next track in queue so Next is always instant
  useEffect(() => {
    if (!currentTrack || queue.length === 0) return;
    const nextIdx = queueIndex + 1;
    if (nextIdx >= queue.length) return;
    if (preResolvingIndexRef.current === nextIdx) return;

    const nextTrackCandidate = queue[nextIdx];
    if (!nextTrackCandidate) return;

    preResolvingIndexRef.current = nextIdx;

    const effectiveCandidateYtId =
      nextTrackCandidate.youtubeId ||
      (nextTrackCandidate.id.startsWith('yt_') ? nextTrackCandidate.id.replace('yt_', '') : '') ||
      (nextTrackCandidate.id.startsWith('yt-') ? nextTrackCandidate.id.replace('yt-', '') : '');

    // 1. Pre-resolve direct 320kbps audio stream for background and offline continuity
    if (!nextTrackCandidate.audioUrl) {
      resolveDirectAudio(
        nextTrackCandidate.title,
        nextTrackCandidate.artist,
        nextTrackCandidate.duration,
        effectiveCandidateYtId
      )
        .then((directUrl) => {
          if (isPlayableAudioStreamUrl(directUrl)) {
            usePlayerStore.setState((s) => ({
              queue: s.queue.map((t, idx) =>
                idx === nextIdx
                  ? {
                      ...t,
                      audioUrl: directUrl,
                      quality: directUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio'
                    }
                  : t
              )
            }));
          }
        })
        .catch(() => {});
    }

    const hasYtId = Boolean(effectiveCandidateYtId);

    if (!hasYtId) {
      searchTracks(`${nextTrackCandidate.title} ${nextTrackCandidate.artist}`)
        .then((results) => {
          const match =
            findStrictTrackMatch(
              nextTrackCandidate.title,
              nextTrackCandidate.artist,
              results,
              nextTrackCandidate.duration
            ) || results[0];

          if (match?.youtubeId) {
            usePlayerStore.setState((s) => ({
              queue: s.queue.map((t, idx) =>
                idx === nextIdx
                  ? {
                      ...t,
                      youtubeId: match.youtubeId,
                      duration: match.duration || t.duration
                    }
                  : t
              )
            }));
          }
        })
        .catch(() => {});
    }
  }, [currentTrack?.id, queueIndex, queue.length]);

  // Sync Play / Pause when isPlaying toggles or track switches
  useEffect(() => {
    if (!currentTrack) {
      stopAndroidBackgroundAudio();
      return;
    }
    const pState = usePlayerStore.getState();
    startAndroidBackgroundAudio(
      currentTrack.title,
      currentTrack.artist,
      currentTrack.thumbnailLarge || currentTrack.thumbnail,
      isPlaying,
      pState.currentTime || 0,
      currentTrack.duration || pState.duration || 0
    );
    if (isSwitchingTrackRef.current || trackTransitionIntentRef.current) {
      return;
    }
    if (getActiveEngine() === 'audio' && audioRef.current) {
      const ytPlayer = getPlayer();
      if (ytPlayer && window.ytPlayerReady) {
        try {
          ytPlayer.mute?.();
          ytPlayer.setVolume?.(0);
          ytPlayer.stopVideo?.();
          ytPlayer.pauseVideo?.();
        } catch {}
      }
      const audio = audioRef.current;
      if (isPlaying) {
        userInitiatedPauseRef.current = false;
        if (audio.paused && audio.src) {
          resumeAudioContextIfNeeded();
          audio.play().catch(() => setIsLoading(false));
        }
      } else {
        userInitiatedPauseRef.current = true;
        audio.pause();
      }
    } else if (getActiveEngine() === 'youtube') {
      if (audioRef.current && !audioRef.current.paused) {
        try {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
          audioRef.current.load();
        } catch {}
      }
      if (window.ytPlayerReady) {
        const ytPlayer = getPlayer();
        if (ytPlayer) {
          if (isPlaying) {
            userInitiatedPauseRef.current = false;
            try {
              ytPlayer.unMute?.();
              const pState = usePlayerStore.getState();
              ytPlayer.setVolume?.(Math.round((pState.isMuted ? 0 : pState.volume) * 100));
            } catch {}
            const pState = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
            const effectiveYtId =
              currentTrack.youtubeId ||
              (currentTrack.id.startsWith('yt_') ? currentTrack.id.replace('yt_', '') : '') ||
              (currentTrack.id.startsWith('yt-') ? currentTrack.id.replace('yt-', '') : '');

            // Only resume if the currently loaded YouTube video matches the current track
            if (activeLoadedYtIdRef.current === effectiveYtId && effectiveYtId) {
              const activeAnchor = jamSyncEngine.getActiveAnchor();
              const hostNow = jamSyncEngine.getSynchronizedHostEpoch();
              const waitMs =
                activeAnchor?.rendezvousAt && activeAnchor.rendezvousAt > hostNow
                  ? activeAnchor.rendezvousAt - hostNow
                  : 0;

              if (waitMs > 15 && waitMs < 2500) {
                setTimeout(() => {
                  ytPlayer.playVideo?.();
                  jamSyncEngine.clearRendezvous();
                }, waitMs);
              } else {
                ytPlayer.playVideo?.();
              }
            } else if (effectiveYtId && (pState === window.YT?.PlayerState?.CUED || pState === 5 || pState === -1)) {
              activeLoadedYtIdRef.current = effectiveYtId;
              if (typeof ytPlayer.loadVideoById === 'function') {
                ytPlayer.loadVideoById(effectiveYtId);
              }
            }
          } else if (typeof ytPlayer.pauseVideo === 'function') {
            if (!trackTransitionIntentRef.current) {
              userInitiatedPauseRef.current = true;
              ytPlayer.pauseVideo();
            }
          }
        }
      }
    }
  }, [currentTrack?.id, isPlaying]);

  // Browser Background Audio & System MediaSession Keepalive Anchor:
  // When streaming via YouTube iframe on mobile Chrome/Safari, mobile OSes freeze iframes
  // when minimized UNLESS the top-level origin has an active playing HTML5 audio element.
  // This continuous silent anchor keeps the browser tab alive and attaches navigator.mediaSession
  // to the phone's native lock-screen & notification media player!
  useEffect(() => {
    const anchor = audioAnchorRef.current;
    if (!anchor) return;

    if (isPlaying && currentTrack && getActiveEngine() === 'youtube') {
      anchor.volume = 0.001;
      anchor.loop = true;
      if (!anchor.src || (!anchor.src.startsWith('blob:') && !anchor.src.startsWith('data:audio/wav'))) {
        anchor.src = getSilentAudioUrl();
      }
      if (anchor.paused) {
        anchor.play().catch(() => {});
      }
    } else {
      if (!anchor.paused) {
        anchor.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  // Seamless Background Continuity:
  // When app is minimized or phone screen is locked, verify playback continues uninterrupted
  useEffect(() => {
    const ensureBackgroundPlayback = () => {
      if (isPlaying && !userInitiatedPauseRef.current) {
        const engine = getActiveEngine();
        if (engine === 'audio' && audioRef.current) {
          killYouTubeEngine();
          const audio = audioRef.current;
          if (audio.paused && audio.src) {
            resumeAudioContextIfNeeded();
            audio.play().catch(() => {});
          }
        } else if (engine === 'youtube') {
          const isHidden = typeof document !== 'undefined' && document.hidden;
          const curTrack = usePlayerStore.getState().currentTrack;
          // When app/tab is backgrounded, mobile & desktop browsers throttle YouTube iframes.
          // Immediately hot-swap to native audio stream to guarantee 100% uninterrupted playback!
          if (isHidden && curTrack) {
            const ytPlayer = getPlayer();
            const curTime = (ytPlayer && typeof ytPlayer.getCurrentTime === 'function' ? ytPlayer.getCurrentTime() : 0) || 0;
            if (curTrack.audioUrl && isPlayableAudioStreamUrl(curTrack.audioUrl)) {
              playNativeAudio(curTrack.audioUrl, true, curTime);
              return;
            } else {
              const effectiveId =
                activeLoadedYtIdRef.current ||
                curTrack.youtubeId ||
                (curTrack.id.startsWith('yt_') ? curTrack.id.replace('yt_', '') : '');
              resolveDirectAudio(curTrack.title, curTrack.artist, curTrack.duration, effectiveId)
                .then((bgUrl) => {
                  if (isPlayableAudioStreamUrl(bgUrl) && !userInitiatedPauseRef.current && usePlayerStore.getState().isPlaying) {
                    curTrack.audioUrl = bgUrl;
                    const yt2 = getPlayer();
                    const curTime2 = (yt2 && typeof yt2.getCurrentTime === 'function' ? yt2.getCurrentTime() : 0) || 0;
                    playNativeAudio(bgUrl, true, curTime2);
                  }
                })
                .catch(() => {});
              return;
            }
          }

          if (!isHidden) {
            const ytPlayer = getPlayer();
            if (ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
              const s = ytPlayer.getPlayerState();
              if (s === window.YT?.PlayerState?.PAUSED || s === window.YT?.PlayerState?.CUED) {
                try {
                  if (typeof ytPlayer.playVideo === 'function') {
                    ytPlayer.playVideo();
                  }
                } catch {}
              }
            }
          }
        }
      }
    };

    const handleVisibility = () => {
      ensureBackgroundPlayback();
      setTimeout(ensureBackgroundPlayback, 150);
      setTimeout(ensureBackgroundPlayback, 600);
    };

    document.addEventListener('visibilitychange', handleVisibility);

    let capHandle: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          ensureBackgroundPlayback();
          setTimeout(ensureBackgroundPlayback, 150);
          setTimeout(ensureBackgroundPlayback, 600);
        } else {
          ensureBackgroundPlayback();
        }
      }).then((h) => {
        capHandle = h;
      }).catch(() => {});
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (capHandle) {
        try { capHandle.remove(); } catch {}
      }
    };
  }, [isPlaying, currentTrack]);

  // Sync Volume & Mute with Audiophile Loudness Normalization
  useEffect(() => {
    const levelingFactor = loudnessNormalization ? 0.94 : 1.0;
    const effectiveVolume = volume * levelingFactor;

    if (audioRef.current) {
      if (hasWebAudioGain()) {
        setSmoothOutputGain(audioRef.current, getTargetOutputGain() * levelingFactor, 0.02);
      } else {
        audioRef.current.muted = isMuted;
        audioRef.current.volume = isMuted ? 0 : effectiveVolume;
      }
    }
    const ytPlayer = getPlayer();
    if (getActiveEngine() === 'youtube' && ytPlayer && window.ytPlayerReady && typeof ytPlayer.setVolume === 'function') {
      if (useStudioStore.getState().fxMode !== '8d-orbit') {
        ytPlayer.setVolume(effectiveVolume * 100);
      }
      if (isMuted) ytPlayer.mute?.();
      else ytPlayer.unMute?.();
    } else if (getActiveEngine() !== 'youtube' && ytPlayer && window.ytPlayerReady) {
      try {
        ytPlayer.mute?.();
        ytPlayer.setVolume?.(0);
      } catch {}
    }
  }, [volume, isMuted, loudnessNormalization]);

  // Sync Playback Speed
  useEffect(() => {
    const ytPlayer = getPlayer();
    if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.setPlaybackRate === 'function') {
      try {
        ytPlayer.setPlaybackRate(playbackSpeed || 1);
      } catch {}
    }
    if (audioRef.current) {
      try {
        audioRef.current.playbackRate = playbackSpeed || 1;
      } catch {}
    }
  }, [playbackSpeed]);

  // Sync playback state with Electron powerSaveBlocker
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const electron = (window as unknown as { electronAPI?: { sendPlaybackState?: (p: boolean) => void } }).electronAPI;
      if (typeof electron?.sendPlaybackState === 'function') {
        try {
          electron.sendPlaybackState(isPlaying);
        } catch {}
      }
    }
  }, [isPlaying]);

  // Progress Tracker, Crossfading & Buffering Stall Watchdog for YouTube engine
  useEffect(() => {
    if (!isPlaying) return;
    let lastReportedYtTime = -1;

    const interval = setInterval(() => {
      const ytPlayer = getPlayer();
      if (
        getActiveEngine() === 'youtube' &&
        ytPlayer &&
        isPlaying &&
        !isSwitchingTrackRef.current &&
        window.ytPlayerReady &&
        typeof ytPlayer.getCurrentTime === 'function'
      ) {
        const current = ytPlayer.getCurrentTime() || 0;
        const duration = ytPlayer.getDuration?.() || currentTrack?.duration || 1;
        if (duration > 0) {
          if (Math.abs(current - lastReportedYtTime) >= 0.25 || current < 0.15) {
            lastReportedYtTime = current;
            setProgress((current / duration) * 100, current);
          }
          if (
            duration > 0 &&
            !isNaN(duration) &&
            isFinite(duration) &&
            Math.abs(duration - usePlayerStore.getState().duration) > 0.5
          ) {
            setDuration(duration);
          }

          // Eager lookahead for upcoming track in background / zero-gap queue transition
          if (duration > 5 && current >= 5.0) {
            const { queue: q, queueIndex: qIdx } = usePlayerStore.getState();
            const nextSong = q[qIdx + 1];
            if (nextSong && !nextSong.audioUrl && eagerPreloadedNextTrackIdRef.current !== nextSong.id) {
              eagerPreloadedNextTrackIdRef.current = nextSong.id;
              const effNextYt = nextSong.youtubeId || (nextSong.id.startsWith('yt_') ? nextSong.id.replace('yt_', '') : '');
              resolveDirectAudio(nextSong.title, nextSong.artist, nextSong.duration, effNextYt)
                .then((directUrl) => {
                  if (isPlayableAudioStreamUrl(directUrl)) {
                    nextSong.audioUrl = directUrl;
                    nextSong.quality = directUrl.includes('saavncdn') ? '320kbps Studio AAC' : 'HD Studio Audio';
                    usePlayerStore.setState((s) => ({
                      queue: s.queue.map((t) => (t.id === nextSong.id ? { ...t, audioUrl: directUrl, quality: nextSong.quality } : t))
                    }));
                  }
                })
                .catch(() => {});
            }
          }

          // Smooth Audio Crossfading when approaching end of track
          const fadeSec = crossfadeDuration;
          const isRepeatOne = usePlayerStore.getState().repeatMode === 'one';
          if (
            fadeSec > 0 &&
            !isRepeatOne &&
            duration > 15 &&
            current >= duration - fadeSec &&
            !isCrossfadingRef.current &&
            !trackTransitionIntentRef.current
          ) {
            isCrossfadingRef.current = true;
            const startVol = (usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume) * 100;
            const stepMs = 120;
            const totalSteps = Math.max(1, Math.floor((fadeSec * 1000) / stepMs));
            let step = 0;
            if (fadeIntervalRef.current) {
              clearInterval(fadeIntervalRef.current);
            }
            fadeIntervalRef.current = setInterval(() => {
              step++;
              const curVol = Math.max(0, startVol * (1 - step / totalSteps));
              try { ytPlayer.setVolume?.(Math.round(curVol)); } catch {}
              if (step >= totalSteps) {
                if (fadeIntervalRef.current) {
                  clearInterval(fadeIntervalRef.current);
                  fadeIntervalRef.current = null;
                }
                if (trackTransitionIntentRef.current) return;
                trackTransitionIntentRef.current = true;
                usePlayerStore.getState().nextTrack();
              }
            }, stepMs);
          }
        }

        // Proactive Multi-Stage Buffering Stall Recovery Watchdog
        // Recovers both mid-song buffering stalls and initial track load stalls
        const isStalledBuffering = bufferingStartTimeRef.current > 0;
        const isStalledLoad =
          trackLoadStartTimeRef.current > 0 &&
          Date.now() - trackLoadStartTimeRef.current > 2400;

        const isHidden = typeof document !== 'undefined' && document.hidden;

        if (isStalledBuffering || isStalledLoad) {
          const stallMs = Math.max(
            isStalledBuffering ? Date.now() - bufferingStartTimeRef.current : 0,
            isStalledLoad ? Date.now() - trackLoadStartTimeRef.current : 0
          );

          // Background Tab Protection:
          // In background tabs / locked screens, iframes cannot decode video and stall easily.
          // Transfer immediately to native HTML5 <audio> with high-quality direct stream!
          if (isHidden && stallMs >= 1500) {
            bufferingStartTimeRef.current = 0;
            trackLoadStartTimeRef.current = 0;
            const curTrack = usePlayerStore.getState().currentTrack;
            if (curTrack) {
              const curTime = ytPlayer.getCurrentTime?.() || 0;
              const effectiveId =
                activeLoadedYtIdRef.current ||
                curTrack.youtubeId ||
                (curTrack.id.startsWith('yt_') ? curTrack.id.replace('yt_', '') : '');

              if (curTrack.audioUrl && isPlayableAudioStreamUrl(curTrack.audioUrl)) {
                playNativeAudio(curTrack.audioUrl, true, curTime);
              } else {
                resolveDirectAudio(curTrack.title, curTrack.artist, curTrack.duration, effectiveId)
                  .then((bgUrl) => {
                    if (isPlayableAudioStreamUrl(bgUrl) && !userInitiatedPauseRef.current && usePlayerStore.getState().isPlaying) {
                      curTrack.audioUrl = bgUrl;
                      playNativeAudio(bgUrl, true, curTime);
                    }
                  })
                  .catch(() => {});
              }
            }
          } else if (!isHidden) {

          // Tier 1 (after 2.4s): Force un-mute, nudge playVideo, or force load if cued/unstarted
          if (stallMs >= 2400 && stallMs < 5000) {
            isSwitchingTrackRef.current = false;
            trackTransitionIntentRef.current = false;
            const pState = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
            const curTrack = usePlayerStore.getState().currentTrack;
            const effectiveId =
              activeLoadedYtIdRef.current ||
              curTrack?.youtubeId ||
              (curTrack?.id.startsWith('yt_') ? curTrack.id.replace('yt_', '') : '');

            try {
              ytPlayer.unMute?.();
              if ((pState === window.YT?.PlayerState?.CUED || pState === -1) && effectiveId) {
                if (typeof ytPlayer.loadVideoById === 'function') {
                  ytPlayer.loadVideoById(effectiveId);
                }
              } else {
                ytPlayer.playVideo?.();
              }
            } catch {}
          }
          // Tier 2 (after 5.0s): Soft reload at current timestamp
          else if (stallMs >= 5000 && stallMs < 8000 && ytStallRecoveryCountRef.current < 1) {
            ytStallRecoveryCountRef.current = 1;
            const curTrack = usePlayerStore.getState().currentTrack;
            const curTime = ytPlayer.getCurrentTime?.() || 0;
            const effectiveId =
              activeLoadedYtIdRef.current ||
              curTrack?.youtubeId ||
              (curTrack?.id.startsWith('yt_') ? curTrack.id.replace('yt_', '') : '');

            if (effectiveId && typeof ytPlayer.loadVideoById === 'function') {
              try {
                ytPlayer.unMute?.();
                ytPlayer.loadVideoById({ videoId: effectiveId, startSeconds: curTime });
              } catch {
                try {
                  ytPlayer.loadVideoById(effectiveId, curTime);
                } catch {}
              }
            }
          }
          // Tier 3 (after 8.0s): Hard Recovery - Automatically search alternative video version or skip (ZERO infinite buffering)
          else if (stallMs >= 8000) {
            bufferingStartTimeRef.current = 0;
            trackLoadStartTimeRef.current = 0;
            ytStallRecoveryCountRef.current = 0;
            const curTrack = usePlayerStore.getState().currentTrack;
            if (curTrack && retryAttemptRef.current < 2) {
              retryAttemptRef.current++;
              console.warn(
                `[WaveCraft] Stream stalled > 8s for "${curTrack.title}". Attempting automatic alternative search #${retryAttemptRef.current}...`
              );
              curTrack.youtubeId = undefined;
              searchAndPlayYouTubeRef.current?.(curTrack, true);
            } else if (curTrack) {
              console.warn(`[WaveCraft] Skipping unplayable track after stall: "${curTrack.title}"`);
              skipFailedTrack(curTrack.id);
            }
          }
        }
      }
    }
  }, 250);

    return () => {
      clearInterval(interval);
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      if (rampTimerRef.current) {
        clearInterval(rampTimerRef.current);
        rampTimerRef.current = null;
      }
      if (autoResumeTimerRef.current) {
        clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = null;
      }
    };
  }, [isPlaying, setProgress, setDuration, currentTrack?.duration, crossfadeDuration]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '320px',
        height: '180px',
        opacity: 1,
        pointerEvents: 'none',
        zIndex: -100,
        overflow: 'hidden'
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
      />
      <audio
        ref={audioAnchorRef}
        loop
        playsInline
        preload="auto"
      />
    </div>
  );
}
