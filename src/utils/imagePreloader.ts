const preloadedUrls = new Set<string>();
const preloadQueue: string[] = [];
let activePreloads = 0;
const MAX_CONCURRENT_PRELOADS = 4;
let isProcessingScheduled = false;

function processQueue(): void {
  isProcessingScheduled = false;
  while (activePreloads < MAX_CONCURRENT_PRELOADS && preloadQueue.length > 0) {
    const url = preloadQueue.shift();
    if (!url) break;

    activePreloads++;
    try {
      const img = new Image();
      img.decoding = 'async';
      const onDone = () => {
        activePreloads--;
        scheduleQueueProcessing();
      };
      img.onload = onDone;
      img.onerror = onDone;
      img.src = url;
    } catch {
      activePreloads--;
    }
  }
}

function scheduleQueueProcessing(): void {
  if (isProcessingScheduled || preloadQueue.length === 0) return;
  isProcessingScheduled = true;

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback(processQueue, { timeout: 1200 });
  } else if (typeof setTimeout !== 'undefined') {
    setTimeout(processQueue, 40);
  } else {
    processQueue();
  }
}

/**
 * Enqueues an image URL for background caching without saturating network connections.
 * Avoids duplicate network calls by tracking preloaded URLs.
 */
export function preloadImage(url?: string | null): void {
  if (!url || typeof window === 'undefined' || preloadedUrls.has(url)) return;
  if (url.startsWith('data:')) return;

  preloadedUrls.add(url);
  preloadQueue.push(url);
  scheduleQueueProcessing();
}

/**
 * Preloads an array of image URLs sequentially with controlled concurrency.
 */
export function preloadImages(urls: (string | undefined | null)[]): void {
  for (const url of urls) {
    if (url) preloadImage(url);
  }
}

/**
 * Preloads track artwork ahead of scrolling.
 */
export function preloadTrackArtworks(tracks: { thumbnail?: string; thumbnailLarge?: string; thumbnailUrl?: string }[]): void {
  if (!Array.isArray(tracks)) return;
  for (const track of tracks) {
    if (track.thumbnail) preloadImage(track.thumbnail);
    if (track.thumbnailLarge) preloadImage(track.thumbnailLarge);
    if (track.thumbnailUrl) preloadImage(track.thumbnailUrl);
  }
}

/**
 * Preloads album covers ahead of scrolling.
 */
export function preloadAlbumCovers(albums: { coverUrl?: string; thumbnail?: string; coverArt?: string }[]): void {
  if (!Array.isArray(albums)) return;
  for (const album of albums) {
    if (album.coverUrl) preloadImage(album.coverUrl);
    if (album.thumbnail) preloadImage(album.thumbnail);
    if (album.coverArt) preloadImage(album.coverArt);
  }
}
