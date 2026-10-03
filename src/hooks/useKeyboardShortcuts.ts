import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const player = usePlayerStore.getState();
      const library = useLibraryStore.getState();

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          if (player.isPlaying) {
            player.pause();
          } else if (player.currentTrack) {
            player.resume();
          }
          break;
        case 'arrowright':
          player.seekTo(player.currentTime + 10);
          break;
        case 'arrowleft':
          player.seekTo(Math.max(0, player.currentTime - 10));
          break;
        case 'arrowup':
          e.preventDefault();
          player.setVolume(Math.min(1, player.volume + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          player.setVolume(Math.max(0, player.volume - 0.1));
          break;
        case 'm':
          player.toggleMute();
          break;
        case 's':
          player.toggleShuffle();
          break;
        case 'r':
          player.cycleRepeat();
          break;
        case 'n':
          player.nextTrack();
          break;
        case 'p':
          player.prevTrack();
          break;
        case 'l':
          if (player.currentTrack) {
            library.toggleLike(player.currentTrack);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
