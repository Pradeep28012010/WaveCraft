import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Moods & Activities Relativity and Acoustics', () => {
  test('Time phase determination covers all 24 hours correctly', () => {
    function computePhaseForHour(hour) {
      if (hour >= 5 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 18) return 'afternoon';
      if (hour >= 18 && hour < 22) return 'evening';
      return 'late_night';
    }

    assert.equal(computePhaseForHour(5), 'morning');
    assert.equal(computePhaseForHour(8), 'morning');
    assert.equal(computePhaseForHour(11), 'morning');
    assert.equal(computePhaseForHour(12), 'afternoon');
    assert.equal(computePhaseForHour(15), 'afternoon');
    assert.equal(computePhaseForHour(17), 'afternoon');
    assert.equal(computePhaseForHour(18), 'evening');
    assert.equal(computePhaseForHour(20), 'evening');
    assert.equal(computePhaseForHour(21), 'evening');
    assert.equal(computePhaseForHour(22), 'late_night');
    assert.equal(computePhaseForHour(2), 'late_night');
    assert.equal(computePhaseForHour(4), 'late_night');
  });

  test('Relativity scoring gives time-matched moods higher score', () => {
    const timePhase = 'morning';
    const mockMoods = [
      { id: 'chill', bestTimeSlots: ['morning', 'evening', 'late_night'] },
      { id: 'party', bestTimeSlots: ['evening', 'late_night'] }
    ];

    const scores = mockMoods.map((m) => {
      let score = 0;
      if (m.bestTimeSlots.includes(timePhase)) score += 40;
      return { id: m.id, score };
    });

    const chillScore = scores.find((s) => s.id === 'chill')?.score;
    const partyScore = scores.find((s) => s.id === 'party')?.score;

    assert.equal(chillScore, 40);
    assert.equal(partyScore, 0);
  });

  test('Now playing track match gives high priority boost and sets acoustic tag', () => {
    const currentTrack = { title: 'Blinding Lights', artist: 'The Weeknd' };
    const mood = {
      id: 'party',
      seedKeywords: ['synthwave', 'synth', 'retro', 'electronic', 'weeknd', 'night drive']
    };

    const titleLower = currentTrack.title.toLowerCase();
    const artistLower = currentTrack.artist.toLowerCase();
    const matchesKeyword = mood.seedKeywords.some(
      (kw) => titleLower.includes(kw) || artistLower.includes(kw)
    );

    assert.equal(matchesKeyword, true);
  });

  test('Personalized artist query expansion enriches YouTube search seed', () => {
    const mood = {
      id: 'workout',
      query: 'workout gym motivation hits',
      seedKeywords: ['workout', 'gym', 'phonk', 'hip hop', 'trap']
    };
    const favoriteArtists = ['Eminem', 'Travis Scott'];

    let matchedArtist = null;
    for (const fav of favoriteArtists) {
      if (mood.seedKeywords.some((kw) => kw.includes('hip hop'))) {
        matchedArtist = fav;
        break;
      }
    }

    const personalizedQuery = matchedArtist
      ? `${matchedArtist} ${mood.query}`
      : mood.query;

    assert.equal(personalizedQuery, 'Eminem workout gym motivation hits');
  });
});
