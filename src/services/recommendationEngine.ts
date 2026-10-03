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
        a.toLowerCase() !== 'various artists' &&
        a.toLowerCase() !== 'youtube music'
    );
}

/**
 * Cleans an album/movie name for contextual soundtrack discovery.
 */
function cleanAlbumName(album?: string): string {
  if (!album || album === 'WaveCraft Cloud') return '';
  return album
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/original motion picture soundtrack|soundtrack|ost/gi, '')
    .trim();
}

/**
 * Curated Artist Vibe & Style Map to recommend genuinely complementary musical peers.
 */
const ARTIST_VIBE_PEERS: Record<string, string[]> = {
  'the weeknd': ['Post Malone', 'Daft Punk', 'Bruno Mars', 'Dua Lipa', 'SZA', 'Travis Scott'],
  'lady gaga': ['Bruno Mars', 'Dua Lipa', 'Adele', 'Katy Perry', 'Elton John', 'Ariana Grande'],
  'bruno mars': ['Lady Gaga', 'The Weeknd', 'Silk Sonic', 'Dua Lipa', 'Mark Ronson', 'Charlie Puth'],
  'billie eilish': ['Olivia Rodrigo', 'Lorde', 'Lana Del Rey', 'Sabrina Carpenter', 'Finneas', 'Gracie Abrams'],
  'sabrina carpenter': ['Olivia Rodrigo', 'Chappell Roan', 'Taylor Swift', 'Ariana Grande', 'Dua Lipa', 'Camila Cabello'],
  'kendrick lamar': ['J. Cole', 'Travis Scott', 'Drake', 'Baby Keem', 'A$AP Rocky', 'Metro Boomin'],
  'taylor swift': ['Sabrina Carpenter', 'Gracie Abrams', 'Olivia Rodrigo', 'Ed Sheeran', 'Lana Del Rey'],
  'post malone': ['Swae Lee', 'Morgan Wallen', 'The Weeknd', '21 Savage', 'Juice WRLD', 'Khalid'],
  'dua lipa': ['Calvin Harris', 'Miley Cyrus', 'Sabrina Carpenter', 'The Weeknd', 'Bebe Rexha'],
  'coldplay': ['Imagine Dragons', 'OneRepublic', 'The Killers', 'Keane', 'Oasis', 'Snow Patrol'],
  'arijit singh': ['Atif Aslam', 'Mohit Chauhan', 'Shreya Ghoshal', 'KK', 'Jubin Nautiyal', 'Pritam'],
  'anirudh ravichander': ['AR Rahman', 'Yuvan Shankar Raja', 'Devi Sri Prasad', 'Santhosh Narayanan', 'GV Prakash'],
  'diljit dosanjh': ['AP Dhillon', 'Karan Aujla', 'Shubh', 'Sidhu Moose Wala', 'Badshah'],
  'sza': ['Summer Walker', 'Kehlani', 'Jhené Aiko', 'Frank Ocean', 'Kali Uchis', 'The Weeknd'],
  'travis scott': ['Don Toliver', 'Playboi Carti', 'Future', 'Metro Boomin', '21 Savage', 'Kendrick Lamar'],
  'ed sheeran': ['Shawn Mendes', 'James Arthur', 'Lewis Capaldi', 'Sam Smith', 'Charlie Puth'],
  'chappell roan': ['Sabrina Carpenter', 'Renee Rapp', 'Boygenius', 'Olivia Rodrigo', 'Remi Wolf'],
  'olivia rodrigo': ['Sabrina Carpenter', 'Billie Eilish', 'Conan Gray', 'Tate McRae', 'Lorde'],
  'ar rahman': ['Anirudh Ravichander', 'Yuvan Shankar Raja', 'Harris Jayaraj', 'Hariharan', 'Shreya Ghoshal'],
  'shreya ghoshal': ['Arijit Singh', 'Shankar Mahadevan', 'Sonu Nigam', 'Sunidhi Chauhan', 'Chinmayi'],
  'eminem': ['Dr. Dre', '50 Cent', 'Snoop Dogg', 'Royce da 5\'9"', 'NF', 'Rihanna'],
  'benson boone': ['Teddy Swims', 'Hozier', 'Dean Lewis', 'Stephen Sanchez', 'David Kushner'],
  'hozier': ['Teddy Swims', 'Noah Kahan', 'Benson Boone', 'Florence + The Machine', 'Lord Huron']
};

function getSimilarArtists(artist: string): string[] {
  const norm = (artist || '').toLowerCase();
  for (const [key, peers] of Object.entries(ARTIST_VIBE_PEERS)) {
    if (norm.includes(key) || key.includes(norm)) {
      return peers;
    }
  }
  return ['Bruno Mars', 'The Weeknd', 'Billie Eilish', 'Coldplay'];
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

  for (const track of likedSongs) {
    if (track?.artist) addWeight(track.artist, 14);
  }

  for (const entry of playHistory) {
    if (entry?.artist) addWeight(entry.artist, 6);
  }

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
 * 1. Current song signals (lead artist, stylistic musical peers, album context)
 * 2. User taste profile (Liked Songs artist affinity)
 * 3. Strict normalized title deduplication (no duplicate versions/remixes of the same song)
 * 4. High artist diversity (max 2 tracks per artist)
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

  const similarPeers = getSimilarArtists(primaryArtist);
  const peer1 = similarPeers[0];
  const peer2 = similarPeers[1] || similarPeers[0];

  const queries: string[] = [
    `${primaryArtist} top hits songs`,
    `${peer1} top hits songs`,
    `${peer2} top hits songs`
  ];

  if (secondaryArtist) {
    queries.push(`${secondaryArtist} top hits`);
  } else if (cleanedAlbum && cleanedAlbum.length > 2) {
    queries.push(`${cleanedAlbum} songs`);
  }

  // Fetch candidate pools in parallel
  const results = await Promise.allSettled(queries.map((q) => searchTracks(q)));
  const candidatePool: Track[] = [];
  for (const res of results) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      candidatePool.push(...res.value);
    }
  }

  // Also include user's liked songs that match the vibe or artist
  const { likedSongs, recentlyPlayed } = useLibraryStore.getState();
  const affinityMap = buildUserArtistAffinity();

  for (const liked of likedSongs) {
    if (liked && liked.id) candidatePool.push(liked);
  }

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

    // Has verified youtube stream
    if (candidate.youtubeId) score += 35;

    // Artist relationship to current song and peers
    const candArtists = extractArtists(candidate.artist);
    const candArtistLower = (candidate.artist || '').toLowerCase();

    if (candArtistLower.includes(primaryArtist.toLowerCase())) {
      score += 24;
    } else if (similarPeers.some((p) => candArtistLower.includes(p.toLowerCase()))) {
      score += 26; // High reward for stylistic peer variety!
    }

    if (secondaryArtist && candArtistLower.includes(secondaryArtist.toLowerCase())) {
      score += 18;
    }

    // Same album / soundtrack context
    if (
      cleanedAlbum &&
      candidate.album &&
      cleanAlbumName(candidate.album).toLowerCase() === cleanedAlbum.toLowerCase()
    ) {
      score += 20;
    }

    // User Taste Profile Affinity
    let userTasteBoost = 0;
    for (const a of candArtists) {
      const aff = affinityMap.get(a.toLowerCase()) || 0;
      userTasteBoost = Math.max(userTasteBoost, Math.min(30, aff));
    }
    score += userTasteBoost;

    // Explicit Liked Song boost
    if (likedIds.has(candidate.id)) {
      score += 25;
    }

    // Penalize recently played songs
    if (recentIds.has(candidate.id) || recentTitles.has(normTitle)) {
      score -= 50;
    }

    // Hard penalty on karaoke / instrumental / preview clutter
    const rawTitleLower = candidate.title.toLowerCase();
    if (/\b(karaoke|instrumental|ringtone|dialogue|teaser|trailer|reaction|unboxing)\b/i.test(rawTitleLower)) {
      score -= 80;
    }

    score += Math.random() * 6;

    scoredCandidates.push({
      track: candidate,
      score,
      primaryArtistKey: (candArtists[0] || candidate.artist || '').toLowerCase()
    });
  }

  scoredCandidates.sort((a, b) => b.score - a.score);

  // Maximum 2 tracks per artist to guarantee delicious variety in the radio queue
  const selected: Track[] = [];
  const artistCounts = new Map<string, number>();

  for (const item of scoredCandidates) {
    if (selected.length >= limit) break;
    const count = artistCounts.get(item.primaryArtistKey) || 0;
    if (count >= 2 && scoredCandidates.length > limit) continue;
    selected.push(item.track);
    artistCounts.set(item.primaryArtistKey, count + 1);
  }

  // Backfill if slots remain
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
 * with intelligent, taste-predicted recommendations.
 */
export async function playTrackWithSmartQueue(seedTrack: Track): Promise<void> {
  const player = usePlayerStore.getState();
  // Start playing the chosen song immediately with a clean 1-song queue
  player.playTrack(seedTrack, [seedTrack], 0);

  try {
    const recommendations = await getSmartRecommendations(seedTrack, [seedTrack], 10);
    if (recommendations.length === 0) return;

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
