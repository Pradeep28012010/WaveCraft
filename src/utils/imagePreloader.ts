const preloadedUrls = new Set<string>();

/**
 * Preloads a single image into browser memory cache.
 * Avoids duplicate network calls by tracking preloaded URLs.
 */
export function preloadImage(url?: string | null): void {
  if (!url || typeof window === 'undefined' || preloadedUrls.has(url)) return;
  if (url.startsWith('data:')) return;

  preloadedUrls.add(url);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  } catch {}
}

/**
 * Preloads an array of image URLs concurrently.
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
