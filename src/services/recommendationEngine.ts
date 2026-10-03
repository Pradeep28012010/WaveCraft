import type { Track } from '../types';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import { searchTracks } from './youtube';

/**
 * Normalizes a song title to its core identity so remixes, slowed versions,
 * lyrical videos, or soundtrack tags of the exact same song are deduplicated.
 */
export function normalizeSongTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '') // remove (From "..."), [Slowed], etc.
    .replace(
      /\b(lofi|lo-fi|slowed|reverb|remix|version|unplugged|acoustic|reprised|reprise|lyrical|lyrics|full video|video song|audio|ost|title track|female version|male version)\b/gi,
      ''
    )
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts individual clean artist names from a track's artist string.
 */
function extractArtists(artistStr?: string): string[] {
  if (!artistStr) return [];
  return artistStr
    .split(/,|&|\bfeat\.?\b|\bft\.?\b|\bx\b/i)
    .map((a) => a.trim())
    .filter(
      (a) =>
        a.length > 1 &&
        a.toLowerCase() !== 'unknown artist' &&
        a.toLowerCase() !== 'various artists'
    );
}

/**
 * Cleans an album/movie name for contextual soundtrack discovery.
 */
function cleanAlbumName(album?: string): string {
  if (!album) return '';
  return album
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/original motion picture soundtrack|soundtrack|ost/gi, '')
    .trim();
}

/**
 * Builds an artist affinity score map from the user's Liked Songs, Play History,
 * and Recently Played tracks to predict their personal taste.
 */
function buildUserArtistAffinity(): Map<string, number> {
  const { likedSongs, playHistory, recentlyPlayed } = useLibraryStore.getState();
  const affinity = new Map<string, number>();

  const addWeight = (artistStr: string | undefined, weight: number) => {
    for (const artist of extractArtists(artistStr)) {
      const key = artist.toLowerCase();
      affinity.set(key, (affinity.get(key) || 0) + weight);
    }
  };

  // Liked songs are the strongest explicit signal of user taste
  for (const track of likedSongs) {
    if (track?.artist) addWeight(track.artist, 14);
  }

  // Play history entries
  for (const entry of playHistory) {
    if (entry?.artist) addWeight(entry.artist, 6);
  }

  // Recently played gives session-level mood context
  recentlyPlayed.slice(0, 15).forEach((item, idx) => {
    const artist = item?.track?.artist;
    if (artist) {
      addWeight(artist, Math.max(2, 10 - idx * 0.5));
    }
  });

  return affinity;
}

/**
 * Predicts and ranks the best next songs to play after `seedTrack` by combining:
 * 1. Current song signals (lead artist, featured artist, movie/album context)
 * 2. User taste profile (Liked Songs, Play History, Recently Played artist affinity)
 * 3. Strict normalized title deduplication (no duplicate versions/remixes of the same song)
 */
export async function getSmartRecommendations(
  seedTrack: Track,
  existingQueue: Track[] = [],
  limit = 10
): Promise<Track[]> {
  const seedArtists = extractArtists(seedTrack.artist);
  const primaryArtist = seedArtists[0] || seedTrack.artist || 'Top Hits';
  const secondaryArtist = seedArtists[1] || '';
  const cleanedAlbum = cleanAlbumName(seedTrack.album);
  const normSeedTitle = normalizeSongTitle(seedTrack.title);

  const affinityMap = buildUserArtistAffinity();
  const { likedSongs, recentlyPlayed } = useLibraryStore.getState();

  // Find user's top affinity artists that aren't already the primary artist
  const sortedAffinityArtists = Array.from(affinityMap.entries())
    .filter(
      ([artist]) =>
        !primaryArtist.toLowerCase().includes(artist) &&
        !artist.includes(primaryArtist.toLowerCase())
    )
    .sort((a, b) => b[1] - a[1])
    .map(([artist]) => artist);

  const userFavoriteArtist =
    sortedAffinityArtists.length > 0
      ? sortedAffinityArtists[Math.floor(Math.random() * Math.min(3, sortedAffinityArtists.length))]
      : '';

  // Construct 3 complementary discovery queries
  const queries: string[] = [`${primaryArtist} hits`];

  if (
    cleanedAlbum &&
    cleanedAlbum.length > 2 &&
    normalizeSongTitle(cleanedAlbum) !== normSeedTitle
  ) {
    queries.push(`${cleanedAlbum} ${primaryArtist}`);
  } else if (secondaryArtist) {
    queries.push(`${secondaryArtist} hits`);
  } else {
    queries.push(`${primaryArtist} best songs`);
  }

  if (userFavoriteArtist) {
    queries.push(`${userFavoriteArtist} hits`);
  } else if (secondaryArtist) {
    queries.push(`${primaryArtist} ${secondaryArtist}`);
  }

  // Fetch candidate pools in parallel
  const results = await Promise.allSettled(queries.map((q) => searchTracks(q)));
  const candidatePool: Track[] = [];
  for (const res of results) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      candidatePool.push(...res.value);
    }
  }

  // Also consider user's liked songs that match the vibe or artist
  for (const liked of likedSongs) {
    if (liked && liked.id) candidatePool.push(liked);
  }

  // Track seen IDs and normalized titles to prevent any duplicate/remix versions
  const seenIds = new Set<string>(existingQueue.map((t) => t.id));
  seenIds.add(seedTrack.id);

  const seenTitles = new Set<string>(
    existingQueue.map((t) => normalizeSongTitle(t.title)).filter(Boolean)
  );
  if (normSeedTitle) seenTitles.add(normSeedTitle);

  const recentTracks = recentlyPlayed
    .slice(0, 8)
    .map((item) => item?.track)
    .filter(Boolean);
  const recentIds = new Set<string>(recentTracks.map((t) => t.id));
  const recentTitles = new Set<string>(
    recentTracks.map((t) => normalizeSongTitle(t.title)).filter(Boolean)
  );
  const likedIds = new Set<string>(likedSongs.map((t) => t.id));

  const scoredCandidates: { track: Track; score: number; primaryArtistKey: string }[] = [];

  for (const candidate of candidatePool) {
    if (!candidate || !candidate.id || !candidate.title) continue;
    if (seenIds.has(candidate.id)) continue;

    const normTitle = normalizeSongTitle(candidate.title);
    if (!normTitle || normTitle.length < 2) continue;
    // Never recommend another version/remix of the current song or queued songs
    if (seenTitles.has(normTitle)) continue;
    if (
      normSeedTitle.length >= 4 &&
      (normTitle.includes(normSeedTitle) || normSeedTitle.includes(normTitle))
    ) {
      continue;
    }

    seenIds.add(candidate.id);
    seenTitles.add(normTitle);

    let score = 0;

    // 1. Direct 320kbps stream availability is crucial for instant gapless playback
    if (candidate.audioUrl) score += 35;

    // 2. Artist relationship to current song
    const candArtists = extractArtists(candidate.artist);
    const candArtistLower = (candidate.artist || '').toLowerCase();
    if (candArtistLower.includes(primaryArtist.toLowerCase())) {
      score += 28;
    }
    if (secondaryArtist && candArtistLower.includes(secondaryArtist.toLowerCase())) {
      score += 20;
    }

    // 3. Same album / soundtrack context
    if (
      cleanedAlbum &&
      candidate.album &&
      cleanAlbumName(candidate.album).toLowerCase() === cleanedAlbum.toLowerCase()
    ) {
      score += 22;
    }

    // 4. User Taste Profile Affinity (predicts how much the user likes these artists)
    let userTasteBoost = 0;
    for (const a of candArtists) {
      const aff = affinityMap.get(a.toLowerCase()) || 0;
      userTasteBoost = Math.max(userTasteBoost, Math.min(30, aff));
    }
    score += userTasteBoost;

    // 5. Explicit Liked Song boost
    if (likedIds.has(candidate.id)) {
      score += 18;
    }

    // 6. Penalize songs played in the last 8 tracks so recommendations stay fresh
    if (recentIds.has(candidate.id) || recentTitles.has(normTitle)) {
      score -= 45;
    }

    // 7. Penalize explicit karaoke/instrumental/teaser clutter
    const rawTitleLower = candidate.title.toLowerCase();
    if (/\b(karaoke|instrumental|ringtone|dialogue|teaser|trailer)\b/i.test(rawTitleLower)) {
      score -= 60;
    }

    // 8. Controlled discovery jitter so every session feels alive
    score += Math.random() * 8;

    scoredCandidates.push({
      track: candidate,
      score,
      primaryArtistKey: (candArtists[0] || candidate.artist || '').toLowerCase()
    });
  }

  // Sort by highest predicted taste score
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Diversify ordering so we blend the lead artist with related/taste-matched artists
  const selected: Track[] = [];
  const artistCounts = new Map<string, number>();

  for (const item of scoredCandidates) {
    if (selected.length >= limit) break;
    const count = artistCounts.get(item.primaryArtistKey) || 0;
    if (count >= 4 && scoredCandidates.length > limit) continue;
    selected.push(item.track);
    artistCounts.set(item.primaryArtistKey, count + 1);
  }

  // Backfill if diversity filter left slots open
  if (selected.length < limit) {
    for (const item of scoredCandidates) {
      if (selected.length >= limit) break;
      if (!selected.some((t) => t.id === item.track.id)) {
        selected.push(item.track);
      }
    }
  }

  return selected;
}

/**
 * Plays a single chosen track immediately and asynchronously populates the Up Next queue
 * with intelligent, taste-predicted recommendations (instead of duplicate search results).
 */
export async function playTrackWithSmartQueue(seedTrack: Track): Promise<void> {
  const player = usePlayerStore.getState();
  // Start playing the chosen song immediately with a clean 1-song queue
  player.playTrack(seedTrack, [seedTrack], 0);

  try {
    const recommendations = await getSmartRecommendations(seedTrack, [seedTrack], 10);
    if (recommendations.length === 0) return;

    // Only append if the user is still listening to this seed track
    const currentState = usePlayerStore.getState();
    if (currentState.currentTrack?.id === seedTrack.id) {
      const existingIds = new Set(currentState.queue.map((t) => t.id));
      const newTracks = recommendations.filter((t) => !existingIds.has(t.id));
      if (newTracks.length > 0) {
        usePlayerStore.setState({
          queue: [...currentState.queue, ...newTracks],
          originalQueue: [...currentState.originalQueue, ...newTracks]
        });
      }
    }
  } catch {
    // Ignore background recommendation errors
  }
}
