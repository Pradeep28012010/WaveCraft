import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';

export function useMediaSession() {
  const store = usePlayerStore();

  useEffect(() => {
    if ('mediaSession' in navigator && store.currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: store.currentTrack.title,
        artist: store.currentTrack.artist,
        album: store.currentTrack.album || '',
        artwork: [
          { src: store.currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => store.resume());
      navigator.mediaSession.setActionHandler('pause', () => store.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => store.prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => store.nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          store.seekTo(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        store.seekTo(store.currentTime + 10);
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        store.seekTo(Math.max(0, store.currentTime - 10));
      });
    }
  }, [store.currentTrack]);

  useEffect(() => {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && store.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: store.duration,
          playbackRate: store.playbackSpeed,
          position: store.currentTime
        });
      } catch (e) {
        // Ignore errors from invalid state
      }
    }
  }, [store.currentTime, store.duration, store.playbackSpeed]);
}
