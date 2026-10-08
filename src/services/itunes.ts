import type { ArtistResult, AlbumResult, Track } from '../types';
import { DEFAULT_THUMBNAIL } from '../utils/constants';
import { searchTracks, getTrending, getCachedTrending } from './youtube';
import { apiUrl, PROD_API_ORIGIN } from './apiConfig';

const artCache = new Map<string, string | null>();
const albumsCache = new Map<string, AlbumResult[]>();
const artistsCache = new Map<string, ArtistResult[]>();
const albumTracksCache = new Map<string, Track[]>();
export const FALLBACK_NEW_RELEASES: AlbumResult[] = [
  {
    id: 'rel_sabrina_short_sweet',
    name: "Short n' Sweet",
    title: "Short n' Sweet",
    artist: 'Sabrina Carpenter',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/bf/a4/09/bfa4094a-38d5-3fc5-9118-a6e5da55959c/24UMGIM62217.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/bf/a4/09/bfa4094a-38d5-3fc5-9118-a6e5da55959c/24UMGIM62217.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/bf/a4/09/bfa4094a-38d5-3fc5-9118-a6e5da55959c/24UMGIM62217.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 12
  },
  {
    id: 'rel_billie_hit_me_hard',
    name: 'HIT ME HARD AND SOFT',
    title: 'HIT ME HARD AND SOFT',
    artist: 'Billie Eilish',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/91/97/96/91979603-f38b-d5a2-3f19-3f8d6728eb71/24UMGIM36768.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/91/97/96/91979603-f38b-d5a2-3f19-3f8d6728eb71/24UMGIM36768.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/91/97/96/91979603-f38b-d5a2-3f19-3f8d6728eb71/24UMGIM36768.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 10
  },
  {
    id: 'rel_taylor_ttpd',
    name: 'THE TORTURED POETS DEPARTMENT',
    title: 'THE TORTURED POETS DEPARTMENT',
    artist: 'Taylor Swift',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3d/8a/87/3d8a87ea-9781-6a2c-f6fa-e6f7778b0e5d/24UMGIM28577.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3d/8a/87/3d8a87ea-9781-6a2c-f6fa-e6f7778b0e5d/24UMGIM28577.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3d/8a/87/3d8a87ea-9781-6a2c-f6fa-e6f7778b0e5d/24UMGIM28577.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 16
  },
  {
    id: 'rel_kendrick_gnx',
    name: 'GNX',
    title: 'GNX',
    artist: 'Kendrick Lamar',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/e5/bd/27/e5bd27bb-efb9-9e0c-99f8-744030dff75b/24UM1IM51458.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/e5/bd/27/e5bd27bb-efb9-9e0c-99f8-744030dff75b/24UM1IM51458.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/e5/bd/27/e5bd27bb-efb9-9e0c-99f8-744030dff75b/24UM1IM51458.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 12
  },
  {
    id: 'rel_chappell_midwest',
    name: 'The Rise and Fall of a Midwest Princess',
    title: 'The Rise and Fall of a Midwest Princess',
    artist: 'Chappell Roan',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/9c/04/b5/9c04b509-3171-ec59-a5ae-7a323a789d6e/23UMGIM78944.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/9c/04/b5/9c04b509-3171-ec59-a5ae-7a323a789d6e/23UMGIM78944.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/9c/04/b5/9c04b509-3171-ec59-a5ae-7a323a789d6e/23UMGIM78944.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 14
  },
  {
    id: 'rel_post_f1_trillion',
    name: 'F-1 Trillion',
    title: 'F-1 Trillion',
    artist: 'Post Malone',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/9d/ae/ee/9daeeeb4-c9ec-63ff-8452-cf0560a631c1/24UMGIM69894.rgb.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/9d/ae/ee/9daeeeb4-c9ec-63ff-8452-cf0560a631c1/24UMGIM69894.rgb.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/9d/ae/ee/9daeeeb4-c9ec-63ff-8452-cf0560a631c1/24UMGIM69894.rgb.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 18
  },
  {
    id: 'rel_charli_brat',
    name: 'BRAT',
    title: 'BRAT',
    artist: 'Charli xcx',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/90/a6/5c/90a65c28-98aa-dfd9-4ef3-43183570220d/5054197992984.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/90/a6/5c/90a65c28-98aa-dfd9-4ef3-43183570220d/5054197992984.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/90/a6/5c/90a65c28-98aa-dfd9-4ef3-43183570220d/5054197992984.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 15
  },
  {
    id: 'rel_coldplay_moon_music',
    name: 'Moon Music',
    title: 'Moon Music',
    artist: 'Coldplay',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f5/83/80/f58380bb-2647-a871-3c48-2895fc65aa44/5054197985160.jpg/600x600bb.jpg',
    coverArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f5/83/80/f58380bb-2647-a871-3c48-2895fc65aa44/5054197985160.jpg/600x600bb.jpg',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f5/83/80/f58380bb-2647-a871-3c48-2895fc65aa44/5054197985160.jpg/600x600bb.jpg',
    year: 2024,
    trackCount: 10
  }
];

const NEW_RELEASES_STORAGE_KEY = 'wavecraft_cached_releases_v1';

function getStoredNewReleases(): AlbumResult[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(NEW_RELEASES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {}
  return FALLBACK_NEW_RELEASES;
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
        const results = data?.results || [];
        const songEntries = results.filter((r: any) => r.wrapperType === 'track');
        if (songEntries.length > 0) {
          const albumArt = album.coverUrl || album.coverArt || DEFAULT_THUMBNAIL;
          const mappedTracks: Track[] = songEntries.map((s: any) => ({
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
      const results: any[] = data?.results || [];
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
      const results: any[] = data?.results || [];
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
    const results = data?.results || [];
    if (!Array.isArray(results) || results.length === 0) return [];

    return results.map((item: any) => {
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
