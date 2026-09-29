import { useState, useEffect } from 'react';
import type { Track } from '../types';
import { usePlayerStore } from '../stores/playerStore';
import { searchTracks } from './youtube';

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

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function updateState(partial: Partial<ChorusPreviewState>) {
  previewState = { ...previewState, ...partial };
  notify();
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
    usePlayerStore.getState().play();
  } else {
    wasMainPlayerPlaying = false;
  }
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

  let streamUrl = track.audioUrl;
  if (!streamUrl) {
    try {
      const results = await searchTracks(`${track.title} ${track.artist}`);
      const match = results.find((r) => r.audioUrl);
      if (match?.audioUrl) {
        streamUrl = match.audioUrl;
        track.audioUrl = match.audioUrl;
      }
    } catch {}
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
  audio.src = streamUrl;
  audio.volume = Math.max(0.25, playerState.isMuted ? 0.7 : playerState.volume);

  const onLoaded = () => {
    if (previewState.trackId !== track.id) return;
    const dur = audio.duration && isFinite(audio.duration) ? audio.duration : track.duration || 180;
    // Jump straight to the chorus drop (~34% into the song, clamped between 32s and 75s)
    previewStartTimeSec = Math.max(24, Math.min(75, Math.min(dur * 0.34, Math.max(0, dur - 20))));
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

          updateState({
            progress: ratio,
            remainingSec: rem
          });

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

  audio.onloadedmetadata = onLoaded;
  audio.onerror = () => {
    if (audio.src.includes('_320.mp4')) {
      audio.src = audio.src.replace('_320.mp4', '_160.mp4');
      audio.load();
      return;
    }
    stopChorusPreview(true);
  };
}

export function useChorusPreview(trackId: string) {
  const [state, setState] = useState<ChorusPreviewState>(() => previewState);

  useEffect(() => {
    const sync = () => {
      // Only trigger re-render if this track is or was the active preview track
      setState((prev) => {
        if (prev.trackId !== trackId && previewState.trackId !== trackId) {
          return prev;
        }
        return { ...previewState };
      });
    };
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
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
