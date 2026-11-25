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
  precacheTrack,
  predictivePrecacheQueue
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
  getYoutubeTargetVolume,
  syncActiveOutputGain,
  hasWebAudioGain,
  resumeAudioContextIfNeeded,
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
import { updateMediaSessionMetadata } from '../../hooks/useMediaSession';
import type { AudioQuality, Track, YTPlayerEvent } from '../../types';

// Re-export audio engine controls so existing consumers continue to work seamlessly
export { getAudioFrequencyData, getPlayer, unlockAudioEngine, seekToTime };

let activeCrossfadeCancelFn: (() => void) | null = null;
export function cancelActiveCrossfade(): void {
  activeCrossfadeCancelFn?.();
}

function applyAudioQualityToUrl(url: string, quality: AudioQuality): string {
  if (!url || !url.includes('saavncdn.com')) return url;
  if (!/_(?:320|160|96)\.mp4\b/i.test(url)) return url;
  let suffix = '_320.mp4';
  if (quality === 'low') {
    suffix = '_96.mp4';
  } else if (quality === 'medium') {
    suffix = '_160.mp4';
  } else if (quality === 'auto' && typeof navigator !== 'undefined') {
    const conn = (navigator as { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
    if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') {
      suffix = '_96.mp4';
    } else if (conn?.effectiveType === '3g') {
      suffix = '_160.mp4';
    }
  }
  return url.replace(/_(?:320|160|96)\.mp4\b/i, suffix);
}

function getYtQualityForSetting(quality: AudioQuality): string {
  switch (quality) {
    case 'high':
      return 'large';
    case 'medium':
      return 'medium';
    case 'low':
      return 'small';
    default:
      return 'default';
  }
}

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
  const preResolvingTrackIdRef = useRef<string | null>(null);
  const isCrossfadingRef = useRef<boolean>(false);
  const isCrossfadeTransitionRef = useRef<boolean>(false);
  const retryAttemptRef = useRef<number>(0);
  const failedTrackIdsInPassRef = useRef<Set<string>>(new Set());
  const localIdbRetriedIdsRef = useRef<Set<string>>(new Set());
  const bufferingStartTimeRef = useRef<number>(0);
  const trackLoadStartTimeRef = useRef<number>(0);
  const ytStallRecoveryCountRef = useRef<number>(0);
  const ytBufferingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossfadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rampTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioLoadingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioStallNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioStallHardRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeRendezvousTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytRendezvousTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytReadyRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unintendedPauseCountRef = useRef<number>(0);
  const lastUnintendedPauseTimeRef = useRef<number>(0);
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCachedTracksRef = useRef<Set<string>>(new Set());
  const shortDurationRetriedRef = useRef<Set<string>>(new Set());
  const eagerPreloadedNextTrackIdRef = useRef<string | null>(null);
  const hasCheckedLookaheadRef = useRef<boolean>(false);
  const searchAndPlayYouTubeRef = useRef<((track: Track, shouldPlay: boolean) => void) | null>(null);
  const fallbackToYouTubeRef = useRef<((track: Track, ytId: string, shouldPlay: boolean) => void) | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setIsLoading = usePlayerStore((s) => s.setIsLoading);
  const playTriggerId = usePlayerStore((s) => s.playTriggerId);

  const autoplay = useSettingsStore((s) => s.autoplay);
  const audioQuality = useSettingsStore((s) => s.audioQuality || 'high');
  const audioQualityRef = useRef<AudioQuality>(audioQuality);
  audioQualityRef.current = audioQuality;
  const crossfadeDuration = useSettingsStore((s) => s.crossfadeDuration || s.crossfade || 0);
  const crossfadeDurationRef = useRef(crossfadeDuration);
  crossfadeDurationRef.current = crossfadeDuration;
  const loudnessNormalization = useSettingsStore((s) => s.loudnessNormalization ?? true);
  const offlineModeOnly = useSettingsStore((s) => s.offlineModeOnly ?? false);
  const gaplessPlayback = useSettingsStore((s) => s.gaplessPlayback ?? true);
  const streamFallbackEngine = useSettingsStore((s) => s.streamFallbackEngine ?? true);
  const smartDjAutoMix = useStudioStore((s) => s.smartDjAutoMix ?? true);
  const smartDjAutoMixRef = useRef(smartDjAutoMix);
  smartDjAutoMixRef.current = smartDjAutoMix;
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

  // Global Focus Pomodoro Timer 1s ticker
  useEffect(() => {
    if (!pomodoroActive) return;
    const id = setInterval(() => tickPomodoro(), 1000);
    return () => clearInterval(id);
  }, [pomodoroActive, tickPomodoro]);

  // Unified Sleep Timer 1s ticker with smooth volume fade-out across both Web Audio & YouTube
  useEffect(() => {
    if (!sleepActive || sleepEndAtTrack) return;
    const id = setInterval(() => {
      const st = useStudioStore.getState();
      if (!st.sleepActive || st.sleepEndAtTrack) return;
      if (st.sleepSeconds <= 1) {
        clearInterval(id);
        st.tickSleepTimer();
      } else {
        st.tickSleepTimer();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sleepActive, sleepEndAtTrack]);

  // Autoplay prefetch when approaching end of queue (skip in offline mode or as Jam Guest)
  useEffect(() => {
    const isJamGuest = Boolean(useJamStore.getState().roomCode && !useJamStore.getState().isHost);
    if (
      autoplay &&
      !offlineModeOnly &&
      !isJamGuest &&
      currentTrack &&
      queue.length > 0 &&
      queueIndex >= queue.length - 2 &&
      !isFetchingAutoplay.current
    ) {
      isFetchingAutoplay.current = true;
      const requestTrackId = currentTrack.id;
      getSmartRecommendations(currentTrack, queue, 8)
        .then((recommended) => {
          const live = usePlayerStore.getState();
          if (live.currentTrack?.id !== requestTrackId) return;
          const existingIds = new Set(live.queue.map((t) => t.id));
          const fresh = recommended.filter((t) => !existingIds.has(t.id));
          fresh.forEach((t) => live.addToQueue(t));
        })
        .catch(() => {})
        .finally(() => {
          isFetchingAutoplay.current = false;
        });
    }
  }, [currentTrack, queue, queueIndex, autoplay, offlineModeOnly]);

  // Immutable Zustand track patch helper (prevents mutating store track objects directly)
  const patchTrackInStore = (trackId: string, patch: Partial<Track>) => {
    usePlayerStore.setState((s) => ({
      currentTrack:
        s.currentTrack?.id === trackId ? { ...s.currentTrack, ...patch } : s.currentTrack,
      queue: s.queue.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
      originalQueue: s.originalQueue.map((t) => (t.id === trackId ? { ...t, ...patch } : t))
    }));
  };

  // Helper to advance queue cleanly and clear transition deadlock if queue ended
  const advanceNextTrackSilent = () => {
    const beforeState = usePlayerStore.getState();
    const beforeId = beforeState.currentTrack?.id;
    const beforeIdx = beforeState.queueIndex;
    trackTransitionIntentRef.current = true;
    beforeState.nextTrack({ silent: true });
    const afterState = usePlayerStore.getState();
    if (
      !afterState.isPlaying ||
      (afterState.currentTrack?.id === beforeId && afterState.queueIndex === beforeIdx)
    ) {
      trackTransitionIntentRef.current = false;
      isSwitchingTrackRef.current = false;
      isCrossfadingRef.current = false;
      isCrossfadeTransitionRef.current = false;
    }
  };

  // Sync background audio keepalive anchor immediately on play/engine state transitions
  const syncAudioAnchor = () => {
    const anchor = audioAnchorRef.current;
    if (!anchor) return;
    const pState = usePlayerStore.getState();
    if (pState.isPlaying && pState.currentTrack && getActiveEngine() === 'youtube') {
      anchor.volume = 0.001;
      anchor.loop = true;
      if (!anchor.src || (!anchor.src.startsWith('blob:') && !anchor.src.startsWith('data:audio/wav'))) {
        anchor.src = getSilentAudioUrl();
      }
      if (anchor.paused) {
        anchor.play().catch(() => {});
      }
    } else if (!anchor.paused) {
      anchor.pause();
    }
  };

  const clearNativeAudioTimers = () => {
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
    if (audioLoadingDebounceTimerRef.current) {
      clearTimeout(audioLoadingDebounceTimerRef.current);
      audioLoadingDebounceTimerRef.current = null;
    }
    if (audioStallNudgeTimerRef.current) {
      clearTimeout(audioStallNudgeTimerRef.current);
      audioStallNudgeTimerRef.current = null;
    }
    if (audioStallHardRecoveryTimerRef.current) {
      clearTimeout(audioStallHardRecoveryTimerRef.current);
      audioStallHardRecoveryTimerRef.current = null;
    }
    if (nativeRendezvousTimerRef.current) {
      clearTimeout(nativeRendezvousTimerRef.current);
      nativeRendezvousTimerRef.current = null;
    }
  };

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
    if (ytRendezvousTimerRef.current) {
      clearTimeout(ytRendezvousTimerRef.current);
      ytRendezvousTimerRef.current = null;
    }
    if (ytReadyRetryTimerRef.current) {
      clearTimeout(ytReadyRetryTimerRef.current);
      ytReadyRetryTimerRef.current = null;
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
    clearNativeAudioTimers();
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {}
    }
  };

  // Register crossfade cancel hook for seekTo() in playerStore
  useEffect(() => {
    activeCrossfadeCancelFn = () => {
      const hadCrossfade =
        isCrossfadingRef.current ||
        crossfadeTimeoutRef.current !== null ||
        fadeIntervalRef.current !== null;
      if (crossfadeTimeoutRef.current) {
        clearTimeout(crossfadeTimeoutRef.current);
        crossfadeTimeoutRef.current = null;
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      isCrossfadingRef.current = false;
      isCrossfadeTransitionRef.current = false;
      if (hadCrossfade) {
        resetAutoMixerFilters();
        syncActiveOutputGain(0.05);
      }
    };
    return () => {
      activeCrossfadeCancelFn = null;
    };
  }, []);

  // Gracefully skip unplayable track without infinite loop under repeatMode === 'all'
  const skipFailedTrack = (failedTrackId: string) => {
    const store = usePlayerStore.getState();
    console.warn(`[WaveCraft] Skipping unplayable track: ${failedTrackId}`);
    if (failedTrackId) {
      failedTrackIdsInPassRef.current.add(failedTrackId);
    }
    const allTracksFailed =
      store.queue.length === 0 ||
      (failedTrackIdsInPassRef.current.size >= store.queue.length &&
        store.queue.every((t) => failedTrackIdsInPassRef.current.has(t.id)));

    if (allTracksFailed) {
      console.warn('[WaveCraft] All queued tracks failed to play; halting retry loop.');
      trackTransitionIntentRef.current = false;
      isSwitchingTrackRef.current = false;
      isCrossfadingRef.current = false;
      isCrossfadeTransitionRef.current = false;
      failedTrackIdsInPassRef.current.clear();
      killYouTubeEngine();
      killNativeAudioEngine();
      usePlayerStore.setState({ isPlaying: false, isLoading: false });
      return;
    }

    userInitiatedPauseRef.current = false;
    setIsLoading(false);
    advanceNextTrackSilent();
  };

  // Initialize HTML5 Audio (retained for direct 320kbps streams and offline vault)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setHtmlAudioElement(audio);
    ensureAudioGraph(audio, useSettingsStore.getState().equalizerBands);

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
        patchTrackInStore(curTrack.id, { audioUrl: undefined });
        const clearedTrack = { ...curTrack, audioUrl: undefined };
        const effYt =
          clearedTrack.youtubeId ||
          (clearedTrack.id.startsWith('yt_') ? clearedTrack.id.replace('yt_', '') : '') ||
          (clearedTrack.id.startsWith('yt-') ? clearedTrack.id.replace('yt-', '') : '');
        const shouldAutoPlay = Boolean(usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current);
        if (effYt) {
          fallbackToYouTubeRef.current?.(clearedTrack, effYt, shouldAutoPlay);
        } else {
          searchAndPlayYouTubeRef.current?.(clearedTrack, shouldAutoPlay);
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
          if (isCrossfadeTransitionRef.current && crossfadeDurationRef.current > 0) {
            const rampSec = Math.min(2.5, crossfadeDurationRef.current * 0.5);
            setSmoothOutputGain(audio, getTargetOutputGain(), rampSec * 0.35);
            isCrossfadeTransitionRef.current = false;
          } else if (!isCrossfadingRef.current) {
            setSmoothOutputGain(audio, getTargetOutputGain(), 0.02);
          }
        }
      }
    };

    const onTimeUpdate = () => {
      if (getActiveEngine() !== 'audio') return;
      const pStore = usePlayerStore.getState();
      const cur = audio.currentTime || 0;
      const dur = audio.duration || pStore.currentTrack?.duration || 1;

      if (Math.abs(cur - lastReportedTime) >= 0.25 || cur < 0.15) {
        lastReportedTime = cur;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        setProgress(pct, cur);
        if (
          dur > 0 &&
          !isNaN(dur) &&
          isFinite(dur) &&
          Math.abs(dur - pStore.duration) > 0.5
        ) {
          setDuration(dur);
        }
      }

      // Eager lookahead for upcoming track in background / zero-gap queue transition (gated on gaplessPlayback)
      const settingsNow = useSettingsStore.getState();
      if (
        (settingsNow.gaplessPlayback ?? true) &&
        !(settingsNow.offlineModeOnly ?? false) &&
        dur > 5 &&
        cur >= 5.0 &&
        !hasCheckedLookaheadRef.current
      ) {
        hasCheckedLookaheadRef.current = true;
        const nextSong = pStore.queue[pStore.queueIndex + 1];
        if (nextSong && !nextSong.audioUrl && eagerPreloadedNextTrackIdRef.current !== nextSong.id) {
          eagerPreloadedNextTrackIdRef.current = nextSong.id;
          const nextSongId = nextSong.id;
          const effNextYt =
            nextSong.youtubeId ||
            (nextSong.id.startsWith('yt_') ? nextSong.id.replace('yt_', '') : '');
          resolveDirectAudio(nextSong.title, nextSong.artist, nextSong.duration, effNextYt)
            .then((directUrl) => {
              if (isPlayableAudioStreamUrl(directUrl)) {
                const qualityUrl = applyAudioQualityToUrl(directUrl, audioQualityRef.current);
                const qualityLabel = qualityUrl.includes('saavncdn')
                  ? audioQualityRef.current === 'low'
                    ? '96kbps Data Saver'
                    : audioQualityRef.current === 'medium'
                    ? '160kbps Studio AAC'
                    : '320kbps Studio AAC'
                  : 'HD Studio Audio';
                patchTrackInStore(nextSongId, { audioUrl: qualityUrl, quality: qualityLabel });
              }
            })
            .catch(() => {});
        }
      }

      // Smooth audio crossfading transition near track completion (full configured duration)
      const activeCrossfade = crossfadeDurationRef.current;
      const isRepeatOne = pStore.repeatMode === 'one';
      if (
        activeCrossfade > 0 &&
        !isRepeatOne &&
        dur > 15 &&
        cur >= dur - activeCrossfade &&
        !isCrossfadingRef.current &&
        !trackTransitionIntentRef.current
      ) {
        isCrossfadingRef.current = true;
        isCrossfadeTransitionRef.current = true;
        setSmoothOutputGain(audio, 0, activeCrossfade * 0.65);
        if (smartDjAutoMixRef.current) {
          triggerFrequencyCarvedTransition(activeCrossfade);
        }
        if (crossfadeTimeoutRef.current) {
          clearTimeout(crossfadeTimeoutRef.current);
        }
        const expectedTrackId = pStore.currentTrack?.id;
        crossfadeTimeoutRef.current = setTimeout(() => {
          crossfadeTimeoutRef.current = null;
          if (trackTransitionIntentRef.current || getActiveEngine() !== 'audio') return;
          if (usePlayerStore.getState().currentTrack?.id !== expectedTrackId) return;
          advanceNextTrackSilent();
        }, Math.max(500, activeCrossfade * 750));
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
        isCrossfadingRef.current = false;
        isCrossfadeTransitionRef.current = false;
        trackTransitionIntentRef.current = false;
        lastRecordedTrackId.current = null;
        usePlayerStore.setState({ progress: 0, currentTime: 0 });
        audio.currentTime = 0;
        setSmoothOutputGain(audio, getTargetOutputGain(), 0.2);
        audio.play().catch(() => {
          usePlayerStore.setState({ isPlaying: false, isLoading: false });
        });
        return;
      }
      const curTrack = pState.currentTrack;
      if (curTrack?.id && !autoCachedTracksRef.current.has(curTrack.id)) {
        autoCachedTracksRef.current.add(curTrack.id);
        autoCacheTrack(curTrack);
      }
      // Delegate advancing queue and autoplay recommendations directly to playerStore
      advanceNextTrackSilent();
    };

    const onWaiting = () => {
      if (getActiveEngine() !== 'audio') return;
      // Debounce loading indicator so transient network micro-buffers (e.g. 100-300ms) do NOT flash the UI
      if (!audioLoadingDebounceTimerRef.current) {
        audioLoadingDebounceTimerRef.current = setTimeout(() => {
          audioLoadingDebounceTimerRef.current = null;
          if (getActiveEngine() === 'audio' && audio.readyState < 3) {
            setIsLoading(true);
          }
        }, 450);
      }
    };

    const onStalled = () => {
      if (getActiveEngine() !== 'audio') return;
      if (!usePlayerStore.getState().isPlaying) return;

      if (!audioLoadingDebounceTimerRef.current) {
        audioLoadingDebounceTimerRef.current = setTimeout(() => {
          audioLoadingDebounceTimerRef.current = null;
          if (getActiveEngine() === 'audio' && audio.readyState < 3) {
            setIsLoading(true);
          }
        }, 450);
      }

      // Step 1: After 2s of stalling, gently prompt play without seeking (avoids aborting in-flight HTTP buffer)
      if (!audioStallNudgeTimerRef.current) {
        audioStallNudgeTimerRef.current = setTimeout(() => {
          audioStallNudgeTimerRef.current = null;
          if (getActiveEngine() === 'audio' && usePlayerStore.getState().isPlaying && audio.readyState < 3) {
            if (audio.paused) {
              audio.play().catch(() => {});
            }
          }
        }, 2000);
      }

      // Step 2: After 2.8s of persistent stall on native audio, switch to fallback stream
      if (!audioStallHardRecoveryTimerRef.current) {
        audioStallHardRecoveryTimerRef.current = setTimeout(() => {
          audioStallHardRecoveryTimerRef.current = null;
          if (getActiveEngine() === 'audio' && usePlayerStore.getState().isPlaying && audio.readyState < 3) {
            console.warn('[WaveCraft] Persistent native audio stall after 2.8s, initiating stream recovery');
            onError();
          }
        }, 2800);
      }
    };

    const onPlaying = () => {
      clearNativeAudioTimers();
      trackLoadStartTimeRef.current = 0;
      bufferingStartTimeRef.current = 0;
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      failedTrackIdsInPassRef.current.clear();
      retryAttemptRef.current = 0;
      if (getActiveEngine() === 'audio') {
        setIsLoading(false);
        if (isCrossfadeTransitionRef.current && crossfadeDurationRef.current > 0) {
          const rampSec = Math.min(2.5, crossfadeDurationRef.current * 0.5);
          setSmoothOutputGain(audio, getTargetOutputGain(), rampSec * 0.35);
          isCrossfadeTransitionRef.current = false;
        } else if (!isCrossfadingRef.current) {
          setSmoothOutputGain(audio, getTargetOutputGain(), 0.03);
        }
      }
    };

    const onError = () => {
      const savedPos = Math.max(audio.currentTime || 0, usePlayerStore.getState().currentTime || 0);
      clearNativeAudioTimers();
      if (getActiveEngine() !== 'audio') return;
      const errToken = resolvingTokenRef.current;
      const cur = usePlayerStore.getState().currentTrack;
      if (!cur) {
        setIsLoading(false);
        return;
      }
      const expectedTrackId = cur.id;

      // Local / Offline vault tracks: recover fresh blob URL from IndexedDB instead of searching online
      if ((cur.isLocal || cur.id.startsWith('local_') || isTrackOffline(cur.id)) && !localIdbRetriedIdsRef.current.has(cur.id)) {
        localIdbRetriedIdsRef.current.add(cur.id);
        patchTrackInStore(cur.id, { audioUrl: undefined });
        getOfflineAudioObjectUrl(cur.id)
          .then((blobUrl) => {
            if (errToken !== resolvingTokenRef.current) return;
            const live = usePlayerStore.getState();
            if (live.currentTrack?.id !== expectedTrackId) return;
            if (blobUrl) {
              patchTrackInStore(expectedTrackId, { audioUrl: blobUrl });
              playNativeAudio(blobUrl, Boolean(live.isPlaying && !userInitiatedPauseRef.current), savedPos);
            } else {
              skipFailedTrack(expectedTrackId);
            }
          })
          .catch(() => {
            if (errToken === resolvingTokenRef.current && usePlayerStore.getState().currentTrack?.id === expectedTrackId) {
              skipFailedTrack(expectedTrackId);
            }
          });
        return;
      }

      if (cur.isLocal || cur.id.startsWith('local_')) {
        setIsLoading(false);
        skipFailedTrack(expectedTrackId);
        return;
      }

      const fallbackEnabled = useSettingsStore.getState().streamFallbackEngine ?? true;
      if (!fallbackEnabled) {
        setIsLoading(false);
        skipFailedTrack(expectedTrackId);
        return;
      }

      const effectiveYtId =
        cur.youtubeId ||
        (cur.id.startsWith('yt_') ? cur.id.replace('yt_', '') : '') ||
        (cur.id.startsWith('yt-') ? cur.id.replace('yt-', '') : '');
      const ytPlayer = getPlayer();
      const isHidden = typeof document !== 'undefined' && document.hidden;

      // In background tabs/screens, hidden YouTube iframes are strictly blocked by browsers.
      // Prioritize re-resolving direct audio streams so audio stays in native <audio>!
      if (isHidden && retryAttemptRef.current < 2) {
        retryAttemptRef.current++;
        resolveDirectAudio(cur.title, cur.artist, cur.duration, effectiveYtId)
          .then((freshUrl) => {
            if (errToken !== resolvingTokenRef.current) return;
            const live = usePlayerStore.getState();
            if (live.currentTrack?.id !== expectedTrackId) return;
            if (freshUrl && isPlayableAudioStreamUrl(freshUrl)) {
              const qUrl = applyAudioQualityToUrl(freshUrl, audioQualityRef.current);
              patchTrackInStore(expectedTrackId, { audioUrl: qUrl });
              playNativeAudio(qUrl, Boolean(live.isPlaying && !userInitiatedPauseRef.current), savedPos);
            } else {
              skipFailedTrack(expectedTrackId);
            }
          })
          .catch(() => {
            if (errToken === resolvingTokenRef.current && usePlayerStore.getState().currentTrack?.id === expectedTrackId) {
              skipFailedTrack(expectedTrackId);
            }
          });
        return;
      }

      if (
        !isHidden &&
        effectiveYtId &&
        ytPlayer &&
        (typeof navigator === 'undefined' || navigator.onLine)
      ) {
        killNativeAudioEngine();
        fallbackToYouTube(cur, effectiveYtId, Boolean(usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current), savedPos);
        return;
      }

      if (retryAttemptRef.current < 2) {
        retryAttemptRef.current++;
        resolveDirectAudio(cur.title, cur.artist, cur.duration, effectiveYtId)
          .then((freshUrl) => {
            if (errToken !== resolvingTokenRef.current) return;
            const live = usePlayerStore.getState();
            if (live.currentTrack?.id !== expectedTrackId) return;
            if (freshUrl && isPlayableAudioStreamUrl(freshUrl)) {
              const qUrl = applyAudioQualityToUrl(freshUrl, audioQualityRef.current);
              patchTrackInStore(expectedTrackId, { audioUrl: qUrl });
              playNativeAudio(qUrl, Boolean(live.isPlaying && !userInitiatedPauseRef.current), savedPos);
            } else {
              skipFailedTrack(expectedTrackId);
            }
          })
          .catch(() => {
            if (errToken === resolvingTokenRef.current && usePlayerStore.getState().currentTrack?.id === expectedTrackId) {
              skipFailedTrack(expectedTrackId);
            }
          });
        return;
      }

      setIsLoading(false);
      skipFailedTrack(expectedTrackId);
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
      clearNativeAudioTimers();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
    };
  }, [setDuration, setIsLoading, setProgress]);

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
            e.target.setVolume?.(getYoutubeTargetVolume());
            if (state.isMuted) e.target.mute?.();

            // Apply configured audio quality setting
            try {
              e.target.setPlaybackQuality?.(getYtQualityForSetting(audioQualityRef.current));
            } catch {}

            // Never let delayed YouTube IFrame initialization hijack active or local native audio playback
            const cur = state.currentTrack;
            if (
              getActiveEngine() === 'audio' ||
              !cur ||
              cur.isLocal ||
              cur.id.startsWith('local_') ||
              (audioRef.current?.src && !audioRef.current.paused)
            ) {
              return;
            }

            const effectiveId =
              activeLoadedYtIdRef.current ||
              cur.youtubeId ||
              (cur.id.startsWith('yt_') ? cur.id.replace('yt_', '') : '') ||
              (cur.id.startsWith('yt-') ? cur.id.replace('yt-', '') : '');

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
              isCrossfadingRef.current = false;
              isCrossfadeTransitionRef.current = false;
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
                if (!pState.isMuted) {
                  try {
                    e.target.unMute?.();
                    e.target.setVolume?.(getYoutubeTargetVolume());
                  } catch {}
                }
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
                const endedTrackId = pState.currentTrack.id;
                const endedResolveToken = resolvingTokenRef.current;
                getSmartRecommendations(pState.currentTrack, pState.queue, 8)
                  .then((recs) => {
                    if (
                      endedResolveToken !== resolvingTokenRef.current ||
                      usePlayerStore.getState().currentTrack?.id !== endedTrackId
                    ) {
                      return;
                    }
                    const jamNow = useJamStore.getState();
                    if (jamNow.roomCode && !jamNow.isHost) return;
                    if (recs.length > 0) {
                      const existingIds = new Set(usePlayerStore.getState().queue.map((t) => t.id));
                      const fresh = recs.filter((t) => !existingIds.has(t.id));
                      if (fresh.length > 0) {
                        fresh.forEach((t) => usePlayerStore.getState().addToQueue(t));
                      }
                    }
                    advanceNextTrackSilent();
                  })
                  .catch(() => {
                    if (
                      endedResolveToken !== resolvingTokenRef.current ||
                      usePlayerStore.getState().currentTrack?.id !== endedTrackId
                    ) {
                      return;
                    }
                    advanceNextTrackSilent();
                  });
                return;
              }
              advanceNextTrackSilent();
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
              isCrossfadeTransitionRef.current = false;
              bufferingStartTimeRef.current = 0;
              trackLoadStartTimeRef.current = 0;
              ytStallRecoveryCountRef.current = 0;
              unintendedPauseCountRef.current = 0;
              failedTrackIdsInPassRef.current.clear();
              usePlayerStore.setState({ isPlaying: true, isLoading: false });

              // Restore normalized YouTube output volume without clobbering active crossfade ramp
              const pState = usePlayerStore.getState();
              if (!pState.isMuted && !rampTimerRef.current) {
                try {
                  e.target.unMute?.();
                  e.target.setVolume?.(getYoutubeTargetVolume());
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
                  patchTrackInStore(curTrack.id, { youtubeId: undefined });
                  const shouldAutoPlay = Boolean(usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current);
                  searchAndPlayYouTubeRef.current?.({ ...curTrack, youtubeId: undefined }, shouldAutoPlay);
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

              // Background Tab Protection & Hot-Swap to Native Audio
              const isHidden = typeof document !== 'undefined' && document.hidden;
              const curTrack = usePlayerStore.getState().currentTrack;
              if (curTrack && !userInitiatedPauseRef.current && usePlayerStore.getState().isPlaying) {
                const curTime = e.target.getCurrentTime?.() || 0;
                const effectiveId =
                  activeLoadedYtIdRef.current ||
                  curTrack.youtubeId ||
                  (curTrack.id.startsWith('yt_') ? curTrack.id.replace('yt_', '') : '');

                if (curTrack.audioUrl && isPlayableAudioStreamUrl(curTrack.audioUrl)) {
                  const qualityUrl = applyAudioQualityToUrl(curTrack.audioUrl, audioQualityRef.current);
                  playNativeAudio(qualityUrl, true, curTime);
                  return;
                } else if (isHidden || unintendedPauseCountRef.current >= 2) {
                  const pauseToken = resolvingTokenRef.current;
                  const pausedTrackId = curTrack.id;
                  resolveDirectAudio(curTrack.title, curTrack.artist, curTrack.duration, effectiveId)
                    .then((bgUrl) => {
                      if (pauseToken !== resolvingTokenRef.current) return;
                      if (usePlayerStore.getState().currentTrack?.id !== pausedTrackId) return;
                      if (
                        isPlayableAudioStreamUrl(bgUrl) &&
                        !userInitiatedPauseRef.current &&
                        usePlayerStore.getState().isPlaying
                      ) {
                        const qualityUrl = applyAudioQualityToUrl(bgUrl, audioQualityRef.current);
                        const qualityLabel = qualityUrl.includes('saavncdn')
                          ? audioQualityRef.current === 'low'
                            ? '96kbps Data Saver'
                            : audioQualityRef.current === 'medium'
                            ? '160kbps Studio AAC'
                            : '320kbps Studio AAC'
                          : 'HD Studio Audio';
                        patchTrackInStore(pausedTrackId, { audioUrl: qualityUrl, quality: qualityLabel });
                        playNativeAudio(qualityUrl, true, curTime);
                      }
                    })
                    .catch(() => {});
                  if (isHidden) return;
                }
              }

              // Guard against synchronous postMessage ping-pong recursion storms
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
                if (!document.hidden) {
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
              if (ytBufferingDebounceTimerRef.current) {
                clearTimeout(ytBufferingDebounceTimerRef.current);
              }
              ytBufferingDebounceTimerRef.current = setTimeout(() => {
                ytBufferingDebounceTimerRef.current = null;
                if (bufferingStartTimeRef.current > 0 && getActiveEngine() === 'youtube') {
                  usePlayerStore.getState().setIsLoading(true);
                }
              }, 450);
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
            const fallbackEnabled = useSettingsStore.getState().streamFallbackEngine ?? true;

            const skipOnError = () => {
              if (cur) {
                skipFailedTrack(cur.id);
              } else {
                advanceNextTrackSilent();
                setIsLoading(false);
              }
            };

            // Smart automatic fallback: retry alternative YouTube stream before skipping
            if (cur && fallbackEnabled && retryAttemptRef.current < 2) {
              retryAttemptRef.current++;
              console.warn(
                `[WaveCraft] Stream playback error (code ${errCode}), executing fallback match #${retryAttemptRef.current}...`
              );
              setIsLoading(true);

              const errToken = resolvingTokenRef.current;
              const errTrackId = cur.id;
              const retryQuery = `${cur.title} ${cur.artist} audio`;
              searchTracks(retryQuery)
                .then((results) => {
                  if (errToken !== resolvingTokenRef.current) return;
                  if (usePlayerStore.getState().currentTrack?.id !== errTrackId) return;
                  const failedId = cur.youtubeId || '';
                  const alt = results.find((r) => r.youtubeId && r.youtubeId !== failedId);
                  if (alt?.youtubeId) {
                    patchTrackInStore(errTrackId, { youtubeId: alt.youtubeId });
                    const shouldAutoPlay = Boolean(
                      usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current
                    );
                    fallbackToYouTube({ ...cur, youtubeId: alt.youtubeId }, alt.youtubeId, shouldAutoPlay);
                  } else {
                    skipOnError();
                  }
                })
                .catch(() => {
                  if (errToken !== resolvingTokenRef.current) return;
                  if (usePlayerStore.getState().currentTrack?.id !== errTrackId) return;
                  skipOnError();
                });
              return;
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
      window.ytPlayerReady = false;
      killYouTubeEngine();
      clearNativeAudioTimers();
      try {
        const player = getPlayer();
        player?.destroy?.();
      } catch {}
      setYtPlayerInstance(null);
    };
  }, []);

  // Helper to fallback or play on YouTube IFrame
  const fallbackToYouTube = (_track: Track, effectiveYtId: string, shouldPlay: boolean, startSeconds = 0) => {
    fallbackToYouTubeRef.current = fallbackToYouTube;
    updateMediaSessionMetadata(_track);
    setActiveEngine('youtube');
    syncAudioAnchor();
    killNativeAudioEngine();
    const ytPlayer = getPlayer();
    if (!ytPlayer || (!window.ytPlayerReady && typeof ytPlayer.loadVideoById !== 'function')) {
      if (ytReadyRetryTimerRef.current) {
        clearTimeout(ytReadyRetryTimerRef.current);
      }
      const retryToken = resolvingTokenRef.current;
      ytReadyRetryTimerRef.current = setTimeout(() => {
        ytReadyRetryTimerRef.current = null;
        if (retryToken !== resolvingTokenRef.current) return;
        if (usePlayerStore.getState().currentTrack?.id !== _track.id) return;
        const retryPlayer = getPlayer();
        if (retryPlayer && (window.ytPlayerReady || typeof retryPlayer.loadVideoById === 'function')) {
          const liveShouldPlay = Boolean(usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current);
          fallbackToYouTube(_track, effectiveYtId, liveShouldPlay, startSeconds);
        }
      }, 200);
      return;
    }

    try {
      ytPlayer.setPlaybackQuality?.(getYtQualityForSetting(audioQualityRef.current));
    } catch {}

    const ytPlayerState = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
    const isCuedOrUnstarted = ytPlayerState === window.YT?.PlayerState?.CUED || ytPlayerState === -1;

    if (activeLoadedYtIdRef.current === effectiveYtId && !isCuedOrUnstarted) {
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      if (startSeconds > 0 && typeof ytPlayer.seekTo === 'function') {
        try { ytPlayer.seekTo(startSeconds, true); } catch {}
      }
      if (shouldPlay) {
        const pState = usePlayerStore.getState();
        try {
          if (pState.isMuted) ytPlayer.mute?.();
          else ytPlayer.unMute?.();
          if (!rampTimerRef.current) {
            ytPlayer.setVolume?.(getYoutubeTargetVolume());
          }
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
    setProgress(startSeconds > 0 ? (startSeconds / (_track.duration || 200)) * 100 : 0, startSeconds);

    if (shouldPlay) {
      const pState = usePlayerStore.getState();
      const targetVol = getYoutubeTargetVolume();
      try {
        if (pState.isMuted) ytPlayer.mute?.();
        else ytPlayer.unMute?.();
        ytPlayer.setVolume?.(targetVol);
      } catch {}

      if (typeof ytPlayer.loadVideoById === 'function') {
        if (startSeconds > 0) {
          try {
            ytPlayer.loadVideoById({ videoId: effectiveYtId, startSeconds });
          } catch {
            ytPlayer.loadVideoById(effectiveYtId);
          }
        } else {
          ytPlayer.loadVideoById(effectiveYtId);
        }
      }

      // Audiophile crossfade fade-in for YouTube streams
      if (crossfadeDurationRef.current > 0 && !pState.isMuted) {
        try {
          ytPlayer.setVolume?.(0);
          const rampSec = Math.min(crossfadeDurationRef.current, 2.5);
          const rampSteps = 8;
          let step = 0;
          if (rampTimerRef.current) {
            clearInterval(rampTimerRef.current);
          }
          rampTimerRef.current = setInterval(() => {
            if (getActiveEngine() !== 'youtube') {
              if (rampTimerRef.current) {
                clearInterval(rampTimerRef.current);
                rampTimerRef.current = null;
              }
              return;
            }
            step++;
            const liveTarget = getYoutubeTargetVolume();
            const curV = Math.round((liveTarget * step) / rampSteps);
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
        if (ytRendezvousTimerRef.current) {
          clearTimeout(ytRendezvousTimerRef.current);
        }
        const rendezvousToken = resolvingTokenRef.current;
        const rendezvousTrackId = _track.id;
        ytPlayer.pauseVideo?.();
        ytRendezvousTimerRef.current = setTimeout(() => {
          ytRendezvousTimerRef.current = null;
          jamSyncEngine.clearRendezvous();
          if (rendezvousToken !== resolvingTokenRef.current) return;
          if (getActiveEngine() !== 'youtube') return;
          if (usePlayerStore.getState().currentTrack?.id !== rendezvousTrackId) return;
          if (!usePlayerStore.getState().isPlaying || userInitiatedPauseRef.current) return;
          ytPlayer.playVideo?.();
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

    clearNativeAudioTimers();
    killYouTubeEngine();
    setActiveEngine('audio');
    syncAudioAnchor();
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
    const qualityUrl = applyAudioQualityToUrl(targetUrl, audioQualityRef.current);
    const fullAudioUrl = qualityUrl.startsWith('/') ? apiUrl(qualityUrl) : qualityUrl;
    const isSameOriginOrProxied =
      fullAudioUrl.startsWith('blob:') ||
      fullAudioUrl.startsWith('data:') ||
      fullAudioUrl.startsWith('/') ||
      fullAudioUrl.includes('/api/music') ||
      (typeof window !== 'undefined' && fullAudioUrl.startsWith(window.location.origin));

    const effectiveStreamUrl =
      !isAndroidNative() && !isSameOriginOrProxied && (fullAudioUrl.startsWith('http://') || fullAudioUrl.startsWith('https://'))
        ? apiUrl(`/api/music?action=proxy-stream&url=${encodeURIComponent(fullAudioUrl)}`)
        : fullAudioUrl;

    // On web, external streams use same-origin proxy-stream with CORS enabled; on Android native,
    // external CDN URLs may omit CORS headers and silently fail if crossOrigin='anonymous' is forced.
    if (!isAndroidNative() || isSameOriginOrProxied) {
      audio.crossOrigin = 'anonymous';
    } else {
      audio.removeAttribute('crossorigin');
    }

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
      const playToken = resolvingTokenRef.current;
      const targetTrackId = cur?.id;
      const executeNativePlay = () => {
        if (playToken !== resolvingTokenRef.current) return;
        if (targetTrackId && usePlayerStore.getState().currentTrack?.id !== targetTrackId) return;
        if (!usePlayerStore.getState().isPlaying || userInitiatedPauseRef.current) {
          setIsLoading(false);
          return;
        }
        resumeAudioContextIfNeeded();
        audio
          .play()
          .then(() => {
            if (playToken !== resolvingTokenRef.current) return;
            if (targetTrackId && usePlayerStore.getState().currentTrack?.id !== targetTrackId) return;
            if (userInitiatedPauseRef.current || !usePlayerStore.getState().isPlaying) {
              try { audio.pause(); } catch {}
              setIsLoading(false);
              return;
            }
            if (startTimeSec > 0 && Math.abs(audio.currentTime - startTimeSec) > 0.35) {
              try {
                audio.currentTime = startTimeSec;
              } catch {}
            }
            isSwitchingTrackRef.current = false;
            trackTransitionIntentRef.current = false;
            userInitiatedPauseRef.current = false;
            if (isCrossfadeTransitionRef.current && crossfadeDurationRef.current > 0) {
              const rampSec = Math.min(2.5, crossfadeDurationRef.current * 0.5);
              setSmoothOutputGain(audio, getTargetOutputGain(), rampSec * 0.35);
              isCrossfadeTransitionRef.current = false;
            } else {
              setSmoothOutputGain(audio, getTargetOutputGain(), 0.035);
            }
            setIsLoading(false);
            usePlayerStore.setState({ isPlaying: true });
          })
          .catch((err) => {
            if (err?.name === 'AbortError') {
              // Expected interruption when rapid track switching interrupts in-flight play()
              return;
            }
            if (playToken !== resolvingTokenRef.current) return;
            if (targetTrackId && usePlayerStore.getState().currentTrack?.id !== targetTrackId) return;
            console.warn('[WaveCraft] Native audio play issue:', err);
            setIsLoading(false);
            const curNow = usePlayerStore.getState().currentTrack;
            if (curNow) {
              patchTrackInStore(curNow.id, { audioUrl: undefined });
            }
            const isSuspectShort = Boolean(curNow?.duration && curNow.duration < 60);
            const effectiveYtId = isSuspectShort
              ? ''
              : curNow?.youtubeId ||
                (curNow?.id.startsWith('yt_') ? curNow.id.replace('yt_', '') : '') ||
                (curNow?.id.startsWith('yt-') ? curNow.id.replace('yt-', '') : '');
            const livePlay = Boolean(usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current);
            const fallbackAllowed = useSettingsStore.getState().streamFallbackEngine ?? true;
            if (err?.name === 'NotAllowedError') {
              usePlayerStore.setState({ isPlaying: false, isLoading: false });
            } else if (
              curNow &&
              fallbackAllowed &&
              retryAttemptRef.current < 2 &&
              effectiveYtId &&
              (typeof navigator === 'undefined' || navigator.onLine)
            ) {
              retryAttemptRef.current++;
              fallbackToYouTube({ ...curNow, audioUrl: undefined }, effectiveYtId, livePlay);
            } else if (
              curNow &&
              fallbackAllowed &&
              retryAttemptRef.current < 2 &&
              !curNow.isLocal &&
              !curNow.id.startsWith('local_') &&
              (typeof navigator === 'undefined' || navigator.onLine)
            ) {
              retryAttemptRef.current++;
              searchAndPlayYouTube({ ...curNow, audioUrl: undefined }, livePlay);
            } else if (curNow) {
              skipFailedTrack(curNow.id);
            }
          });
      };

      const activeAnchor = jamSyncEngine.getActiveAnchor();
      const hostNow = jamSyncEngine.getSynchronizedHostEpoch();
      const waitMs =
        activeAnchor?.rendezvousAt && activeAnchor.rendezvousAt > hostNow
          ? activeAnchor.rendezvousAt - hostNow
          : 0;

      if (waitMs > 15 && waitMs < 2500) {
        nativeRendezvousTimerRef.current = setTimeout(() => {
          nativeRendezvousTimerRef.current = null;
          jamSyncEngine.clearRendezvous();
          executeNativePlay();
        }, waitMs);
      } else {
        executeNativePlay();
      }
    } else {
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      setIsLoading(false);
    }
  };

  // Helper to load and start playing a track with automatic HD stream resolution
  const startTrackPlayback = (track: Track, shouldPlay: boolean, isNewTrack: boolean = true) => {
    updateMediaSessionMetadata(track);
    const audio = audioRef.current;

    // Immediately increment resolving token to discard in-flight async operations
    const resolveToken = ++resolvingTokenRef.current;

    if (isNewTrack) {
      retryAttemptRef.current = 0;
      isCrossfadingRef.current = false;
      isCrossfadeTransitionRef.current = crossfadeDurationRef.current > 0 && shouldPlay && !isNewTrack ? isCrossfadeTransitionRef.current : isCrossfadeTransitionRef.current;
      clearNativeAudioTimers();
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      bufferingStartTimeRef.current = Date.now();
      trackLoadStartTimeRef.current = Date.now();
      ytStallRecoveryCountRef.current = 0;
      isSwitchingTrackRef.current = true;
      trackTransitionIntentRef.current = true;
      userInitiatedPauseRef.current = !shouldPlay;

      // Cleanly and immediately silence both engines to prevent prior song bleed
      killYouTubeEngine();
      killNativeAudioEngine();

      activeLoadedYtIdRef.current = null;
      setIsLoading(true);
      setProgress(0, 0);
      resetAutoMixerFilters();

      // Pre-cache upcoming songs in queue for zero-gap playback and offline continuity
      const settingsSnap = useSettingsStore.getState();
      if (!settingsSnap.offlineModeOnly) {
        const { queue: currentQueue, queueIndex: currentIdx } = usePlayerStore.getState();
        const nextSong = currentQueue[currentIdx + 1];
        if (nextSong && !isTrackOffline(nextSong.id)) {
          precacheTrack(nextSong);
        }
        predictivePrecacheQueue(currentQueue, currentIdx, 3);
      }
      eagerPreloadedNextTrackIdRef.current = null;
      hasCheckedLookaheadRef.current = false;
    }

    const getLiveShouldPlay = () => Boolean(usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current);
    const formatQualityLabel = (url: string) =>
      url.includes('saavncdn')
        ? audioQualityRef.current === 'low'
          ? '96kbps Data Saver'
          : audioQualityRef.current === 'medium'
          ? '160kbps Studio AAC'
          : '320kbps Studio AAC'
        : 'HD Studio Audio';

    // 0. Instant playback for local imported files (MP3/FLAC/WAV/M4A): resolve fresh IndexedDB blob first
    if (audio && (track.isLocal || track.id.startsWith('local_'))) {
      getOfflineAudioObjectUrl(track.id)
        .then((blobUrl) => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
          const resolvedLocalUrl =
            blobUrl || (track.audioUrl && track.audioUrl.startsWith('blob:') ? track.audioUrl : null);
          if (resolvedLocalUrl) {
            playNativeAudio(resolvedLocalUrl, getLiveShouldPlay());
          } else {
            isSwitchingTrackRef.current = false;
            trackTransitionIntentRef.current = false;
            setIsLoading(false);
            usePlayerStore.setState({ isPlaying: false, isLoading: false });
          }
        })
        .catch(() => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
          if (track.audioUrl && track.audioUrl.startsWith('blob:')) {
            playNativeAudio(track.audioUrl, getLiveShouldPlay());
          } else {
            isSwitchingTrackRef.current = false;
            trackTransitionIntentRef.current = false;
            setIsLoading(false);
            usePlayerStore.setState({ isPlaying: false, isLoading: false });
          }
        });
      return;
    }

    // 1. Check Offline Audio Vault first for zero-latency local playback
    if (audio && isTrackOffline(track.id)) {
      getOfflineAudioObjectUrl(track.id)
        .then((blobUrl) => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
          if (blobUrl) {
            playNativeAudio(blobUrl, getLiveShouldPlay());
          } else if (useSettingsStore.getState().offlineModeOnly) {
            isSwitchingTrackRef.current = false;
            trackTransitionIntentRef.current = false;
            setIsLoading(false);
            usePlayerStore.setState({ isPlaying: false, isLoading: false });
          } else {
            proceedOnline();
          }
        })
        .catch(() => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
          if (useSettingsStore.getState().offlineModeOnly) {
            isSwitchingTrackRef.current = false;
            trackTransitionIntentRef.current = false;
            setIsLoading(false);
            usePlayerStore.setState({ isPlaying: false, isLoading: false });
          } else {
            proceedOnline();
          }
        });
      return;
    }

    if (offlineModeOnly) {
      console.warn('[WaveCraft] Offline Mode active: track not available in offline vault.');
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      setIsLoading(false);
      usePlayerStore.setState({ isPlaying: false, isLoading: false });
      return;
    }

    proceedOnline();

    function proceedOnline() {
      // 1b. If device is offline, check if blob exists in storage before attempting online stream
      if (typeof navigator !== 'undefined' && !navigator.onLine && audio) {
        getOfflineAudioObjectUrl(track.id)
          .then((blobUrl) => {
            if (resolveToken !== resolvingTokenRef.current) return;
            if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
            if (blobUrl) {
              playNativeAudio(blobUrl, getLiveShouldPlay());
            } else {
              isSwitchingTrackRef.current = false;
              trackTransitionIntentRef.current = false;
              setIsLoading(false);
              usePlayerStore.setState({ isPlaying: false, isLoading: false });
            }
          })
          .catch(() => {
            if (resolveToken !== resolvingTokenRef.current) return;
            isSwitchingTrackRef.current = false;
            trackTransitionIntentRef.current = false;
            setIsLoading(false);
            usePlayerStore.setState({ isPlaying: false, isLoading: false });
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
        patchTrackInStore(track.id, { audioUrl: undefined });
      }

      // 2. Direct 320kbps Audio Stream already available (MUST be full-length CDN stream, never 30s preview or throttled googlevideo)
      const isDirectCdnStream =
        Boolean(track.audioUrl) &&
        !isAudioPreviewUrl(track.audioUrl) &&
        isPlayableAudioStreamUrl(track.audioUrl);

      if (isDirectCdnStream && audio && track.audioUrl) {
        playNativeAudio(applyAudioQualityToUrl(track.audioUrl, audioQualityRef.current), getLiveShouldPlay());
        return;
      }

      const isSuspectShortId = Boolean(track.duration && track.duration < 60);
      const effectiveYtId = isSuspectShortId
        ? ''
        : track.youtubeId ||
          (track.id.startsWith('yt_') ? track.id.replace('yt_', '') : '') ||
          (track.id.startsWith('yt-') ? track.id.replace('yt-', '') : '');

      // 3. Lossless Audio First Strategy:
      // A. Check in-memory stream cache first (0ms instantaneous start)
      const cachedDirectAudio = getCachedDirectAudio(track.title, track.artist, effectiveYtId);
      if (cachedDirectAudio && isPlayableAudioStreamUrl(cachedDirectAudio) && audio) {
        const qualityUrl = applyAudioQualityToUrl(cachedDirectAudio, audioQualityRef.current);
        const qualityLabel = formatQualityLabel(qualityUrl);
        patchTrackInStore(track.id, { audioUrl: qualityUrl, quality: qualityLabel });
        playNativeAudio(qualityUrl, getLiveShouldPlay());
        return;
      }

      // B. Background Tab Continuity:
      const isHiddenMode = typeof document !== 'undefined' && document.hidden;
      if (isHiddenMode) {
        resolveDirectAudio(track.title, track.artist, track.duration, effectiveYtId)
          .then((directUrl) => {
            if (resolveToken !== resolvingTokenRef.current) return;
            if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
            const livePlay = getLiveShouldPlay();
            if (isPlayableAudioStreamUrl(directUrl) && audio) {
              const qualityUrl = applyAudioQualityToUrl(directUrl, audioQualityRef.current);
              const qualityLabel = formatQualityLabel(qualityUrl);
              patchTrackInStore(track.id, { audioUrl: qualityUrl, quality: qualityLabel });
              playNativeAudio(qualityUrl, livePlay);
            } else if (effectiveYtId) {
              fallbackToYouTube(track, effectiveYtId, livePlay);
            } else {
              searchAndPlayYouTube(track, livePlay);
            }
          })
          .catch(() => {
            if (resolveToken !== resolvingTokenRef.current) return;
            if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
            const livePlay = getLiveShouldPlay();
            if (effectiveYtId) fallbackToYouTube(track, effectiveYtId, livePlay);
            else searchAndPlayYouTube(track, livePlay);
          });
        return;
      }

      // C. Foreground Fast Race for Studio Lossless
      const directAudioPromise = resolveDirectAudio(track.title, track.artist, track.duration, effectiveYtId);
      const fastRaceTimeout = new Promise<null>((res) => setTimeout(() => res(null), 450));

      Promise.race([directAudioPromise, fastRaceTimeout])
        .then((directUrl) => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
          const livePlay = getLiveShouldPlay();

          if (directUrl && isPlayableAudioStreamUrl(directUrl) && audio) {
            const qualityUrl = applyAudioQualityToUrl(directUrl, audioQualityRef.current);
            const qualityLabel = formatQualityLabel(qualityUrl);
            patchTrackInStore(track.id, { audioUrl: qualityUrl, quality: qualityLabel });
            playNativeAudio(qualityUrl, livePlay);
          } else if (effectiveYtId) {
            fallbackToYouTube(track, effectiveYtId, livePlay);

            directAudioPromise
              .then((bgUrl) => {
                if (resolveToken !== resolvingTokenRef.current) return;
                if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
                if (bgUrl && isPlayableAudioStreamUrl(bgUrl)) {
                  const qualityUrl = applyAudioQualityToUrl(bgUrl, audioQualityRef.current);
                  const qualityLabel = formatQualityLabel(qualityUrl);
                  patchTrackInStore(track.id, { audioUrl: qualityUrl, quality: qualityLabel });
                  if (typeof document !== 'undefined' && document.hidden && getLiveShouldPlay()) {
                    const yt = getPlayer();
                    const curTime = (yt && typeof yt.getCurrentTime === 'function' ? yt.getCurrentTime() : 0) || 0;
                    playNativeAudio(qualityUrl, true, curTime);
                  }
                }
              })
              .catch(() => {});
          } else {
            searchAndPlayYouTube(track, livePlay);
          }
        })
        .catch(() => {
          if (resolveToken !== resolvingTokenRef.current) return;
          if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
          const livePlay = getLiveShouldPlay();
          if (effectiveYtId) {
            fallbackToYouTube(track, effectiveYtId, livePlay);
          } else {
            searchAndPlayYouTube(track, livePlay);
          }
        });
    }
  };

  const searchAndPlayYouTube = (track: Track, _shouldPlay: boolean) => {
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
    const getLiveShouldPlay = () => Boolean(usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current);
    const formatQualityLabel = (url: string) =>
      url.includes('saavncdn')
        ? audioQualityRef.current === 'low'
          ? '96kbps Data Saver'
          : audioQualityRef.current === 'medium'
          ? '160kbps Studio AAC'
          : '320kbps Studio AAC'
        : 'HD Studio Audio';

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
          patchTrackInStore(track.id, {
            youtubeId: ytid,
            duration: resolved?.duration || track.duration
          });
          const updatedTrack = { ...track, youtubeId: ytid, duration: resolved?.duration || track.duration };

          const audio = audioRef.current;

          // A. If direct audio is already cached in memory, play native lossless immediately (0ms)
          const cachedDirectAudio = getCachedDirectAudio(track.title, track.artist, ytid);
          if (cachedDirectAudio && isPlayableAudioStreamUrl(cachedDirectAudio) && audio) {
            const qualityUrl = applyAudioQualityToUrl(cachedDirectAudio, audioQualityRef.current);
            const qualityLabel = formatQualityLabel(qualityUrl);
            patchTrackInStore(track.id, { audioUrl: qualityUrl, quality: qualityLabel });
            playNativeAudio(qualityUrl, getLiveShouldPlay());
            return;
          }

          const isHidden = typeof document !== 'undefined' && document.hidden;
          if (isHidden) {
            resolveDirectAudio(track.title, track.artist, track.duration, ytid)
              .then((bgUrl) => {
                if (token !== resolvingTokenRef.current) return;
                if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
                const livePlay = getLiveShouldPlay();
                if (isPlayableAudioStreamUrl(bgUrl) && audio) {
                  const qualityUrl = applyAudioQualityToUrl(bgUrl, audioQualityRef.current);
                  const qualityLabel = formatQualityLabel(qualityUrl);
                  patchTrackInStore(track.id, { audioUrl: qualityUrl, quality: qualityLabel });
                  playNativeAudio(qualityUrl, livePlay);
                } else {
                  fallbackToYouTube(updatedTrack, ytid, livePlay);
                }
              })
              .catch(() => {
                if (token !== resolvingTokenRef.current) return;
                if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
                fallbackToYouTube(updatedTrack, ytid, getLiveShouldPlay());
              });
            return;
          }

          // Foreground: Fast 450ms race for Studio Lossless direct audio
          const directPromise = resolveDirectAudio(track.title, track.artist, track.duration, ytid);
          const raceTimeout = new Promise<null>((res) => setTimeout(() => res(null), 450));

          Promise.race([directPromise, raceTimeout])
            .then((directUrl) => {
              if (token !== resolvingTokenRef.current) return;
              if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
              const livePlay = getLiveShouldPlay();

              if (directUrl && isPlayableAudioStreamUrl(directUrl) && audio) {
                const qualityUrl = applyAudioQualityToUrl(directUrl, audioQualityRef.current);
                const qualityLabel = formatQualityLabel(qualityUrl);
                patchTrackInStore(track.id, { audioUrl: qualityUrl, quality: qualityLabel });
                playNativeAudio(qualityUrl, livePlay);
              } else {
                fallbackToYouTube(updatedTrack, ytid, livePlay);
                directPromise
                  .then((bgUrl) => {
                    if (token !== resolvingTokenRef.current) return;
                    if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
                    if (bgUrl && isPlayableAudioStreamUrl(bgUrl)) {
                      const qualityUrl = applyAudioQualityToUrl(bgUrl, audioQualityRef.current);
                      const qualityLabel = formatQualityLabel(qualityUrl);
                      patchTrackInStore(track.id, { audioUrl: qualityUrl, quality: qualityLabel });
                      if (typeof document !== 'undefined' && document.hidden && getLiveShouldPlay()) {
                        const yt = getPlayer();
                        const curTime = (yt && typeof yt.getCurrentTime === 'function' ? yt.getCurrentTime() : 0) || 0;
                        playNativeAudio(qualityUrl, true, curTime);
                      }
                    }
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {
              if (token !== resolvingTokenRef.current) return;
              if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
              fallbackToYouTube(updatedTrack, ytid, getLiveShouldPlay());
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
        if (usePlayerStore.getState().currentTrack?.id !== track.id) return;
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
    if (!currentTrack) {
      resolvingTokenRef.current++;
      currentTrackIdRef.current = null;
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      isCrossfadingRef.current = false;
      isCrossfadeTransitionRef.current = false;
      userInitiatedPauseRef.current = false;
      killYouTubeEngine();
      killNativeAudioEngine();
      syncAudioAnchor();
      setProgress(0, 0);
      setDuration(0);
      setIsLoading(false);
      const studioNow = useStudioStore.getState();
      if (studioNow.smartDjCrossfader !== 50) {
        studioNow.setSmartDjCrossfader(50);
      }
      return;
    }

    const isDifferentTrack = currentTrackIdRef.current !== currentTrack.id;
    const isNewPlayTrigger = playTriggerId !== undefined && playTriggerId !== lastHandledPlayTriggerRef.current;

    currentTrackIdRef.current = currentTrack.id;
    if (playTriggerId !== undefined) {
      lastHandledPlayTriggerRef.current = playTriggerId;
    }

    if (isDifferentTrack) {
      const studioNow = useStudioStore.getState();
      if (studioNow.smartDjCrossfader !== 50) {
        studioNow.setSmartDjCrossfader(50);
      }
      setDuration(currentTrack.duration || 0);
    } else if (currentTrack.duration) {
      setDuration(currentTrack.duration);
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

    const shouldPlay = usePlayerStore.getState().isPlaying || isPlaying;

    if (!isDifferentTrack) {
      // Replay ONLY if this was an EXPLICIT user play command (new playTriggerId)
      if (isNewPlayTrigger && shouldPlay) {
        trackTransitionIntentRef.current = true;
        userInitiatedPauseRef.current = false;
        isCrossfadingRef.current = false;
        isCrossfadeTransitionRef.current = false;
        seekToTime(0);
        const engine = getActiveEngine();
        if (engine === 'audio' && audioRef.current?.src) {
          audioRef.current.currentTime = 0;
          setSmoothOutputGain(audioRef.current, getTargetOutputGain(), 0.035);
          audioRef.current.play().catch(() => {
            startTrackPlayback(currentTrack, shouldPlay, true);
          });
        } else if (engine === 'youtube') {
          const yt = getPlayer();
          if (yt && window.ytPlayerReady) {
            try {
              yt.unMute?.();
              yt.setVolume?.(getYoutubeTargetVolume());
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
        syncAudioAnchor();
      }
      return;
    }

    if (shouldPlay) {
      trackTransitionIntentRef.current = true;
      userInitiatedPauseRef.current = false;
    }

    startTrackPlayback(currentTrack, shouldPlay, true);
  }, [currentTrack, playTriggerId]);

  // Proactive Queue Lookahead: Pre-resolve direct audio & YouTube ID by track ID (gated on gaplessPlayback)
  useEffect(() => {
    if (!currentTrack || queue.length === 0) return;
    if (!gaplessPlayback || offlineModeOnly) return;
    const nextIdx = queueIndex + 1;
    if (nextIdx >= queue.length) return;

    const nextTrackCandidate = queue[nextIdx];
    if (!nextTrackCandidate || nextTrackCandidate.isLocal || nextTrackCandidate.id.startsWith('local_')) return;
    if (preResolvingTrackIdRef.current === nextTrackCandidate.id) return;

    preResolvingTrackIdRef.current = nextTrackCandidate.id;
    const targetCandidateId = nextTrackCandidate.id;

    const effectiveCandidateYtId =
      nextTrackCandidate.youtubeId ||
      (nextTrackCandidate.id.startsWith('yt_') ? nextTrackCandidate.id.replace('yt_', '') : '') ||
      (nextTrackCandidate.id.startsWith('yt-') ? nextTrackCandidate.id.replace('yt-', '') : '');

    // 1. Pre-resolve direct lossless audio stream for zero-gap transitions
    if (!nextTrackCandidate.audioUrl) {
      resolveDirectAudio(
        nextTrackCandidate.title,
        nextTrackCandidate.artist,
        nextTrackCandidate.duration,
        effectiveCandidateYtId
      )
        .then((directUrl) => {
          if (isPlayableAudioStreamUrl(directUrl)) {
            const qualityUrl = applyAudioQualityToUrl(directUrl, audioQualityRef.current);
            const qualityLabel = qualityUrl.includes('saavncdn')
              ? audioQualityRef.current === 'low'
                ? '96kbps Data Saver'
                : audioQualityRef.current === 'medium'
                ? '160kbps Studio AAC'
                : '320kbps Studio AAC'
              : 'HD Studio Audio';
            patchTrackInStore(targetCandidateId, {
              audioUrl: qualityUrl,
              quality: qualityLabel
            });
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
            patchTrackInStore(targetCandidateId, {
              youtubeId: match.youtubeId,
              duration: match.duration || nextTrackCandidate.duration
            });
          }
        })
        .catch(() => {});
    }
  }, [currentTrack?.id, queueIndex, queue.length, gaplessPlayback, offlineModeOnly]);

  // Sync Play / Pause when isPlaying toggles or track switches
  useEffect(() => {
    if (!currentTrack) {
      killYouTubeEngine();
      killNativeAudioEngine();
      syncAudioAnchor();
      return;
    }
    if (!isPlaying) {
      userInitiatedPauseRef.current = true;
      trackTransitionIntentRef.current = false;
      isSwitchingTrackRef.current = false;
      if (nativeRendezvousTimerRef.current) {
        clearTimeout(nativeRendezvousTimerRef.current);
        nativeRendezvousTimerRef.current = null;
      }
      if (ytRendezvousTimerRef.current) {
        clearTimeout(ytRendezvousTimerRef.current);
        ytRendezvousTimerRef.current = null;
      }
    } else if (isSwitchingTrackRef.current || trackTransitionIntentRef.current) {
      syncAudioAnchor();
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
        const startAudioNow = () => {
          if (userInitiatedPauseRef.current || !usePlayerStore.getState().isPlaying) return;
          if (getActiveEngine() !== 'audio') return;
          if (audio.paused && audio.src) {
            resumeAudioContextIfNeeded();
            setSmoothOutputGain(audio, getTargetOutputGain(), 0.035);
            audio.play().catch(() => setIsLoading(false));
          }
        };
        const activeAnchor = jamSyncEngine.getActiveAnchor();
        const hostNow = jamSyncEngine.getSynchronizedHostEpoch();
        const waitMs =
          activeAnchor?.rendezvousAt && activeAnchor.rendezvousAt > hostNow
            ? activeAnchor.rendezvousAt - hostNow
            : 0;

        if (waitMs > 15 && waitMs < 2500) {
          if (nativeRendezvousTimerRef.current) {
            clearTimeout(nativeRendezvousTimerRef.current);
          }
          nativeRendezvousTimerRef.current = setTimeout(() => {
            nativeRendezvousTimerRef.current = null;
            jamSyncEngine.clearRendezvous();
            startAudioNow();
          }, waitMs);
        } else {
          startAudioNow();
        }
      } else {
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
              const pStore = usePlayerStore.getState();
              if (pStore.isMuted) ytPlayer.mute?.();
              else ytPlayer.unMute?.();
              ytPlayer.setVolume?.(getYoutubeTargetVolume());
            } catch {}
            const pState = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
            const effectiveYtId =
              currentTrack.youtubeId ||
              (currentTrack.id.startsWith('yt_') ? currentTrack.id.replace('yt_', '') : '') ||
              (currentTrack.id.startsWith('yt-') ? currentTrack.id.replace('yt-', '') : '');

            if (activeLoadedYtIdRef.current === effectiveYtId && effectiveYtId) {
              const activeAnchor = jamSyncEngine.getActiveAnchor();
              const hostNow = jamSyncEngine.getSynchronizedHostEpoch();
              const waitMs =
                activeAnchor?.rendezvousAt && activeAnchor.rendezvousAt > hostNow
                  ? activeAnchor.rendezvousAt - hostNow
                  : 0;

              if (waitMs > 15 && waitMs < 2500) {
                if (ytRendezvousTimerRef.current) {
                  clearTimeout(ytRendezvousTimerRef.current);
                }
                const rToken = resolvingTokenRef.current;
                const rTrackId = currentTrack.id;
                ytRendezvousTimerRef.current = setTimeout(() => {
                  ytRendezvousTimerRef.current = null;
                  jamSyncEngine.clearRendezvous();
                  if (rToken !== resolvingTokenRef.current) return;
                  if (getActiveEngine() !== 'youtube') return;
                  if (usePlayerStore.getState().currentTrack?.id !== rTrackId) return;
                  if (userInitiatedPauseRef.current || !usePlayerStore.getState().isPlaying) return;
                  ytPlayer.playVideo?.();
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
            ytPlayer.pauseVideo();
          }
        }
      }
    }

    syncAudioAnchor();
  }, [currentTrack?.id, isPlaying]);

  // Browser Background Audio & System MediaSession Keepalive Anchor
  useEffect(() => {
    syncAudioAnchor();
  }, [isPlaying, currentTrack?.id]);

  // Seamless Background Continuity:
  // When app is minimized or phone screen is locked, verify playback continues uninterrupted
  useEffect(() => {
    const ensureBackgroundPlayback = () => {
      const storeNow = usePlayerStore.getState();
      if (storeNow.isPlaying && !userInitiatedPauseRef.current) {
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
          const curTrack = storeNow.currentTrack;
          if (isHidden && curTrack) {
            const ytPlayer = getPlayer();
            const curTime = (ytPlayer && typeof ytPlayer.getCurrentTime === 'function' ? ytPlayer.getCurrentTime() : 0) || 0;
            if (curTrack.audioUrl && isPlayableAudioStreamUrl(curTrack.audioUrl)) {
              playNativeAudio(applyAudioQualityToUrl(curTrack.audioUrl, audioQualityRef.current), true, curTime);
              return;
            } else {
              const effectiveId =
                activeLoadedYtIdRef.current ||
                curTrack.youtubeId ||
                (curTrack.id.startsWith('yt_') ? curTrack.id.replace('yt_', '') : '');
              const bgToken = resolvingTokenRef.current;
              const bgTrackId = curTrack.id;
              resolveDirectAudio(curTrack.title, curTrack.artist, curTrack.duration, effectiveId)
                .then((bgUrl) => {
                  if (bgToken !== resolvingTokenRef.current) return;
                  if (usePlayerStore.getState().currentTrack?.id !== bgTrackId) return;
                  if (
                    isPlayableAudioStreamUrl(bgUrl) &&
                    !userInitiatedPauseRef.current &&
                    usePlayerStore.getState().isPlaying
                  ) {
                    const qualityUrl = applyAudioQualityToUrl(bgUrl, audioQualityRef.current);
                    const qualityLabel = qualityUrl.includes('saavncdn')
                      ? audioQualityRef.current === 'low'
                        ? '96kbps Data Saver'
                        : audioQualityRef.current === 'medium'
                        ? '160kbps Studio AAC'
                        : '320kbps Studio AAC'
                      : 'HD Studio Audio';
                    patchTrackInStore(bgTrackId, { audioUrl: qualityUrl, quality: qualityLabel });
                    const yt2 = getPlayer();
                    const curTime2 = (yt2 && typeof yt2.getCurrentTime === 'function' ? yt2.getCurrentTime() : 0) || 0;
                    playNativeAudio(qualityUrl, true, curTime2);
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

    const visTimers: Array<ReturnType<typeof setTimeout>> = [];
    const scheduleBackgroundCheck = () => {
      ensureBackgroundPlayback();
      visTimers.push(setTimeout(ensureBackgroundPlayback, 150));
      visTimers.push(setTimeout(ensureBackgroundPlayback, 600));
    };

    document.addEventListener('visibilitychange', scheduleBackgroundCheck);

    let isDisposed = false;
    let capHandle: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          scheduleBackgroundCheck();
        } else {
          ensureBackgroundPlayback();
        }
      })
        .then((h) => {
          if (isDisposed) {
            try { h.remove(); } catch {}
          } else {
            capHandle = h;
          }
        })
        .catch(() => {});
    }

    return () => {
      isDisposed = true;
      document.removeEventListener('visibilitychange', scheduleBackgroundCheck);
      visTimers.forEach((id) => clearTimeout(id));
      if (capHandle) {
        try { capHandle.remove(); } catch {}
      }
    };
  }, [isPlaying, currentTrack?.id]);

  // Sync Volume, Mute, Normalization, & Audio Quality
  useEffect(() => {
    syncActiveOutputGain(0.02);
    if (audioRef.current && !hasWebAudioGain()) {
      audioRef.current.muted = isMuted;
    }

    const ytPlayer = getPlayer();
    if (ytPlayer && window.ytPlayerReady) {
      try {
        ytPlayer.setPlaybackQuality?.(getYtQualityForSetting(audioQuality));
      } catch {}
    }
    if (getActiveEngine() !== 'youtube' && ytPlayer && window.ytPlayerReady) {
      try {
        ytPlayer.mute?.();
        ytPlayer.setVolume?.(0);
      } catch {}
    }
  }, [volume, isMuted, loudnessNormalization, audioQuality]);

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
      const storeSnap = usePlayerStore.getState();
      const liveTrack = storeSnap.currentTrack;
      if (
        getActiveEngine() === 'youtube' &&
        ytPlayer &&
        storeSnap.isPlaying &&
        !isSwitchingTrackRef.current &&
        window.ytPlayerReady &&
        typeof ytPlayer.getCurrentTime === 'function'
      ) {
        const current = ytPlayer.getCurrentTime() || 0;
        const duration = ytPlayer.getDuration?.() || liveTrack?.duration || 1;
        if (duration > 0) {
          if (Math.abs(current - lastReportedYtTime) >= 0.25 || current < 0.15) {
            lastReportedYtTime = current;
            setProgress((current / duration) * 100, current);
          }
          if (
            duration > 0 &&
            !isNaN(duration) &&
            isFinite(duration) &&
            Math.abs(duration - storeSnap.duration) > 0.5
          ) {
            setDuration(duration);
          }

          // Eager lookahead for upcoming track in background / zero-gap queue transition
          if (gaplessPlayback && !offlineModeOnly && duration > 5 && current >= 5.0 && !hasCheckedLookaheadRef.current) {
            hasCheckedLookaheadRef.current = true;
            const nextSong = storeSnap.queue[storeSnap.queueIndex + 1];
            if (
              nextSong &&
              !nextSong.audioUrl &&
              !nextSong.isLocal &&
              !nextSong.id.startsWith('local_') &&
              eagerPreloadedNextTrackIdRef.current !== nextSong.id
            ) {
              eagerPreloadedNextTrackIdRef.current = nextSong.id;
              const nextSongId = nextSong.id;
              const effNextYt = nextSong.youtubeId || (nextSong.id.startsWith('yt_') ? nextSong.id.replace('yt_', '') : '');
              resolveDirectAudio(nextSong.title, nextSong.artist, nextSong.duration, effNextYt)
                .then((directUrl) => {
                  if (isPlayableAudioStreamUrl(directUrl)) {
                    const qualityUrl = applyAudioQualityToUrl(directUrl, audioQualityRef.current);
                    const qualityLabel = qualityUrl.includes('saavncdn')
                      ? audioQualityRef.current === 'low'
                        ? '96kbps Data Saver'
                        : audioQualityRef.current === 'medium'
                        ? '160kbps Studio AAC'
                        : '320kbps Studio AAC'
                      : 'HD Studio Audio';
                    patchTrackInStore(nextSongId, { audioUrl: qualityUrl, quality: qualityLabel });
                  }
                })
                .catch(() => {});
            }
          }

          // Smooth Audio Crossfading when approaching end of track
          const fadeSec = crossfadeDurationRef.current;
          const isRepeatOne = storeSnap.repeatMode === 'one';
          if (
            fadeSec > 0 &&
            !isRepeatOne &&
            duration > 15 &&
            current >= duration - fadeSec &&
            !isCrossfadingRef.current &&
            !trackTransitionIntentRef.current
          ) {
            isCrossfadingRef.current = true;
            isCrossfadeTransitionRef.current = true;
            const startVol = getYoutubeTargetVolume();
            const stepMs = 120;
            const totalSteps = Math.max(1, Math.floor((fadeSec * 1000) / stepMs));
            let step = 0;
            if (fadeIntervalRef.current) {
              clearInterval(fadeIntervalRef.current);
            }
            const crossfadeTrackId = liveTrack?.id;
            fadeIntervalRef.current = setInterval(() => {
              if (getActiveEngine() !== 'youtube' || usePlayerStore.getState().currentTrack?.id !== crossfadeTrackId) {
                if (fadeIntervalRef.current) {
                  clearInterval(fadeIntervalRef.current);
                  fadeIntervalRef.current = null;
                }
                return;
              }
              step++;
              const curVol = Math.max(0, startVol * (1 - step / totalSteps));
              try { ytPlayer.setVolume?.(Math.round(curVol)); } catch {}
              if (step >= totalSteps) {
                if (fadeIntervalRef.current) {
                  clearInterval(fadeIntervalRef.current);
                  fadeIntervalRef.current = null;
                }
                if (trackTransitionIntentRef.current) return;
                advanceNextTrackSilent();
              }
            }, stepMs);
          }
        }

        // Proactive Multi-Stage Buffering Stall Recovery Watchdog
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
                playNativeAudio(applyAudioQualityToUrl(curTrack.audioUrl, audioQualityRef.current), true, curTime);
              } else {
                const bgToken = resolvingTokenRef.current;
                const bgTrackId = curTrack.id;
                resolveDirectAudio(curTrack.title, curTrack.artist, curTrack.duration, effectiveId)
                  .then((bgUrl) => {
                    if (bgToken !== resolvingTokenRef.current) return;
                    if (usePlayerStore.getState().currentTrack?.id !== bgTrackId) return;
                    if (
                      isPlayableAudioStreamUrl(bgUrl) &&
                      !userInitiatedPauseRef.current &&
                      usePlayerStore.getState().isPlaying
                    ) {
                      const qualityUrl = applyAudioQualityToUrl(bgUrl, audioQualityRef.current);
                      const qualityLabel = qualityUrl.includes('saavncdn')
                        ? audioQualityRef.current === 'low'
                          ? '96kbps Data Saver'
                          : audioQualityRef.current === 'medium'
                          ? '160kbps Studio AAC'
                          : '320kbps Studio AAC'
                        : 'HD Studio Audio';
                      patchTrackInStore(bgTrackId, { audioUrl: qualityUrl, quality: qualityLabel });
                      playNativeAudio(qualityUrl, true, curTime);
                    }
                  })
                  .catch(() => {});
              }
            }
          } else if (!isHidden) {
            // Tier 1 (after 2.4s)
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
            // Tier 2 (after 5.0s)
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
            // Tier 3 (after 8.0s): Hard Recovery
            else if (stallMs >= 8000) {
              bufferingStartTimeRef.current = 0;
              trackLoadStartTimeRef.current = 0;
              ytStallRecoveryCountRef.current = 0;
              const curTrack = usePlayerStore.getState().currentTrack;
              if (curTrack && streamFallbackEngine && retryAttemptRef.current < 2) {
                retryAttemptRef.current++;
                console.warn(
                  `[WaveCraft] Stream stalled > 8s for "${curTrack.title}". Attempting automatic alternative search #${retryAttemptRef.current}...`
                );
                patchTrackInStore(curTrack.id, { youtubeId: undefined });
                const livePlay = Boolean(usePlayerStore.getState().isPlaying && !userInitiatedPauseRef.current);
                searchAndPlayYouTubeRef.current?.({ ...curTrack, youtubeId: undefined }, livePlay);
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
  }, [isPlaying, setProgress, setDuration, crossfadeDuration, gaplessPlayback, offlineModeOnly, streamFallbackEngine]);

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
