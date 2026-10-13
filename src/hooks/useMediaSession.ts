import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { unlockAudioEngine, resumeAudioContextIfNeeded } from '../services/audioEngine';
import { updateAndroidPlaybackState } from '../services/nativeAndroid';

function decodeTitle(text?: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function buildMediaSessionArtwork(track: {
  thumbnail?: string;
  thumbnailLarge?: string;
  thumbnailUrl?: string;
  youtubeId?: string;
  id?: string;
}): MediaImage[] {
  const images: MediaImage[] = [];
  const added = new Set<string>();

  const add = (url: string | undefined, sizes: string, type = 'image/jpeg') => {
    if (!url || typeof url !== 'string') return;
    const trimmed = url.trim();
    if (!trimmed || added.has(trimmed)) return;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) return;
    added.add(trimmed);
    images.push({ src: trimmed, sizes, type });
  };

  const ytId = track.youtubeId || (track.id?.startsWith('yt_') ? track.id.replace('yt_', '') : null);

  // 1. High-resolution primary covers (enhanced for Saavn, Apple/iTunes, YouTube)
  const rawLarge = track.thumbnailLarge || track.thumbnail || track.thumbnailUrl;
  if (rawLarge) {
    let enhanced = rawLarge;
    // JioSaavn: upgrade 150x150 or 50x50 to 500x500 high-res
    if (enhanced.includes('saavncdn.com')) {
      enhanced = enhanced.replace(/-(?:50x50|150x150)\.jpg/gi, '-500x500.jpg');
    }
    // Apple iTunes: upgrade 100x100 to 600x600 high-res
    if (enhanced.includes('mzstatic.com')) {
      enhanced = enhanced.replace(/\/\d+x\d+bb\./g, '/600x600bb.');
    }
    add(enhanced, '512x512', 'image/jpeg');
    add(enhanced, '384x384', 'image/jpeg');
    add(enhanced, '256x256', 'image/jpeg');
  }

  // 2. YouTube multi-tier fallback cascade:
  // Note: maxresdefault (1280x720) can 404 on non-HD uploads,
  // but sddefault (640x480) and hqdefault (480x360) are 100% guaranteed to exist on YouTube!
  if (ytId) {
    add(`https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`, '1280x720', 'image/jpeg');
    add(`https://i.ytimg.com/vi/${ytId}/sddefault.jpg`, '640x480', 'image/jpeg');
    add(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, '480x360', 'image/jpeg');
    add(`https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`, '320x180', 'image/jpeg');
  }

  // 3. Secondary / standard thumbnail fallbacks
  if (track.thumbnail) {
    add(track.thumbnail, '192x192', 'image/jpeg');
    add(track.thumbnail, '96x96', 'image/jpeg');
  }
  if (track.thumbnailUrl) {
    add(track.thumbnailUrl, '128x128', 'image/jpeg');
  }

  // 4. Guaranteed fallback
  if (images.length === 0) {
    add('https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=512&q=80', '512x512', 'image/jpeg');
  }

  return images;
}

export function updateMediaSessionMetadata(track: {
  title?: string;
  artist?: string;
  album?: string;
  thumbnail?: string;
  thumbnailLarge?: string;
  thumbnailUrl?: string;
  youtubeId?: string;
  id?: string;
} | null): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !track) return;

  try {
    const artwork = buildMediaSessionArtwork(track);
    const title = decodeTitle(track.title) || 'WaveCraft Music';
    const artist = decodeTitle(track.artist) || 'WaveCraft Studio';
    const album = decodeTitle(track.album) || 'WaveCraft Studio';

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork
    });
  } catch {
    // Ignore metadata errors
  }
}

export function useMediaSession() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  // Register hardware media key & lock-screen action handlers once
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      [
        'play',
        () => {
          unlockAudioEngine();
          resumeAudioContextIfNeeded();
          navigator.mediaSession.playbackState = 'playing';
          usePlayerStore.getState().resume();
        }
      ],
      [
        'pause',
        () => {
          navigator.mediaSession.playbackState = 'paused';
          usePlayerStore.getState().pause();
        }
      ],
      [
        'previoustrack',
        () => {
          unlockAudioEngine();
          resumeAudioContextIfNeeded();
          usePlayerStore.getState().prevTrack();
        }
      ],
      [
        'nexttrack',
        () => {
          unlockAudioEngine();
          resumeAudioContextIfNeeded();
          usePlayerStore.getState().nextTrack();
        }
      ],
      [
        'stop',
        () => {
          navigator.mediaSession.playbackState = 'none';
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

    return () => {
      for (const [action] of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
    };
  }, []);

  // Update lock-screen / OS media overlay metadata when track changes
  useEffect(() => {
    updateMediaSessionMetadata(currentTrack);
  }, [currentTrack]);

  // Keep OS playbackState synced so AirPods / Keyboard / Lock Screen buttons toggle properly
  useEffect(() => {
    if (currentTrack) {
      const state = usePlayerStore.getState();
      updateAndroidPlaybackState(isPlaying, state.currentTime || 0, state.duration || 0);
    }
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

      const playing = usePlayerStore.getState().isPlaying;
      updateAndroidPlaybackState(playing, currentTime, duration);

      if (
        'mediaSession' in navigator &&
        typeof navigator.mediaSession.setPositionState === 'function'
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: playbackSpeed || 1,
            position: Math.max(0, Math.min(duration, currentTime || 0))
          });
        } catch {
          // Ignore transient position errors
        }
      }
    };

    const init = usePlayerStore.getState();
    syncPosition(init.currentTime, init.duration, init.playbackSpeed);

    return usePlayerStore.subscribe((state) => {
      syncPosition(state.currentTime, state.duration, state.playbackSpeed);
    });
  }, []);
}
