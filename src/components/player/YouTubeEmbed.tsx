import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStudioStore } from '../../stores/studioStore';
import { searchTracks, findStrictTrackMatch } from '../../services/youtube';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import { getOfflineAudioObjectUrl, isTrackOffline } from '../../services/offlineVault';
import {
  setHtmlAudioElement,
  setYtPlayerInstance,
  getPlayer,
  getActiveEngine,
  setActiveEngine,
  setSmoothOutputGain,
  syncHeadroomAndEQ,
  applyStudioFXToAudio,
  getAudioFrequencyData,
  unlockAudioEngine,
  seekToTime
} from '../../services/audioEngine';
import { jamSyncEngine } from '../../services/jamSyncEngine';
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
  const activeLoadedTrackKeyRef = useRef<string | null>(null);
  const isFetchingAutoplay = useRef<boolean>(false);
  const resolvingTrackIdRef = useRef<string | null>(null);

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
  const vocalMode = useStudioStore((s) => s.vocalMode);
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

  // Sync 10-band Equalizer gains + Studio FX in real time
  useEffect(() => {
    syncHeadroomAndEQ(eqBands, fxMode);
    applyStudioFXToAudio(audioRef.current, fxMode, playbackSpeed || 1);
  }, [
    eqBands,
    fxMode,
    playbackSpeed,
    vocalMode,
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

  // Initialize HTML5 Audio (retained exclusively for offline vault cached audio)
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audioRef.current = audio;
      setHtmlAudioElement(audio);
    }

    const audio = audioRef.current;
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

      const player = new window.YT.Player(containerRef.current, {
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
            if (state.isMuted) e.target.mute();

            if (state.currentTrack?.youtubeId) {
              setActiveEngine('youtube');
              e.target.loadVideoById(state.currentTrack.youtubeId);
              if (state.isPlaying) e.target.playVideo();
            }
          },
          onStateChange: (e: any) => {
            if (getActiveEngine() !== 'youtube') return;
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
              usePlayerStore.getState().nextTrack();
            } else if (state === window.YT.PlayerState.PLAYING) {
              usePlayerStore.getState().setIsLoading(false);
              const dur = e.target.getDuration?.();
              if (dur && dur > 0) {
                usePlayerStore.getState().setDuration(dur);
              }
            } else if (state === window.YT.PlayerState.BUFFERING) {
              usePlayerStore.getState().setIsLoading(true);
            } else if (state === window.YT.PlayerState.CUED) {
              usePlayerStore.getState().setIsLoading(false);
            }
          },
          onError: () => {
            if (getActiveEngine() !== 'youtube') return;
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

  // Helper to load and start playing a track with zero ambiguity
  const startTrackPlayback = (track: Track, shouldPlay: boolean) => {
    const audio = audioRef.current;

    // 1. Check Offline Audio Vault first for zero-latency local playback
    if (audio && isTrackOffline(track.id)) {
      getOfflineAudioObjectUrl(track.id)
        .then((blobUrl) => {
          if (!blobUrl || usePlayerStore.getState().currentTrack?.id !== track.id) return;
          const ytPlayer = getPlayer();
          if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.stopVideo === 'function') {
            try {
              ytPlayer.stopVideo();
            } catch {}
          }
          setActiveEngine('audio');
          if (audio.src !== blobUrl) {
            audio.src = blobUrl;
            audio.load();
          }
          if (shouldPlay) {
            audio.play().catch(() => setIsLoading(false));
          }
        })
        .catch(() => {});
      return;
    }

    // 2. Pure YouTube Playback
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
    }
    setActiveEngine('youtube');

    const ytPlayer = getPlayer();
    const effectiveYtId = track.youtubeId || (track.id.startsWith('yt_') ? track.id.replace('yt_', '') : '');

    if (effectiveYtId) {
      track.youtubeId = effectiveYtId;
      if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(effectiveYtId);
        if (shouldPlay) {
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
        } else {
          ytPlayer.pauseVideo?.();
        }
      }
      return;
    }

    // 3. Fallback: track has no youtubeId (e.g. from an external playlist import) -> resolve on the fly
    if (resolvingTrackIdRef.current !== track.id) {
      resolvingTrackIdRef.current = track.id;
      setIsLoading(true);
      searchTracks(`${track.title} ${track.artist}`)
        .then((results) => {
          const best = findStrictTrackMatch(track.title, track.artist, results, track.duration) || results[0];
          if (best?.youtubeId && usePlayerStore.getState().currentTrack?.id === track.id) {
            track.youtubeId = best.youtubeId;
            activeLoadedTrackKeyRef.current = track.id;
            startTrackPlayback(track, usePlayerStore.getState().isPlaying);
          } else {
            setIsLoading(false);
          }
        })
        .catch(() => {
          setIsLoading(false);
        });
    }
  };

  // Load new track when currentTrack changes
  useEffect(() => {
    if (!currentTrack) return;

    if (activeLoadedTrackKeyRef.current === currentTrack.id) {
      return;
    }
    activeLoadedTrackKeyRef.current = currentTrack.id;

    if (lastRecordedTrackId.current !== currentTrack.id) {
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

    startTrackPlayback(currentTrack, isPlaying);
  }, [currentTrack]);

  // Sync Play / Pause when isPlaying toggles on the current track
  useEffect(() => {
    if (!currentTrack) return;
    if (getActiveEngine() === 'audio' && audioRef.current) {
      const audio = audioRef.current;
      if (isPlaying) {
        if (audio.paused && audio.src) {
          audio.play().catch(() => setIsLoading(false));
        }
      } else {
        audio.pause();
      }
    } else if (getActiveEngine() === 'youtube' && window.ytPlayerReady) {
      const ytPlayer = getPlayer();
      if (ytPlayer) {
        if (isPlaying && typeof ytPlayer.playVideo === 'function') {
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
        } else if (!isPlaying && typeof ytPlayer.pauseVideo === 'function') {
          ytPlayer.pauseVideo?.();
        }
      }
    }
  }, [isPlaying]);

  // Sync Volume & Mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    const ytPlayer = getPlayer();
    if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.setVolume === 'function') {
      ytPlayer.setVolume(volume * 100);
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
