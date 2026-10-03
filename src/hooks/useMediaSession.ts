import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { DEFAULT_THUMBNAIL } from '../utils/constants';

export function useMediaSession() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  // Register hardware media key & lock-screen action handlers once
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => usePlayerStore.getState().resume()],
      ['pause', () => usePlayerStore.getState().pause()],
      ['previoustrack', () => usePlayerStore.getState().prevTrack()],
      ['nexttrack', () => usePlayerStore.getState().nextTrack()],
      [
        'stop',
        () => {
          usePlayerStore.getState().pause();
        }
      ],
      [
        'seekto',
        (details) => {
          if (details.seekTime !== undefined) {
            usePlayerStore.getState().seekTo(details.seekTime);
          }
        }
      ],
      [
        'seekforward',
        (details) => {
          const offset = details.seekOffset || 10;
          const st = usePlayerStore.getState();
          st.seekTo(Math.min(st.duration || 300, st.currentTime + offset));
        }
      ],
      [
        'seekbackward',
        (details) => {
          const offset = details.seekOffset || 10;
          const st = usePlayerStore.getState();
          st.seekTo(Math.max(0, st.currentTime - offset));
        }
      ]
    ];

    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported actions on older browsers
      }
    }
  }, []);

  // Update lock-screen / OS media overlay metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    const artSmall = currentTrack.thumbnail || DEFAULT_THUMBNAIL;
    const artLarge = currentTrack.thumbnailLarge || artSmall;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'WaveCraft Studio',
        artwork: [
          { src: artSmall, sizes: '96x96', type: 'image/jpeg' },
          { src: artSmall, sizes: '192x192', type: 'image/jpeg' },
          { src: artLarge, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    } catch {
      // Ignore metadata errors
    }
  }, [currentTrack]);

  // Keep OS playbackState synced so AirPods / Keyboard / Lock Screen buttons toggle properly
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = currentTrack
      ? isPlaying
        ? 'playing'
        : 'paused'
      : 'none';
  }, [isPlaying, currentTrack]);

  // Sync lock-screen scrub bar position state via passive store subscription
  // so root AppContent NEVER re-renders on currentTime ticks
  useEffect(() => {
    if (
      !('mediaSession' in navigator) ||
      typeof navigator.mediaSession.setPositionState !== 'function'
    ) {
      return;
    }

    let lastSyncMs = 0;
    let lastTime = -1;
    let lastDuration = -1;
    let lastSpeed = -1;

    const syncPosition = (currentTime: number, duration: number, playbackSpeed: number) => {
      if (duration <= 0 || !isFinite(duration)) return;
      const now = performance.now();
      const jumped = Math.abs(currentTime - lastTime) > 2.5;
      const metaChanged = duration !== lastDuration || playbackSpeed !== lastSpeed;
      if (!jumped && !metaChanged && now - lastSyncMs < 1500) return;

      lastSyncMs = now;
      lastTime = currentTime;
      lastDuration = duration;
      lastSpeed = playbackSpeed;

      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: playbackSpeed || 1,
          position: Math.max(0, Math.min(duration, currentTime || 0))
        });
      } catch {
        // Ignore transient position errors
      }
    };

    const init = usePlayerStore.getState();
    syncPosition(init.currentTime, init.duration, init.playbackSpeed);

    return usePlayerStore.subscribe((state) => {
      syncPosition(state.currentTime, state.duration, state.playbackSpeed);
    });
  }, []);
}
