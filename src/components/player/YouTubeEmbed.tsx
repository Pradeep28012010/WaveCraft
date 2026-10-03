import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStudioStore } from '../../stores/studioStore';
import { searchTracks } from '../../services/youtube';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import { getOfflineAudioObjectUrl, isTrackOffline } from '../../services/offlineVault';
import {
  setHtmlAudioElement,
  setYtPlayerInstance,
  getPlayer,
  getActiveEngine,
  setActiveEngine,
  hasWebAudioGain,
  resumeAudioContextIfNeeded,
  setSmoothOutputGain,
  getTargetOutputGain,
  syncHeadroomAndEQ,
  ensureAudioGraph,
  applyStudioFXToAudio,
  getAudioFrequencyData,
  unlockAudioEngine,
  seekToTime
} from '../../services/audioEngine';
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

  // Sync 10-band Equalizer gains + Studio FX + Mastering Rack + Vocal Stem Mode + 3D Spatial Radar in real time
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
        setSmoothOutputGain(audioRef.current, restoreVol, 0.05);
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

      const cf = useSettingsStore.getState().crossfadeDuration;
      const baseTargetGain = getTargetOutputGain();

      let finalGain = baseTargetGain;
      if (cf > 0 && dur > cf * 2 && dur - cur <= cf && dur - cur > 0.15) {
        const remainingRatio = Math.max(0, Math.min(1, (dur - cur) / cf));
        // Smooth equal-power cosine fade-out curve
        finalGain = baseTargetGain * Math.sin(remainingRatio * 0.5 * Math.PI);
      }

      setSmoothOutputGain(audio, finalGain, 0.045);
    };

    const onEnded = () => {
      if (getActiveEngine() !== 'audio') return;
      const restoreGain = getTargetOutputGain();
      setSmoothOutputGain(audio, restoreGain, 0.03);

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
      if (getActiveEngine() === 'audio') setIsLoading(true);
    };

    const onPlaying = () => {
      if (getActiveEngine() === 'audio') {
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
        resumeAudioContextIfNeeded();
        // Smooth anti-pop micro-fade-in to target output gain
        setSmoothOutputGain(audio, getTargetOutputGain(), 0.03);
      }
    };

    const onError = () => {
      if (getActiveEngine() !== 'audio') return;
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

      const ytPlayer = getPlayer();
      // 2. Fallback to YouTube engine if youtubeId is present
      if (track?.youtubeId && ytPlayer && window.ytPlayerReady) {
        setActiveEngine('youtube');
        ytPlayer.loadVideoById(track.youtubeId);
        if (state.isPlaying) ytPlayer.playVideo();
      } else if (track && resolvingTrackIdRef.current !== track.id) {
        // 3. Dynamically search & resolve stream if track had no valid stream
        resolvingTrackIdRef.current = track.id;
        searchTracks(`${track.title} ${track.artist}`)
          .then((found) => {
            const match = found.find((t) => t.audioUrl || t.youtubeId);
            if (match && usePlayerStore.getState().currentTrack?.id === track.id) {
              if (match.audioUrl) {
                setActiveEngine('audio');
                audio.src = match.audioUrl;
                audio.play().catch(() => setIsLoading(false));
              } else if (match.youtubeId && getPlayer() && window.ytPlayerReady) {
                setActiveEngine('youtube');
                getPlayer().loadVideoById(match.youtubeId);
                getPlayer().playVideo();
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
            if (state.currentTrack && !state.currentTrack.audioUrl && state.currentTrack.youtubeId) {
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

  // Helper to load and start playing a track on the appropriate engine with anti-pop gain smoothing
  const startTrackPlayback = (track: Track, shouldPlay: boolean) => {
    const audio = audioRef.current;

    const playSmoothly = (targetUrl: string) => {
      if (!audio) return;
      const ytPlayer = getPlayer();
      if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.stopVideo === 'function') {
        try {
          ytPlayer.stopVideo();
        } catch {}
      }
      setActiveEngine('audio');

      // Soft micro-dip before switching source to avoid speaker pop
      if (hasWebAudioGain()) {
        setSmoothOutputGain(audio, 0.001, 0.01);
      } else {
        audio.volume = isMuted ? 0 : volume;
      }

      if (audio.src !== targetUrl) {
        audio.src = targetUrl;
      }
      applyStudioFXToAudio(audio, useStudioStore.getState().fxMode, playbackSpeed || 1);

      if (shouldPlay) {
        resumeAudioContextIfNeeded();
        audio
          .play()
          .then(() => {
            setSmoothOutputGain(audio, getTargetOutputGain(), 0.03);
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
      setActiveEngine('youtube');
      const ytPlayer = getPlayer();
      if (ytPlayer && window.ytPlayerReady && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(track.youtubeId);
        if (shouldPlay) ytPlayer.playVideo();
        else ytPlayer.pauseVideo();
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
        if (!audio.src && currentTrack.audioUrl) {
          audio.src = currentTrack.audioUrl;
        }
        resumeAudioContextIfNeeded();
        if (audio.paused) {
          if (hasWebAudioGain()) {
            setSmoothOutputGain(audio, 0.001, 0.008);
          }
          audio
            .play()
            .then(() => {
              setSmoothOutputGain(audio, getTargetOutputGain(), 0.03);
            })
            .catch((err) => {
              setIsLoading(false);
              if (err?.name === 'NotAllowedError') {
                usePlayerStore.getState().pause();
              }
            });
        }
      } else {
        audio.pause();
      }
    } else if (getActiveEngine() === 'youtube' && getPlayer() && window.ytPlayerReady) {
      const ytPlayer = getPlayer();
      if (isPlaying && typeof ytPlayer.playVideo === 'function') {
        ytPlayer.playVideo();
      } else if (!isPlaying && typeof ytPlayer.pauseVideo === 'function') {
        ytPlayer.pauseVideo();
      }
    }
  }, [isPlaying]);

  // Sync Volume & Mute via zipper-free Web Audio GainNode
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      setSmoothOutputGain(audioRef.current, getTargetOutputGain(), 0.035);
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
    applyStudioFXToAudio(audioRef.current, fxMode, playbackSpeed || 1);
  }, [playbackSpeed, fxMode]);

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
        const duration = ytPlayer.getDuration() || currentTrack?.duration || 1;
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
