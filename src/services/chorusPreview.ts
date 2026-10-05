import { useState, useEffect } from 'react';
import type { Track } from '../types';
import { usePlayerStore } from '../stores/playerStore';
import { resolveDirectAudio } from './streamResolver';
import { unlockAudioEngine, resumeAudioContextIfNeeded } from './audioEngine';

interface ChorusPreviewState {
  trackId: string | null;
  isLoading: boolean;
  progress: number; // 0 to 1 over 15 seconds
  remainingSec: number;
}

const PREVIEW_DURATION_SEC = 15;

let previewAudio: HTMLAudioElement | null = null;
let previewState: ChorusPreviewState = {
  trackId: null,
  isLoading: false,
  progress: 0,
  remainingSec: PREVIEW_DURATION_SEC
};
let wasMainPlayerPlaying = false;
let previewStartTimeSec = 48;
let rafId = 0;

const trackListeners = new Map<string, Set<() => void>>();

function notifyTrack(id: string | null) {
  if (!id) return;
  const set = trackListeners.get(id);
  if (set) {
    set.forEach((fn) => fn());
  }
}

function updateState(partial: Partial<ChorusPreviewState>) {
  const prevTrackId = previewState.trackId;
  previewState = { ...previewState, ...partial };
  const nextTrackId = previewState.trackId;
  notifyTrack(prevTrackId);
  if (nextTrackId !== prevTrackId) {
    notifyTrack(nextTrackId);
  }
}

export function stopChorusPreview(resumeMain = true) {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (previewAudio) {
    try {
      previewAudio.pause();
      previewAudio.src = '';
    } catch {}
  }
  const hadActive = previewState.trackId !== null;
  updateState({
    trackId: null,
    isLoading: false,
    progress: 0,
    remainingSec: PREVIEW_DURATION_SEC
  });

  if (hadActive && resumeMain && wasMainPlayerPlaying) {
    wasMainPlayerPlaying = false;
    usePlayerStore.getState().resume();
  } else {
    wasMainPlayerPlaying = false;
  }
}

export function isChorusPreviewActive(trackId?: string): boolean {
  if (!trackId) return false;
  return previewState.trackId === trackId;
}

export async function toggleChorusPreview(track: Track) {
  if (previewState.trackId === track.id) {
    stopChorusPreview(true);
    return;
  }

  // Stop any existing preview first without resuming main player yet
  if (previewState.trackId !== null) {
    stopChorusPreview(false);
  }

  const playerState = usePlayerStore.getState();
  wasMainPlayerPlaying = playerState.isPlaying;
  if (wasMainPlayerPlaying) {
    playerState.pause();
  }

  updateState({
    trackId: track.id,
    isLoading: true,
    progress: 0,
    remainingSec: PREVIEW_DURATION_SEC
  });

  unlockAudioEngine();
  resumeAudioContextIfNeeded();

  let streamUrl = track.audioUrl;
  if (!streamUrl || streamUrl.includes('p.scdn.co')) {
    try {
      const resolved = await resolveDirectAudio(track.title, track.artist, track.duration);
      if (resolved) {
        streamUrl = resolved;
        track.audioUrl = resolved;
      }
    } catch {}
  }

  // If still no direct 320k stream, try using track.audioUrl as fallback
  if (!streamUrl && track.audioUrl) {
    streamUrl = track.audioUrl;
  }

  // Verify user hasn't cancelled while resolving stream
  if (previewState.trackId !== track.id) return;

  if (!streamUrl) {
    stopChorusPreview(true);
    return;
  }

  if (!previewAudio) {
    previewAudio = new Audio();
    previewAudio.crossOrigin = 'anonymous';
    previewAudio.preload = 'auto';
  }

  const audio = previewAudio;
  audio.volume = Math.max(0.25, playerState.isMuted ? 0.7 : playerState.volume);

  let hasStarted = false;
  const startPlaying = () => {
    if (hasStarted || previewState.trackId !== track.id) return;
    hasStarted = true;

    const dur = audio.duration && isFinite(audio.duration) ? audio.duration : track.duration || 180;
    // For short previews (<=35s), start at 0s; for full tracks, jump to chorus drop (~32% into song)
    if (dur <= 35) {
      previewStartTimeSec = 0;
    } else {
      previewStartTimeSec = Math.max(18, Math.min(65, Math.min(dur * 0.32, Math.max(0, dur - 20))));
    }

    try {
      audio.currentTime = previewStartTimeSec;
    } catch {}

    audio
      .play()
      .then(() => {
        if (previewState.trackId !== track.id) return;
        updateState({ isLoading: false });

        const tick = () => {
          if (!previewAudio || previewState.trackId !== track.id) return;
          const elapsed = Math.max(0, previewAudio.currentTime - previewStartTimeSec);
          const ratio = Math.min(1, elapsed / PREVIEW_DURATION_SEC);
          const rem = Math.max(0, Math.ceil(PREVIEW_DURATION_SEC - elapsed));

          // Smooth fade-out during the last 1.8 seconds of the 15s chorus snippet
          const baseVol = usePlayerStore.getState().isMuted ? 0.7 : usePlayerStore.getState().volume;
          if (PREVIEW_DURATION_SEC - elapsed <= 1.8) {
            previewAudio.volume = Math.max(0, baseVol * ((PREVIEW_DURATION_SEC - elapsed) / 1.8));
          } else {
            previewAudio.volume = baseVol;
          }

          if (
            rem !== previewState.remainingSec ||
            Math.abs(ratio - previewState.progress) >= 0.025
          ) {
            updateState({
              progress: ratio,
              remainingSec: rem
            });
          }

          if (elapsed >= PREVIEW_DURATION_SEC || previewAudio.ended) {
            stopChorusPreview(true);
            return;
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      })
      .catch(() => {
        stopChorusPreview(true);
      });
  };

  audio.onloadedmetadata = startPlaying;
  audio.oncanplay = startPlaying;
  audio.onerror = () => {
    if (previewState.trackId !== track.id) return;
    stopChorusPreview(true);
  };

  audio.src = streamUrl;
  audio.load();

  if (audio.readyState >= 1) {
    startPlaying();
  }
}

export function useChorusPreview(trackId: string) {
  const [state, setState] = useState<ChorusPreviewState>(() => previewState);

  useEffect(() => {
    const sync = () => {
      setState({ ...previewState });
    };
    let set = trackListeners.get(trackId);
    if (!set) {
      set = new Set();
      trackListeners.set(trackId, set);
    }
    set.add(sync);
    // Sync immediately in case previewState changed between render and effect
    if (previewState.trackId === trackId) {
      sync();
    }
    return () => {
      const bucket = trackListeners.get(trackId);
      if (bucket) {
        bucket.delete(sync);
        if (bucket.size === 0) {
          trackListeners.delete(trackId);
        }
      }
    };
  }, [trackId]);

  const isPreviewing = state.trackId === trackId;
  return {
    isPreviewing,
    isLoading: isPreviewing && state.isLoading,
    progress: isPreviewing ? state.progress : 0,
    remainingSec: isPreviewing ? state.remainingSec : PREVIEW_DURATION_SEC
  };
}
