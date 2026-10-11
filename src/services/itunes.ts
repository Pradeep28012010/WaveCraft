import type { ArtistResult, AlbumResult, Track } from '../types';
import { DEFAULT_THUMBNAIL } from '../utils/constants';
import { searchTracks, getTrending, getCachedTrending } from './youtube';
import { apiUrl, PROD_API_ORIGIN } from './apiConfig';

interface RawItunesTrack {
  wrapperType?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
  previewUrl?: string;
}

interface RawItunesAlbum {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  trackCount?: number;
}

interface RawItunesArtist {
  artistId?: number;
  artistName?: string;
  primaryGenreName?: string;
}

interface RawItunesRssEntry {
  'im:image'?: Array<{ label: string }>;
  'im:name'?: { label: string };
  'im:artist'?: { label: string };
  id?: { attributes?: { 'im:id'?: string } };
  'im:itemCount'?: { label: string };
}

const artCache = new Map<string, string | null>();
const albumsCache = new Map<string, AlbumResult[]>();
const artistsCache = new Map<string, ArtistResult[]>();
const albumTracksCache = new Map<string, Track[]>();
export const FALLBACK_NEW_RELEASES: AlbumResult[] = [
  {
    id: 'itunes_alb_1752214909',
    name: "Short n' Sweet",
    title: "Short n' Sweet",
    artist: 'Sabrina Carpenter',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a1/1c/ca/a11ccab6-7d4c-e041-d028-998bcebeb709/24UMGIM61704.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a1/1c/ca/a11ccab6-7d4c-e041-d028-998bcebeb709/24UMGIM61704.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a1/1c/ca/a11ccab6-7d4c-e041-d028-998bcebeb709/24UMGIM61704.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 12
  },
  {
    id: 'itunes_alb_1739659134',
    name: 'HIT ME HARD AND SOFT',
    title: 'HIT ME HARD AND SOFT',
    artist: 'Billie Eilish',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 11
  },
  {
    id: 'itunes_alb_1736268215',
    name: 'THE TORTURED POETS DEPARTMENT',
    title: 'THE TORTURED POETS DEPARTMENT',
    artist: 'Taylor Swift',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/6b/7d/61/6b7d61e4-e6f1-83bc-d645-463aa06b33c4/24UMGIM29563.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/6b/7d/61/6b7d61e4-e6f1-83bc-d645-463aa06b33c4/24UMGIM29563.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/6b/7d/61/6b7d61e4-e6f1-83bc-d645-463aa06b33c4/24UMGIM29563.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 17
  },
  {
    id: 'itunes_alb_1781316864',
    name: 'GNX',
    title: 'GNX',
    artist: 'Kendrick Lamar',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/54/28/14/54281424-eece-0935-299d-fdd2ab403f92/24UM1IM28978.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/54/28/14/54281424-eece-0935-299d-fdd2ab403f92/24UM1IM28978.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/54/28/14/54281424-eece-0935-299d-fdd2ab403f92/24UM1IM28978.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 12
  },
  {
    id: 'itunes_alb_1707412988',
    name: 'The Rise and Fall of a Midwest Princess',
    title: 'The Rise and Fall of a Midwest Princess',
    artist: 'Chappell Roan',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/42/a0/c5/42a0c5e6-6b98-f1f9-7d6b-6d6c61aba562/23UMGIM84225.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/42/a0/c5/42a0c5e6-6b98-f1f9-7d6b-6d6c61aba562/23UMGIM84225.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/42/a0/c5/42a0c5e6-6b98-f1f9-7d6b-6d6c61aba562/23UMGIM84225.rgb.jpg/600x600bb.jpg',
    year: 2023,
    trackCount: 14
  },
  {
    id: 'itunes_alb_1752536575',
    name: 'F-1 Trillion',
    title: 'F-1 Trillion',
    artist: 'Post Malone',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/0e/7c/29/0e7c29f4-74ec-e234-cc49-9212a5c0f847/24UMGIM60824.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/0e/7c/29/0e7c29f4-74ec-e234-cc49-9212a5c0f847/24UMGIM60824.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/0e/7c/29/0e7c29f4-74ec-e234-cc49-9212a5c0f847/24UMGIM60824.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 18
  },
  {
    id: 'itunes_alb_1739079974',
    name: 'BRAT',
    title: 'BRAT',
    artist: 'Charli xcx',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 15
  },
  {
    id: 'itunes_alb_1770789137',
    name: 'Moon Music',
    title: 'Moon Music',
    artist: 'Coldplay',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/6d/06/c66d06d3-0ceb-35b9-594d-4b85b697ec2c/5021732499189.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/6d/06/c66d06d3-0ceb-35b9-594d-4b85b697ec2c/5021732499189.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/6d/06/c66d06d3-0ceb-35b9-594d-4b85b697ec2c/5021732499189.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 10
  },
  {
    id: 'itunes_alb_1725913366',
    name: 'eternal sunshine',
    title: 'eternal sunshine',
    artist: 'Ariana Grande',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/2e/88/88/2e8888ad-a0cf-eece-70a7-1ff81377a3ab/24UMGIM00198.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/2e/88/88/2e8888ad-a0cf-eece-70a7-1ff81377a3ab/24UMGIM00198.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/2e/88/88/2e8888ad-a0cf-eece-70a7-1ff81377a3ab/24UMGIM00198.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 13
  },
  {
    id: 'itunes_alb_1738370746',
    name: 'COWBOY CARTER',
    title: 'COWBOY CARTER',
    artist: 'Beyoncé',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/c6/9c/17/c69c17df-1835-77e7-58c1-ca04d44a0611/196871853736.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/c6/9c/17/c69c17df-1835-77e7-58c1-ca04d44a0611/196871853736.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/c6/9c/17/c69c17df-1835-77e7-58c1-ca04d44a0611/196871853736.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 27
  }
];

const NEW_RELEASES_STORAGE_KEY = 'wavecraft_cached_releases_v2';

function getStoredNewReleases(): AlbumResult[] | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(NEW_RELEASES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {}
  return null;
}

let cachedNewReleases: AlbumResult[] | null = getStoredNewReleases();

export function getCachedNewReleases(): AlbumResult[] | null {
  return cachedNewReleases && cachedNewReleases.length > 0 ? cachedNewReleases : FALLBACK_NEW_RELEASES;
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

  // 1. Direct Apple iTunes lookup if album has iTunes collection ID
  if (album.id.startsWith('itunes_alb_')) {
    try {
      const collectionId = album.id.replace('itunes_alb_', '');
      const res = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=100`, {
        signal: AbortSignal.timeout(4500)
      }).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        const results: RawItunesTrack[] = data?.results || [];
        const songEntries = results.filter((r) => r.wrapperType === 'track');
        if (songEntries.length > 0) {
          const albumArt = album.coverUrl || album.coverArt || DEFAULT_THUMBNAIL;
          const mappedTracks: Track[] = songEntries.map((s) => ({
            id: `itunes_${s.trackId}`,
            title: s.trackName || 'Track',
            artist: s.artistName || album.artist,
            album: s.collectionName || album.title || album.name,
            duration: Math.round((s.trackTimeMillis || 210000) / 1000),
            thumbnail: albumArt,
            thumbnailLarge: albumArt,
            thumbnailUrl: albumArt,
            audioUrl: s.previewUrl || undefined,
            audioPreviewUrl: s.previewUrl || undefined,
            quality: 'Apple Master'
          }));
          albumTracksCache.set(cacheKey, mappedTracks);
          return mappedTracks;
        }
      }
    } catch {}
  }

  const cleanQuery = cleanAlbumSearchQuery(album.title || album.name, album.artist);
  try {
    const tracks = await searchTracks(cleanQuery);
    if (tracks.length > 0) {
      albumTracksCache.set(cacheKey, tracks);
      return tracks;
    }
  } catch (err) {
    console.warn('Error fetching album tracks from search:', err);
  }

  return [];
}

export async function searchAlbums(query: string): Promise<AlbumResult[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  if (albumsCache.has(key)) return albumsCache.get(key)!;

  try {
    // 1. Direct Apple iTunes Album Search (instant, verified albums with high-res art)
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=15`;
    const res = await fetch(itunesUrl, {
      signal: AbortSignal.timeout(4500)
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const results: RawItunesAlbum[] = data?.results || [];
      if (results.length > 0) {
        const albums: AlbumResult[] = results.map((item) => {
          const rawArt = item.artworkUrl100 || DEFAULT_THUMBNAIL;
          const highRes = rawArt.replace('100x100bb', '600x600bb');
          const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : new Date().getFullYear();
          return {
            id: `itunes_alb_${item.collectionId}`,
            name: item.collectionName || 'Untitled Album',
            title: item.collectionName || 'Untitled Album',
            artist: item.artistName || 'Various Artists',
            coverUrl: highRes,
            coverArt: highRes,
            thumbnail: highRes,
            year,
            trackCount: item.trackCount || 10
          };
        });
        albumsCache.set(key, albums);
        return albums;
      }
    }
  } catch {}

  // 2. Fallback: Extract distinct albums from track search
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

    if (results.length > 0) {
      albumsCache.set(key, results);
      return results;
    }
  } catch (error) {
    console.error('Error in searchAlbums fallback:', error);
  }

  return [];
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
    const endpoint = apiUrl('/api/music?action=new-releases');
    let res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!res?.ok && !endpoint.startsWith('http')) {
      res = await fetch(`${PROD_API_ORIGIN}/api/music?action=new-releases`, {
        signal: AbortSignal.timeout(4500)
      }).catch(() => null);
    }
    if (res?.ok) {
      const data = await res.json();
      if (Array.isArray(data.releases) && data.releases.length > 0) {
        cachedNewReleases = data.releases;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(NEW_RELEASES_STORAGE_KEY, JSON.stringify(data.releases.slice(0, 25)));
          }
        } catch {}
        return data.releases;
      }
    }
  } catch (err) {
    console.warn('API new-releases fetch error, trying direct Apple RSS:', err);
  }

  // Client-side direct Apple RSS fallback
  try {
    const r = await fetch('https://itunes.apple.com/us/rss/topalbums/limit=25/json', {
      signal: AbortSignal.timeout(4500)
    });
    if (r.ok) {
      const data = await r.json();
      const entries: RawItunesRssEntry[] = data.feed?.entry || [];
      const releases: AlbumResult[] = entries.map((e, idx: number) => {
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
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(NEW_RELEASES_STORAGE_KEY, JSON.stringify(releases.slice(0, 25)));
          }
        } catch {}
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

    if (releases.length > 0) {
      cachedNewReleases = releases;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(NEW_RELEASES_STORAGE_KEY, JSON.stringify(releases.slice(0, 25)));
        }
      } catch {}
      return releases;
    }
    cachedNewReleases = FALLBACK_NEW_RELEASES;
    return FALLBACK_NEW_RELEASES;
  } catch (error) {
    console.error('Error in getNewReleases:', error);
    return FALLBACK_NEW_RELEASES;
  }
}

export async function searchArtists(query: string): Promise<ArtistResult[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  if (artistsCache.has(key)) return artistsCache.get(key)!;

  try {
    // 1. Direct Apple iTunes Artist search (verified artist profiles with high reliability)
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=10`;
    const res = await fetch(itunesUrl, {
      signal: AbortSignal.timeout(4500)
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const results: RawItunesArtist[] = data?.results || [];
      if (results.length > 0) {
        const tracks = await searchTracks(query).catch(() => []);
        const artistArtMap = new Map<string, string>();
        for (const t of tracks) {
          const lead = t.artist.split(/[,&/]/)[0].trim().toLowerCase();
          if (lead && !artistArtMap.has(lead) && t.thumbnail) {
            artistArtMap.set(lead, t.thumbnailLarge || t.thumbnail);
          }
        }

        const artists: ArtistResult[] = results.map((item) => {
          const name = item.artistName || 'Unknown Artist';
          const art = artistArtMap.get(name.toLowerCase()) || (tracks[0]?.thumbnailLarge || tracks[0]?.thumbnail || DEFAULT_THUMBNAIL);
          return {
            id: `itunes_artist_${item.artistId}`,
            name,
            genre: item.primaryGenreName || 'Music',
            thumbnail: art,
            imageUrl: art
          };
        });
        artistsCache.set(key, artists);
        return artists;
      }
    }
  } catch {}

  // 2. Fallback: extract distinct artists from searchTracks
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

    if (artists.length > 0) {
      artistsCache.set(key, artists);
      return artists;
    }
  } catch (error) {
    console.error('Error in searchArtists fallback:', error);
  }

  return [];
}

/**
 * Searches the Apple iTunes Search API directly for songs with 600x600 artwork.
 * Ideal for dynamic seed expansion and high-fidelity fallback matching.
 */
export async function searchItunesSongs(query: string, limit = 20): Promise<Track[]> {
  const clean = (query || '').trim();
  if (!clean) return [];

  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=song&limit=${limit}`;
    const res = await fetch(itunesUrl, {
      signal: AbortSignal.timeout(4500)
    }).catch(() => null);

    if (!res?.ok) return [];
    const data = await res.json();
    const results: RawItunesTrack[] = data?.results || [];
    if (!Array.isArray(results) || results.length === 0) return [];

    return results.map((item) => {
      const art = item.artworkUrl100
        ? item.artworkUrl100.replace('100x100bb', '600x600bb')
        : DEFAULT_THUMBNAIL;
      return {
        id: `itunes_${item.trackId}`,
        title: item.trackName || 'Unknown Title',
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || 'WaveCraft Cloud',
        duration: Math.round((item.trackTimeMillis || 210000) / 1000),
        thumbnail: art,
        thumbnailLarge: art,
        thumbnailUrl: art,
        audioUrl: item.previewUrl || undefined,
        audioPreviewUrl: item.previewUrl || undefined,
        youtubeId: '',
        quality: 'Apple Master'
      };
    });
  } catch {
    return [];
  }
}
