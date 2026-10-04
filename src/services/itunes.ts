import type { ArtistResult, AlbumResult, Track } from '../types';
import { DEFAULT_THUMBNAIL } from '../utils/constants';
import { searchTracks, getTrending, getCachedTrending } from './youtube';

const artCache = new Map<string, string | null>();
const albumsCache = new Map<string, AlbumResult[]>();
const artistsCache = new Map<string, ArtistResult[]>();
const albumTracksCache = new Map<string, Track[]>();
let cachedNewReleases: AlbumResult[] | null = null;

export function getCachedNewReleases(): AlbumResult[] | null {
  return cachedNewReleases;
}

export function cleanAlbumSearchQuery(title: string, artist: string): string {
  const cleanTitle = (title || '')
    .replace(/\s*[\(\[].*?(original|motion\s*picture|soundtrack|deluxe|expanded|remaster|edition|version|feat|from).*?[\)\]]\s*/gi, ' ')
    .replace(/\s*-\s*(?:ep|single|ost|soundtrack|tamil|telugu|hindi|malayalam|kannada)\b.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const primaryArtist = (artist || '').split(/[,&]/)[0].trim();
  return `${cleanTitle || title} ${primaryArtist}`.trim();
}

export async function getAlbumTracks(album: AlbumResult): Promise<Track[]> {
  const cacheKey = `${album.id}_${album.title || album.name}_${album.artist}`.toLowerCase();
  if (albumTracksCache.has(cacheKey)) {
    return albumTracksCache.get(cacheKey)!;
  }

  const cleanQuery = cleanAlbumSearchQuery(album.title || album.name, album.artist);
  try {
    const tracks = await searchTracks(cleanQuery);
    if (tracks.length > 0) {
      albumTracksCache.set(cacheKey, tracks);
      return tracks;
    }
  } catch (err) {
    console.warn('Error fetching album tracks from YouTube:', err);
  }

  return [];
}

export async function searchAlbums(query: string): Promise<AlbumResult[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  if (albumsCache.has(key)) return albumsCache.get(key)!;

  try {
    const tracks = await searchTracks(`${query} album`);
    const seen = new Set<string>();
    const results: AlbumResult[] = [];

    for (const t of tracks) {
      const albumTitle = t.album && t.album !== 'WaveCraft Cloud' ? t.album : t.title;
      const albumKey = `${albumTitle}__${t.artist}`.toLowerCase();
      if (seen.has(albumKey)) continue;
      seen.add(albumKey);

      results.push({
        id: `yt_alb_${t.youtubeId || t.id}`,
        name: albumTitle,
        title: albumTitle,
        artist: t.artist || 'Unknown Artist',
        thumbnail: t.thumbnail,
        coverUrl: t.thumbnailLarge || t.thumbnail || DEFAULT_THUMBNAIL,
        coverArt: t.thumbnailLarge || t.thumbnail || DEFAULT_THUMBNAIL,
        year: new Date().getFullYear(),
        trackCount: 10
      });

      if (results.length >= 12) break;
    }

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
    const tracks = await searchTracks(`${trackTitle} ${artistName}`);
    if (tracks.length > 0 && tracks[0].thumbnail) {
      const art = tracks[0].thumbnailLarge || tracks[0].thumbnail;
      artCache.set(cacheKey, art);
      return art;
    }
  } catch {}

  artCache.set(cacheKey, null);
  return null;
}

export async function getNewReleases(): Promise<AlbumResult[]> {
  if (cachedNewReleases && cachedNewReleases.length > 0) {
    return cachedNewReleases;
  }

  try {
    const res = await fetch('/api/music?action=new-releases');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.releases) && data.releases.length > 0) {
        cachedNewReleases = data.releases;
        return data.releases;
      }
    }
  } catch (err) {
    console.warn('API new-releases fetch error, trying direct Apple RSS:', err);
  }

  // Client-side direct Apple RSS fallback
  try {
    const r = await fetch('https://itunes.apple.com/us/rss/topalbums/limit=25/json');
    if (r.ok) {
      const data = await r.json();
      const entries = data.feed?.entry || [];
      const releases: AlbumResult[] = entries.map((e: any, idx: number) => {
        const rawCover = e['im:image']?.slice(-1)[0]?.label || DEFAULT_THUMBNAIL;
        const highResCover = rawCover.replace('170x170bb', '600x600bb');
        const title = e['im:name']?.label || 'Untitled Album';
        const artist = e['im:artist']?.label || 'Various Artists';
        return {
          id: `rel_${idx}_${e.id?.attributes?.['im:id'] || idx}`,
          name: title,
          title: title,
          artist: artist,
          coverUrl: highResCover,
          coverArt: highResCover,
          thumbnail: highResCover,
          year: new Date().getFullYear(),
          trackCount: parseInt(e['im:itemCount']?.label || '10', 10)
        };
      });

      if (releases.length > 0) {
        cachedNewReleases = releases;
        return releases;
      }
    }
  } catch (err) {
    console.warn('Direct Apple RSS fallback error:', err);
  }

  // Final fallback to trending
  try {
    const trending = (await getCachedTrending()) || (await getTrending());
    const seen = new Set<string>();
    const releases: AlbumResult[] = [];

    for (const t of trending) {
      const title = t.album && t.album !== 'WaveCraft Cloud' ? t.album : t.title;
      const key = `${title}__${t.artist}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      releases.push({
        id: `release_${t.youtubeId || t.id}`,
        name: title,
        title,
        artist: t.artist,
        thumbnail: t.thumbnail,
        coverUrl: t.thumbnailLarge || t.thumbnail || DEFAULT_THUMBNAIL,
        coverArt: t.thumbnailLarge || t.thumbnail || DEFAULT_THUMBNAIL,
        year: new Date().getFullYear()
      });

      if (releases.length >= 16) break;
    }

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
    const tracks = await searchTracks(query);
    const seen = new Set<string>();
    const artists: ArtistResult[] = [];

    for (const t of tracks) {
      const primaryArtist = t.artist.split(/[,&/]/)[0].trim();
      if (!primaryArtist || primaryArtist === 'WaveCraft Artist' || seen.has(primaryArtist.toLowerCase())) {
        continue;
      }
      seen.add(primaryArtist.toLowerCase());

      artists.push({
        id: `yt_artist_${encodeURIComponent(primaryArtist)}`,
        name: primaryArtist,
        thumbnail: t.thumbnail,
        imageUrl: t.thumbnailLarge || t.thumbnail || DEFAULT_THUMBNAIL,
        genre: 'Music'
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
