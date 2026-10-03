import type { ArtistResult, AlbumResult, Track } from '../types';
import { DEFAULT_THUMBNAIL } from '../utils/constants';
import { searchTracks, findStrictTrackMatch } from './youtube';

const ITUNES_API = 'https://itunes.apple.com';
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
  const cacheKey = `${album.id}_${album.title}_${album.artist}`.toLowerCase();
  if (albumTracksCache.has(cacheKey)) {
    return albumTracksCache.get(cacheKey)!;
  }

  const cleanQuery = cleanAlbumSearchQuery(album.title || album.name, album.artist);

  try {
    // Fetch 320kbps playable tracks for this album and official iTunes tracklist in parallel
    const [playableTracks, itunesLookup] = await Promise.all([
      searchTracks(cleanQuery).catch(() => [] as Track[]),
      album.collectionId
        ? fetch(`${ITUNES_API}/lookup?id=${album.collectionId}&entity=song`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null)
    ]);

    const itunesSongs = (itunesLookup?.results || []).filter(
      (item: any) => item.wrapperType === 'track' && item.kind === 'song' && item.trackName
    );

    if (itunesSongs.length > 0) {
      const usedPlayableIds = new Set<string>();
      const mappedTracks: Track[] = itunesSongs.map((item: any, idx: number) => {
        const trackTitle: string = item.trackName;
        const itemDuration = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 210;
        const availablePlayable = playableTracks.filter((pt) => !usedPlayableIds.has(pt.id));

        // Find strictly verified matching 320kbps stream from playableTracks
        const matched = findStrictTrackMatch(
          trackTitle,
          item.artistName || album.artist || '',
          availablePlayable,
          itemDuration
        );

        if (matched) {
          usedPlayableIds.add(matched.id);
          return {
            ...matched,
            title: trackTitle,
            album: album.title || album.name || matched.album,
            thumbnail: matched.thumbnail || album.coverUrl || DEFAULT_THUMBNAIL,
            thumbnailLarge: matched.thumbnailLarge || album.coverUrl || DEFAULT_THUMBNAIL
          };
        }

        const art = item.artworkUrl100
          ? item.artworkUrl100.replace('100x100bb', '600x600bb').replace('100x100', '600x600')
          : album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL;

        return {
          id: `album_track_${item.trackId || idx}_${Date.now()}`,
          title: trackTitle,
          artist: item.artistName || album.artist || 'Unknown Artist',
          album: album.title || album.name || 'Album',
          duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 210,
          thumbnail: art,
          thumbnailLarge: art,
          thumbnailUrl: art,
          youtubeId: '',
          quality: '320kbps Studio AAC'
        };
      });

      albumTracksCache.set(cacheKey, mappedTracks);
      return mappedTracks;
    }

    if (playableTracks.length > 0) {
      albumTracksCache.set(cacheKey, playableTracks);
      return playableTracks;
    }
  } catch (err) {
    console.warn('Error fetching album tracks:', err);
  }

  const fallback = await searchTracks(`${album.title || album.name} ${album.artist}`);
  albumTracksCache.set(cacheKey, fallback);
  return fallback;
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
        collectionId: Number(item.id?.attributes?.['im:id']) || undefined,
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
