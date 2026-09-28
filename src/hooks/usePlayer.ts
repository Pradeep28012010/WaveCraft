import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let playerInstance: any = null;
let isPlayerReady = false;
let onReadyCallbacks: (() => void)[] = [];

function initYouTubePlayer() {
  if (typeof window !== 'undefined' && window.YT && window.YT.Player) {
    createPlayer();
  } else if (!document.getElementById('youtube-iframe-api')) {
    const tag = document.createElement('script');
    tag.id = 'youtube-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    
    window.onYouTubeIframeAPIReady = () => {
      createPlayer();
    };
  }
}

function createPlayer() {
  let playerDiv = document.getElementById('yt-player');
  if (!playerDiv) {
    playerDiv = document.createElement('div');
    playerDiv.id = 'yt-player';
    playerDiv.style.display = 'none';
    document.body.appendChild(playerDiv);
  }

  playerInstance = new window.YT.Player('yt-player', {
    height: '0',
    width: '0',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      playsinline: 1,
    },
    events: {
      onReady: () => {
        isPlayerReady = true;
        onReadyCallbacks.forEach(cb => cb());
        onReadyCallbacks = [];
      },
      onStateChange: (event: any) => {
        const store = usePlayerStore.getState();
        if (event.data === window.YT.PlayerState.ENDED) {
          store.nextTrack();
        } else if (event.data === window.YT.PlayerState.PLAYING) {
          if (!store.isPlaying) store.resume();
          store.setIsLoading(false);
          store.setDuration(playerInstance.getDuration());
        } else if (event.data === window.YT.PlayerState.PAUSED) {
          if (store.isPlaying) store.pause();
        }
      },
      onError: () => {
        const store = usePlayerStore.getState();
        store.nextTrack();
      }
    }
  });
}

export function usePlayer() {
  const store = usePlayerStore();
  const libraryStore = useLibraryStore();
  const progressInterval = useRef<number>();

  useEffect(() => {
    initYouTubePlayer();
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (store.currentTrack) {
      const playVideo = () => {
        if (playerInstance && isPlayerReady) {
          playerInstance.loadVideoById(store.currentTrack?.id);
          playerInstance.setPlaybackRate(store.playbackSpeed);
          playerInstance.setVolume(store.volume * 100);
          if (store.isMuted) {
            playerInstance.mute();
          } else {
            playerInstance.unMute();
          }
          libraryStore.addToRecentlyPlayed(store.currentTrack!);
        }
      };

      if (isPlayerReady) {
        playVideo();
      } else {
        onReadyCallbacks.push(playVideo);
      }
    }
  }, [store.currentTrack?.id]);

  useEffect(() => {
    if (isPlayerReady && playerInstance) {
      if (store.isPlaying) {
        playerInstance.playVideo();
      } else {
        playerInstance.pauseVideo();
      }
    }
  }, [store.isPlaying]);

  useEffect(() => {
    if (isPlayerReady && playerInstance) {
      playerInstance.setVolume(store.volume * 100);
    }
  }, [store.volume]);

  useEffect(() => {
    if (isPlayerReady && playerInstance) {
      if (store.isMuted) {
        playerInstance.mute();
      } else {
        playerInstance.unMute();
      }
    }
  }, [store.isMuted]);

  useEffect(() => {
    if (isPlayerReady && playerInstance && playerInstance.setPlaybackRate) {
      playerInstance.setPlaybackRate(store.playbackSpeed);
    }
  }, [store.playbackSpeed]);

  useEffect(() => {
    if (store.isPlaying) {
      progressInterval.current = window.setInterval(() => {
        if (isPlayerReady && playerInstance && playerInstance.getCurrentTime) {
          const currentTime = playerInstance.getCurrentTime();
          const duration = playerInstance.getDuration();
          if (duration > 0) {
            store.setProgress((currentTime / duration) * 100, currentTime);
          }
        }
      }, 250);
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current);
    }

    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [store.isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (isPlayerReady && playerInstance) {
      playerInstance.seekTo(time, true);
      store.seekTo(time);
    }
  }, [store]);

  return {
    ...store,
    seekTo
  };
}
