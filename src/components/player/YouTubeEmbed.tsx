import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { searchTracks } from '../../services/youtube';
import type { Track } from '../../types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
    ytPlayerReady: boolean;
  }
}

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

let ytPlayerInstance: any = null;
let htmlAudioElement: HTMLAudioElement | null = null;
let preloadAudioElement: HTMLAudioElement | null = null;
let activeEngine: 'audio' | 'youtube' = 'audio';

// Web Audio API Equalizer & Real-time Visualizer Analyser nodes
let audioCtx: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let eqFilters: BiquadFilterNode[] = [];
let gainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;

function ensureAudioGraph(audio: HTMLAudioElement, initialBands: number[]) {
  if (audioCtx || !window.AudioContext) return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctx();
    sourceNode = audioCtx.createMediaElementSource(audio);
    gainNode = audioCtx.createGain();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 128;
    analyserNode.smoothingTimeConstant = 0.78;

    eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = audioCtx!.createBiquadFilter();
      if (idx === 0) filter.type = 'lowshelf';
      else if (idx === EQ_FREQUENCIES.length - 1) filter.type = 'highshelf';
      else filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.2;
      filter.gain.value = initialBands[idx] || 0;
      return filter;
    });

    let prev: AudioNode = sourceNode;
    for (const f of eqFilters) {
      prev.connect(f);
      prev = f;
    }
    prev.connect(gainNode);
    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
  } catch (err) {
    console.warn('Web Audio EQ initialization skipped:', err);
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
            htmlAudioElement.volume = usePlayerStore.getState().volume;
          }
        })
        .catch(() => {});
    }
  } catch {}
};

export const seekToTime = (seconds: number) => {
  if (activeEngine === 'audio' && htmlAudioElement) {
    htmlAudioElement.currentTime = seconds;
  } else if (ytPlayerInstance && typeof ytPlayerInstance.seekTo === 'function') {
    ytPlayerInstance.seekTo(seconds, true);
  }
};

export default function YouTubeEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const lastRecordedTrackId = useRef<string | null>(null);
  const lastPreloadedUrl = useRef<string | null>(null);
  const isFetchingAutoplay = useRef<boolean>(false);
  const resolvingTrackIdRef = useRef<string | null>(null);

  const {
    currentTrack,
    queue,
    queueIndex,
    repeatMode,
    isPlaying,
    volume,
    isMuted,
    playbackSpeed,
    nextTrack,
    setProgress,
    setDuration,
    setIsLoading
  } = usePlayerStore();

  const eqBands = useSettingsStore((s) => s.equalizerBands);
  const crossfadeDuration = useSettingsStore((s) => s.crossfadeDuration);
  const autoplay = useSettingsStore((s) => s.autoplay);

  // Sync 10-band Equalizer gains in real time
  useEffect(() => {
    if (eqFilters.length > 0 && audioCtx) {
      eqBands.forEach((db, idx) => {
        if (eqFilters[idx]) {
          eqFilters[idx].gain.setTargetAtTime(db || 0, audioCtx!.currentTime, 0.03);
        }
      });
    }
  }, [eqBands]);

  // Preload next track in queue & auto-extend queue when autoplay is on
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
    }

    if (
      autoplay &&
      currentTrack &&
      queue.length > 0 &&
      queueIndex >= queue.length - 1 &&
      !isFetchingAutoplay.current
    ) {
      isFetchingAutoplay.current = true;
      searchTracks(`${currentTrack.artist} hits`)
        .then((similar) => {
          const existingIds = new Set(usePlayerStore.getState().queue.map((t) => t.id));
          const fresh = similar.filter((t) => !existingIds.has(t.id)).slice(0, 6);
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

    const onTimeUpdate = () => {
      if (activeEngine !== 'audio') return;
      const cur = audio.currentTime || 0;
      const dur = audio.duration || currentTrack?.duration || 1;

      if (Math.abs(cur - lastReportedTime) >= 0.25 || cur < 0.3) {
        lastReportedTime = cur;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        setProgress(pct, cur);
        if (dur > 0 && !isNaN(dur) && isFinite(dur) && Math.abs(dur - usePlayerStore.getState().duration) > 0.5) {
          setDuration(dur);
        }
      }

      const cf = useSettingsStore.getState().crossfadeDuration;
      const userVol = usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume;
      if (cf > 0 && dur > cf * 2 && dur - cur <= cf && dur - cur > 0.2) {
        const remainingRatio = Math.max(0, Math.min(1, (dur - cur) / cf));
        audio.volume = userVol * remainingRatio;
      } else if (audio.volume !== userVol) {
        audio.volume = userVol;
      }
    };

    const onEnded = () => {
      if (activeEngine !== 'audio') return;
      const userVol = usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume;
      audio.volume = userVol;
      nextTrack();
    };

    const onWaiting = () => {
      if (activeEngine === 'audio') setIsLoading(true);
    };

    const onPlaying = () => {
      if (activeEngine === 'audio') {
        setIsLoading(false);
        ensureAudioGraph(audio, useSettingsStore.getState().equalizerBands);
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
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
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
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

  // Helper to load and start playing a track on the appropriate engine
  const startTrackPlayback = (track: Track, shouldPlay: boolean) => {
    const audio = audioRef.current;

    if (track.audioUrl && audio) {
      if (ytPlayerInstance && window.ytPlayerReady && typeof ytPlayerInstance.stopVideo === 'function') {
        try {
          ytPlayerInstance.stopVideo();
        } catch {}
      }
      activeEngine = 'audio';
      if (audio.src !== track.audioUrl) {
        audio.src = track.audioUrl;
      }
      audio.volume = isMuted ? 0 : volume;
      audio.playbackRate = playbackSpeed || 1;
      if (shouldPlay) {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        audio.play().catch((err) => {
          setIsLoading(false);
          // If browser blocked autoplay after async operation, sync store to paused so next click plays immediately
          if (err?.name === 'NotAllowedError') {
            usePlayerStore.getState().pause();
          }
        });
      }
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
          startTrackPlayback(track, usePlayerStore.getState().isPlaying);
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => {
        setIsLoading(false);
      });
  };

  // Load new track when currentTrack changes
  useEffect(() => {
    if (!currentTrack) return;

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
          audioRef.current.play().catch((err) => {
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

  // Sync Volume & Mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
      audioRef.current.muted = isMuted;
    }
    if (ytPlayerInstance && window.ytPlayerReady && typeof ytPlayerInstance.setVolume === 'function') {
      ytPlayerInstance.setVolume(volume * 100);
      if (isMuted) ytPlayerInstance.mute?.();
      else ytPlayerInstance.unMute?.();
    }
  }, [volume, isMuted]);

  // Sync Playback Speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed || 1;
    }
    if (ytPlayerInstance && window.ytPlayerReady && typeof ytPlayerInstance.setPlaybackRate === 'function') {
      ytPlayerInstance.setPlaybackRate(playbackSpeed || 1);
    }
  }, [playbackSpeed]);

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
