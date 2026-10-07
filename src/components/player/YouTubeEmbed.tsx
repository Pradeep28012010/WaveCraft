import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStudioStore } from '../../stores/studioStore';
import { searchTracks, findStrictTrackMatch } from '../../services/youtube';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import { getOfflineAudioObjectUrl, isTrackOffline } from '../../services/offlineVault';
import { resolveDirectAudio } from '../../services/streamResolver';
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
  seekToTime
} from '../../services/audioEngine';
import { jamSyncEngine } from '../../services/jamSyncEngine';
import { isAndroidNative, PROD_API_ORIGIN } from '../../services/apiConfig';
import {
  startAndroidBackgroundAudio,
  stopAndroidBackgroundAudio
} from '../../services/nativeAndroid';
import type { Track } from '../../types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
    ytPlayerReady: boolean;
  }
}

// Re-export audio engine controls so existing consumers continue to work seamlessly
export { getAudioFrequencyData, getPlayer, unlockAudioEngine, seekToTime };

export default function YouTubeEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastRecordedTrackId = useRef<string | null>(null);
  const isFetchingAutoplay = useRef<boolean>(false);
  const trackTransitionIntentRef = useRef<boolean>(false);
  const userInitiatedPauseRef = useRef<boolean>(false);
  const isSwitchingTrackRef = useRef<boolean>(false);
  const activeLoadedYtIdRef = useRef<string | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const resolvingTokenRef = useRef<number>(0);
  const preResolvingIndexRef = useRef<number>(-1);

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

  const eqBands = useSettingsStore((s) => s.equalizerBands);
  const autoplay = useSettingsStore((s) => s.autoplay);
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

  // Proactively unlock AudioContext and HTMLAudioElement on first user touch / pointer interaction
  useEffect(() => {
    const unlockOnInteraction = () => {
      unlockAudioEngine();
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
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setIsLoading(false);
    };

    const onCanPlay = () => {
      if (getActiveEngine() === 'audio') {
        setIsLoading(false);
      }
    };

    const onTimeUpdate = () => {
      if (getActiveEngine() !== 'audio') return;
      const cur = audio.currentTime || 0;
      const dur = audio.duration || currentTrack?.duration || 1;

      if (Math.abs(cur - lastReportedTime) >= 0.08 || cur < 0.15) {
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
    };

    const onEnded = () => {
      if (getActiveEngine() !== 'audio') return;
      const studio = useStudioStore.getState();
      if (studio.sleepActive && studio.sleepEndAtTrack) {
        studio.stopSleepTimer();
        usePlayerStore.getState().pause();
        return;
      }
      const pState = usePlayerStore.getState();
      if (pState.repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      if (
        pState.repeatMode === 'off' &&
        pState.queueIndex >= pState.queue.length - 1 &&
        useSettingsStore.getState().autoplay &&
        pState.currentTrack
      ) {
        getSmartRecommendations(pState.currentTrack, pState.queue, 8)
          .then((recs) => {
            if (recs.length > 0) {
              const existingIds = new Set(usePlayerStore.getState().queue.map((t) => t.id));
              const fresh = recs.filter((t) => !existingIds.has(t.id));
              fresh.forEach((t) => usePlayerStore.getState().addToQueue(t));
              usePlayerStore.getState().nextTrack();
            } else {
              nextTrack();
            }
          })
          .catch(() => {
            nextTrack();
          });
        return;
      }
      nextTrack();
    };

    const onWaiting = () => {
      if (getActiveEngine() === 'audio') setIsLoading(true);
    };

    const onPlaying = () => {
      if (getActiveEngine() === 'audio') {
        setIsLoading(false);
      }
    };

    const onError = () => {
      if (getActiveEngine() !== 'audio') return;
      const cur = usePlayerStore.getState().currentTrack;
      const effectiveYtId =
        cur?.youtubeId ||
        (cur?.id.startsWith('yt_') ? cur.id.replace('yt_', '') : '') ||
        (cur?.id.startsWith('yt-') ? cur.id.replace('yt-', '') : '');
      const ytPlayer = getPlayer();
      if (
        effectiveYtId &&
        ytPlayer &&
        window.ytPlayerReady &&
        (typeof navigator === 'undefined' || navigator.onLine)
      ) {
        setActiveEngine('youtube');
        setIsLoading(true);
        if (usePlayerStore.getState().isPlaying) {
          ytPlayer.loadVideoById?.(effectiveYtId);
        } else {
          ytPlayer.cueVideoById?.(effectiveYtId);
        }
        return;
      }
      setIsLoading(false);
      nextTrack();
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
  }, [nextTrack, setDuration, setIsLoading, setProgress, currentTrack?.duration]);

  // Initialize YouTube IFrame Player (Primary and sole streaming engine)
  useEffect(() => {
    if (window.ytPlayerReady && getPlayer()) return;

    const initPlayer = () => {
      if (!containerRef.current || !window.YT || !window.YT.Player) return;

      const ytOrigin =
        isAndroidNative() ||
        window.location.origin.includes('localhost') ||
        window.location.origin.includes('capacitor://')
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
          onReady: (e: any) => {
            window.ytPlayerReady = true;
            const state = usePlayerStore.getState();
            e.target.setVolume((state.volume ?? 0.8) * 100);
            if (state.isMuted) e.target.mute();

            // Force minimal video quality for audio streaming data savings (144p)
            try {
              e.target.setPlaybackQuality?.('small');
            } catch {}

            const cur = state.currentTrack;
            const effectiveId =
              cur?.youtubeId ||
              (cur?.id.startsWith('yt_') ? cur.id.replace('yt_', '') : '') ||
              (cur?.id.startsWith('yt-') ? cur.id.replace('yt-', '') : '');

            if (effectiveId) {
              activeLoadedYtIdRef.current = effectiveId;
              setActiveEngine('youtube');
              if (state.isPlaying) {
                e.target.loadVideoById(effectiveId);
              } else {
                // Cue only on refresh so data isn't consumed and audio doesn't start unexpectedly
                e.target.cueVideoById(effectiveId);
              }
            }
          },
          onStateChange: (e: any) => {
            if (getActiveEngine() !== 'youtube') {
              if (e.data === window.YT?.PlayerState?.PLAYING) {
                try { e.target.stopVideo?.(); } catch {}
              }
              return;
            }
            const state = e.data;
            if (state === window.YT.PlayerState.ENDED) {
              const studio = useStudioStore.getState();
              if (studio.sleepActive && studio.sleepEndAtTrack) {
                studio.stopSleepTimer();
                usePlayerStore.getState().pause();
                return;
              }
              const pState = usePlayerStore.getState();
              if (pState.repeatMode === 'one') {
                e.target.seekTo(0);
                e.target.playVideo();
                return;
              }
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
              trackTransitionIntentRef.current = true;
              usePlayerStore.getState().nextTrack();
            } else if (state === window.YT.PlayerState.PLAYING) {
              isSwitchingTrackRef.current = false;
              trackTransitionIntentRef.current = false;
              userInitiatedPauseRef.current = false;
              usePlayerStore.setState({ isPlaying: true, isLoading: false });
              const dur = e.target.getDuration?.();
              if (dur && dur > 0) {
                usePlayerStore.getState().setDuration(dur);
              }
              try {
                e.target.setPlaybackQuality?.('small');
              } catch {}
            } else if (state === window.YT.PlayerState.PAUSED) {
              // Ignore transient PAUSED event during track transition or when awaiting a new track
              if (isSwitchingTrackRef.current || trackTransitionIntentRef.current) {
                return;
              }
              // If paused automatically by Chromium/YouTube when app was minimized or document hidden:
              if (!userInitiatedPauseRef.current && (typeof document !== 'undefined' && document.hidden)) {
                try {
                  e.target.playVideo?.();
                } catch {}
                return;
              }
              usePlayerStore.setState({ isPlaying: false, isLoading: false });
            } else if (state === window.YT.PlayerState.BUFFERING) {
              usePlayerStore.getState().setIsLoading(true);
            } else if (state === window.YT.PlayerState.CUED) {
              if (isSwitchingTrackRef.current || trackTransitionIntentRef.current) {
                return;
              }
              usePlayerStore.setState({ isPlaying: false, isLoading: false });
            }
          },
          onError: () => {
            if (getActiveEngine() !== 'youtube') return;
            trackTransitionIntentRef.current = true;
            userInitiatedPauseRef.current = false;
            usePlayerStore.getState().setIsLoading(false);
            usePlayerStore.getState().nextTrack();
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
  }, []);

  // Helper to fallback or play on YouTube IFrame
  const fallbackToYouTube = (_track: Track, effectiveYtId: string, shouldPlay: boolean) => {
    const audio = audioRef.current;
    if (audio) {
      try { audio.pause(); } catch {}
      audio.loop = true;
      audio.src =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      if (shouldPlay) {
        audio.play().catch(() => {});
      }
    }
    setActiveEngine('youtube');
    const ytPlayer = getPlayer();
    if (!ytPlayer || !window.ytPlayerReady) return;

    if (activeLoadedYtIdRef.current === effectiveYtId) {
      isSwitchingTrackRef.current = false;
      trackTransitionIntentRef.current = false;
      if (shouldPlay) {
        ytPlayer.playVideo?.();
      } else {
        ytPlayer.pauseVideo?.();
      }
      return;
    }

    activeLoadedYtIdRef.current = effectiveYtId;
    isSwitchingTrackRef.current = true;
    trackTransitionIntentRef.current = true;
    setIsLoading(true);
    setProgress(0, 0);

    if (shouldPlay) {
      if (typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(effectiveYtId);
      }
      try {
        ytPlayer.setPlaybackQuality?.('small');
      } catch {}

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
  const playNativeAudio = (targetUrl: string, shouldPlay: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;

    const ytPlayer = getPlayer();
    if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.pauseVideo === 'function') {
      try {
        ytPlayer.pauseVideo();
      } catch {}
    }

    activeLoadedYtIdRef.current = null;
    setActiveEngine('audio');
    setIsLoading(true);
    setProgress(0, 0);

    audio.loop = false;
    if (audio.src !== targetUrl) {
      audio.src = targetUrl;
      audio.load();
    }
    applyStudioFXToAudio(audio, useStudioStore.getState().fxMode, playbackSpeed || 1);

    if (shouldPlay) {
      resumeAudioContextIfNeeded();
      audio
        .play()
        .then(() => {
          isSwitchingTrackRef.current = false;
          trackTransitionIntentRef.current = false;
          userInitiatedPauseRef.current = false;
          setSmoothOutputGain(audio, getTargetOutputGain(), 0.03);
          setIsLoading(false);
          usePlayerStore.setState({ isPlaying: true });
        })
        .catch((err) => {
          console.warn('[WaveCraft] Native audio play issue:', err);
          setIsLoading(false);
          const cur = usePlayerStore.getState().currentTrack;
          const effectiveYtId =
            cur?.youtubeId ||
            (cur?.id.startsWith('yt_') ? cur.id.replace('yt_', '') : '') ||
            (cur?.id.startsWith('yt-') ? cur.id.replace('yt-', '') : '');
          if (cur && effectiveYtId && (typeof navigator === 'undefined' || navigator.onLine)) {
            fallbackToYouTube(cur, effectiveYtId, true);
          } else if (err?.name === 'NotAllowedError') {
            usePlayerStore.getState().pause();
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
    const audio = audioRef.current;

    // Immediately increment resolving token to discard in-flight async operations
    const resolveToken = ++resolvingTokenRef.current;

    if (isNewTrack) {
      isSwitchingTrackRef.current = true;
      trackTransitionIntentRef.current = true;
      userInitiatedPauseRef.current = false;

      // Cleanly and immediately silence both engines to prevent prior song bleed
      if (audio) {
        try { audio.pause(); } catch {}
      }
      const ytPlayer = getPlayer();
      if (ytPlayer && window.ytPlayerReady) {
        try { ytPlayer.pauseVideo?.(); } catch {}
      }

      activeLoadedYtIdRef.current = null;
      setIsLoading(true);
      setProgress(0, 0);
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

      // 2. Direct 320kbps Audio Stream already available (skip Spotify previews)
      const isDirectCdnStream =
        Boolean(track.audioUrl) &&
        !track.audioUrl!.includes('p.scdn.co') &&
        (track.audioUrl!.startsWith('https://aac.saavncdn.com') ||
         track.audioUrl!.startsWith('blob:') ||
         track.audioUrl!.endsWith('.mp4') ||
         track.audioUrl!.endsWith('.mp3'));

      if (isDirectCdnStream && audio) {
        playNativeAudio(track.audioUrl!, shouldPlay);
        return;
      }

      const effectiveYtId =
        track.youtubeId ||
        (track.id.startsWith('yt_') ? track.id.replace('yt_', '') : '') ||
        (track.id.startsWith('yt-') ? track.id.replace('yt-', '') : '');

      // 3. Proactively resolve Direct 320kbps Audio Stream for full Web Audio 8D & Live Concert
      if (audio && (track.title || track.artist)) {
        setIsLoading(true);
        resolveDirectAudio(track.title, track.artist, track.duration, effectiveYtId)
          .then((resolvedUrl) => {
            if (resolveToken !== resolvingTokenRef.current) return;
            if (usePlayerStore.getState().currentTrack?.id !== track.id) return;

            if (resolvedUrl) {
              track.audioUrl = resolvedUrl;
              track.quality = '320kbps Studio AAC';
              usePlayerStore.setState((s) => ({
                currentTrack:
                  s.currentTrack?.id === track.id
                    ? { ...s.currentTrack, audioUrl: resolvedUrl, quality: '320kbps Studio AAC' }
                    : s.currentTrack,
                queue: s.queue.map((t) =>
                  t.id === track.id
                    ? { ...t, audioUrl: resolvedUrl, quality: '320kbps Studio AAC' }
                    : t
                )
              }));
              playNativeAudio(resolvedUrl, shouldPlay);
            } else if (effectiveYtId) {
              fallbackToYouTube(track, effectiveYtId, shouldPlay);
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
        return;
      }

      // 4. Pure YouTube Playback Fallback
      if (effectiveYtId) {
        fallbackToYouTube(track, effectiveYtId, shouldPlay);
        return;
      }

      // 5. Fallback: Search YouTube
      searchAndPlayYouTube(track, shouldPlay);
    }
  };

  const searchAndPlayYouTube = (track: Track, shouldPlay: boolean) => {
    isSwitchingTrackRef.current = true;
    trackTransitionIntentRef.current = true;
    const ytPlayer = getPlayer();
    if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.pauseVideo === 'function') {
      try {
        ytPlayer.pauseVideo();
      } catch {}
    }
    activeLoadedYtIdRef.current = null;
    setIsLoading(true);
    setProgress(0, 0);

    const token = ++resolvingTokenRef.current;
    searchTracks(`${track.title} ${track.artist}`)
      .then((results) => {
        if (token !== resolvingTokenRef.current) return;
        if (usePlayerStore.getState().currentTrack?.id !== track.id) return;

        const best = findStrictTrackMatch(track.title, track.artist, results, track.duration);
        const resolved = best || (results.length > 0 ? results[0] : null);

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
          fallbackToYouTube(track, ytid, shouldPlay);
        } else if (resolved?.audioUrl) {
          track.audioUrl = resolved.audioUrl;
          usePlayerStore.setState((s) => ({
            currentTrack:
              s.currentTrack?.id === track.id
                ? { ...s.currentTrack, audioUrl: resolved.audioUrl, quality: resolved.quality || '320kbps Studio AAC' }
                : s.currentTrack,
            queue: s.queue.map((t) =>
              t.id === track.id
                ? { ...t, audioUrl: resolved.audioUrl, quality: resolved.quality || '320kbps Studio AAC' }
                : t
            )
          }));
          playNativeAudio(resolved.audioUrl, shouldPlay);
        } else {
          console.warn(`[WaveCraft] Could not match audio stream for: "${track.title}" by "${track.artist}"`);
          setIsLoading(false);
          isSwitchingTrackRef.current = false;
          trackTransitionIntentRef.current = false;
          usePlayerStore.getState().nextTrack();
        }
      })
      .catch((err) => {
        if (token !== resolvingTokenRef.current) return;
        console.warn('[WaveCraft] Stream resolution network error:', err);
        setIsLoading(false);
        isSwitchingTrackRef.current = false;
        trackTransitionIntentRef.current = false;
      });
  };

  // Load new track when currentTrack changes
  useEffect(() => {
    if (!currentTrack) return;

    const isDifferentTrack = currentTrackIdRef.current !== currentTrack.id;
    currentTrackIdRef.current = currentTrack.id;

    if (isDifferentTrack && lastRecordedTrackId.current !== currentTrack.id) {
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
    if (shouldPlay) {
      trackTransitionIntentRef.current = true;
      userInitiatedPauseRef.current = false;
    }

    if (!isDifferentTrack) {
      // If user clicked the same track to replay from start (progress & currentTime reset to 0)
      if (usePlayerStore.getState().currentTime === 0 && usePlayerStore.getState().progress === 0 && shouldPlay) {
        seekToTime(0);
        if (audioRef.current && getActiveEngine() === 'audio') {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
        const yt = getPlayer();
        if (yt && getActiveEngine() === 'youtube') {
          try {
            yt.seekTo?.(0, true);
            yt.playVideo?.();
          } catch {}
        }
      }
      return;
    }

    startTrackPlayback(currentTrack, shouldPlay, true);
  }, [currentTrack]);

  // Proactive Queue Lookahead: Pre-resolve YouTube ID for next track in queue so Next is always instant
  useEffect(() => {
    if (!currentTrack || queue.length === 0) return;
    const nextIdx = queueIndex + 1;
    if (nextIdx >= queue.length) return;
    if (preResolvingIndexRef.current === nextIdx) return;

    const nextTrackCandidate = queue[nextIdx];
    if (!nextTrackCandidate) return;

    const hasYtId =
      nextTrackCandidate.youtubeId ||
      nextTrackCandidate.id.startsWith('yt_') ||
      nextTrackCandidate.id.startsWith('yt-');

    if (!hasYtId) {
      preResolvingIndexRef.current = nextIdx;
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

    // Pre-resolve 320kbps audioUrl so next track starts immediately with 8D and Live Concert DSP
    if (!nextTrackCandidate.audioUrl) {
      resolveDirectAudio(nextTrackCandidate.title, nextTrackCandidate.artist, nextTrackCandidate.duration)
        .then((resolvedUrl) => {
          if (resolvedUrl) {
            usePlayerStore.setState((s) => ({
              queue: s.queue.map((t, idx) =>
                idx === nextIdx
                  ? { ...t, audioUrl: resolvedUrl, quality: '320kbps Studio AAC' }
                  : t
              )
            }));
          }
        })
        .catch(() => {});
    }
  }, [currentTrack, queueIndex, queue]);

  // Sync Play / Pause when isPlaying toggles on the current track
  useEffect(() => {
    if (!currentTrack) return;
    if (isPlaying) {
      startAndroidBackgroundAudio(currentTrack.title, currentTrack.artist);
    } else {
      stopAndroidBackgroundAudio();
    }
    if (isSwitchingTrackRef.current || trackTransitionIntentRef.current) {
      return;
    }
    if (getActiveEngine() === 'audio' && audioRef.current) {
      const audio = audioRef.current;
      if (isPlaying) {
        userInitiatedPauseRef.current = false;
        if (audio.paused && audio.src) {
          resumeAudioContextIfNeeded();
          audio.play().catch(() => setIsLoading(false));
        }
      } else {
        audio.pause();
      }
    } else if (getActiveEngine() === 'youtube') {
      if (audioRef.current) {
        if (isPlaying) {
          if (!audioRef.current.src || !audioRef.current.src.startsWith('data:audio/wav')) {
            audioRef.current.loop = true;
            audioRef.current.src =
              'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
          }
          audioRef.current.play().catch(() => {});
        } else {
          audioRef.current.pause();
        }
      }
      if (window.ytPlayerReady) {
        const ytPlayer = getPlayer();
        if (ytPlayer) {
          if (isPlaying) {
            userInitiatedPauseRef.current = false;
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
                try {
                  ytPlayer.setPlaybackQuality?.('small');
                } catch {}
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
  }, [isPlaying]);

  // Sync Volume & Mute
  useEffect(() => {
    if (audioRef.current) {
      if (hasWebAudioGain()) {
        setSmoothOutputGain(audioRef.current, getTargetOutputGain(), 0.02);
      } else {
        audioRef.current.muted = isMuted;
        audioRef.current.volume = isMuted ? 0 : volume;
      }
    }
    const ytPlayer = getPlayer();
    if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.setVolume === 'function') {
      if (useStudioStore.getState().fxMode !== '8d-orbit') {
        ytPlayer.setVolume(volume * 100);
      }
      if (isMuted) ytPlayer.mute?.();
      else ytPlayer.unMute?.();
    }
  }, [volume, isMuted]);

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

  // Progress Tracker for YouTube engine
  useEffect(() => {
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
          setProgress((current / duration) * 100, current);
          setDuration(duration);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPlaying, setProgress, setDuration, currentTrack?.duration]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: '320px',
        height: '180px',
        opacity: 0.001,
        pointerEvents: 'none',
        zIndex: -9999,
        overflow: 'hidden'
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
        crossOrigin="anonymous"
      />
    </div>
  );
}
