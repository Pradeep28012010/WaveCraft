import type { ArtistResult, AlbumResult } from '../types';
import { DEFAULT_THUMBNAIL } from '../utils/constants';

const ITUNES_API = 'https://itunes.apple.com';
const artCache = new Map<string, string | null>();
const albumsCache = new Map<string, AlbumResult[]>();
const artistsCache = new Map<string, ArtistResult[]>();
let cachedNewReleases: AlbumResult[] | null = null;

export function getCachedNewReleases(): AlbumResult[] | null {
  return cachedNewReleases;
}

export async function searchAlbums(query: string): Promise<AlbumResult[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  if (albumsCache.has(key)) return albumsCache.get(key)!;

  try {
    const response = await fetch(`${ITUNES_API}/search?term=${encodeURIComponent(query)}&entity=album&limit=12`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    const results = (data.results || []).map((item: any) => {
      const art = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb').replace('100x100', '600x600') : DEFAULT_THUMBNAIL;
      const title = item.collectionName || 'Unknown Album';
      return {
        id: String(item.collectionId || Math.random()),
        collectionId: item.collectionId,
        name: title,
        title,
        artist: item.artistName || 'Unknown Artist',
        thumbnail: art,
        coverUrl: art,
        coverArt: art,
        year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
        trackCount: item.trackCount
      };
    });
    albumsCache.set(key, results);
    return results;
  } catch (error) {
    console.error('Error in searchAlbums:', error);
    return [];
  }
}

export async function getAlbumArt(trackTitle: string, artistName: string): Promise<string | null> {
  const cacheKey = `${trackTitle}-${artistName}`;
  if (artCache.has(cacheKey)) {
    return artCache.get(cacheKey) || null;
  }

  try {
    const query = `${trackTitle} ${artistName}`;
    const response = await fetch(`${ITUNES_API}/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const art = data.results[0].artworkUrl100
        ? data.results[0].artworkUrl100.replace('100x100bb', '600x600bb').replace('100x100', '600x600')
        : null;
      artCache.set(cacheKey, art);
      return art;
    }

    artCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.error('Error in getAlbumArt:', error);
    return null;
  }
}

export async function getNewReleases(): Promise<AlbumResult[]> {
  if (cachedNewReleases && cachedNewReleases.length > 0) {
    return cachedNewReleases;
  }
  try {
    const response = await fetch(`${ITUNES_API}/us/rss/topalbums/limit=16/json`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (!data.feed || !data.feed.entry) return [];

    const releases = data.feed.entry.map((item: any) => {
      const images = item['im:image'] || [];
      const image = images.length > 0 ? images[images.length - 1].label : '';
      const art = image ? image.replace(/\d+x\d+/, '600x600') : DEFAULT_THUMBNAIL;
      const title = item['im:name']?.label || 'Album';
      return {
        id: String(item.id?.attributes?.['im:id'] || Math.random()),
        name: title,
        title,
        artist: item['im:artist']?.label || 'Artist',
        thumbnail: art,
        coverUrl: art,
        coverArt: art,
        year: item['im:releaseDate']?.label ? new Date(item['im:releaseDate'].label).getFullYear() : new Date().getFullYear()
      };
    });
    cachedNewReleases = releases;
    return releases;
  } catch (error) {
    console.error('Error in getNewReleases:', error);
    return [];
  }
}

export async function searchArtists(query: string): Promise<ArtistResult[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  if (artistsCache.has(key)) return artistsCache.get(key)!;

  try {
    const response = await fetch(`${ITUNES_API}/search?term=${encodeURIComponent(query)}&entity=song&limit=15`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    const seen = new Set<string>();
    const artists: ArtistResult[] = [];
    for (const item of data.results || []) {
      const name = item.artistName;
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const art = item.artworkUrl100
        ? item.artworkUrl100.replace('100x100bb', '500x500bb').replace('100x100', '500x500')
        : DEFAULT_THUMBNAIL;
      artists.push({
        id: String(item.artistId || name),
        name,
        thumbnail: art,
        imageUrl: art,
        genre: item.primaryGenreName
      });
      if (artists.length >= 8) break;
    }
    artistsCache.set(key, artists);
    return artists;
  } catch (error) {
    console.error('Error in searchArtists:', error);
    return [];
  }
}
