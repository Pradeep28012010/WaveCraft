/**
 * Route preloading utility for instant, zero-latency page transitions.
 * Pre-warms dynamic chunks on hover, touch, or browser idle.
 */

export const routePreloaders: Record<string, () => Promise<unknown>> = {
  '/search': () => import('../components/search/SearchResults'),
  '/library': () => import('../components/library/LibraryPage'),
  '/liked': () => import('../components/library/LikedSongs'),
  '/recent': () => import('../components/library/RecentlyPlayed'),
  '/settings': () => import('../components/settings/SettingsPage'),
  '/downloads': () => import('../components/library/DownloadsPage'),
  '/stats': () => import('../components/stats/StatsPage'),
  '/genres': () => import('../components/search/GenreBrowser'),
  '/jam': () => import('../components/jam/JamRoomPage'),
  '/galaxy': () => import('../components/galaxy/SonicGalaxyPage')
};

export function preloadRoute(path: string): void {
  if (typeof window === 'undefined') return;
  const cleanPath = path.split('?')[0].split('#')[0];
  const loader = routePreloaders[cleanPath];
  if (loader) {
    loader().catch(() => {});
  }
}

/**
 * Pre-warms the most frequently accessed routes during browser idle time
 * after the initial page view has rendered.
 */
export function prewarmCoreRoutes(): void {
  if (typeof window === 'undefined') return;
  const prewarm = () => {
    preloadRoute('/search');
    preloadRoute('/library');
    preloadRoute('/liked');
    // Pre-warm Fullscreen NowPlaying & Queue in background
    import('../components/player/NowPlaying').catch(() => {});
    import('../components/player/QueuePanel').catch(() => {});
  };

  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback(prewarm, { timeout: 2000 });
  } else {
    setTimeout(prewarm, 1000);
  }
}
