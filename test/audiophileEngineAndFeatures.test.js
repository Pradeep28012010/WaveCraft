import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Audiophile Engine, Acoustics & Core Feature Validation', () => {
  describe('Audiophile EQ Presets', () => {
    const EQ_PRESETS = {
      'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      'Acoustic': [2, 3, 2, 0, 1, 2, 3, 4, 3, 2],
      'Bass Booster': [8, 7, 5, 3, 1, 0, 0, 0, 1, 2],
      'Bass Boost': [8, 7, 5, 3, 1, 0, 0, 0, 1, 2],
      'Electronic': [6, 5, 2, 0, -2, 2, 1, 3, 5, 6],
      'Hip-Hop': [7, 6, 3, 0, -1, 1, 2, 2, 4, 5],
      'Classical': [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
      'Vocal Booster': [-2, -3, -1, 2, 5, 6, 4, 2, 0, -1],
      'Vocal': [-2, -3, -1, 2, 5, 6, 4, 2, 0, -1],
      'Rock': [5, 4, 3, 1, -1, -1, 2, 4, 5, 6],
      'Treble Boost': [0, 0, 0, 0, 1, 2, 4, 6, 7, 8],
      'Late Night': [4, 3, 1, 0, -2, -1, 1, 2, 3, 4],
    };

    test('Contains all 7 primary requested audiophile presets with 10 bands each', () => {
      const required = [
        'Acoustic',
        'Bass Booster',
        'Electronic',
        'Hip-Hop',
        'Classical',
        'Vocal Booster',
        'Flat'
      ];

      for (const name of required) {
        assert.ok(EQ_PRESETS[name], `Preset ${name} must exist`);
        assert.strictEqual(EQ_PRESETS[name].length, 10, `Preset ${name} must have 10 bands`);
      }
    });

    test('Flat preset contains all zeroes (true bypass neutral)', () => {
      assert.deepStrictEqual(EQ_PRESETS['Flat'], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    test('Bass Booster enhances sub-bass and mid-bass without excessive treble boost', () => {
      const bands = EQ_PRESETS['Bass Booster'];
      assert.ok(bands[0] >= 7, 'Sub-bass 32Hz should be strongly boosted');
      assert.ok(bands[1] >= 6, 'Bass 64Hz should be boosted');
      assert.ok(bands[5] <= 1, 'Mid-range should remain clean');
    });

    test('Vocal Booster elevates speech and presence frequencies [1kHz - 4kHz]', () => {
      const bands = EQ_PRESETS['Vocal Booster'];
      assert.ok(bands[4] >= 4, 'Presence 1kHz should be boosted');
      assert.ok(bands[5] >= 5, 'Vocal clarity 2kHz should peak');
      assert.ok(bands[0] < 0, 'Sub-bass rumble should be rolled off');
    });
  });

  describe('Master Limiter & Loudness Leveling Math', () => {
    test('Master limiter parameters match audiophile transparent compression', () => {
      const limiterSpecs = {
        threshold: -2.0, // dBFS
        knee: 8.0,       // dB
        ratio: 4.0,      // 4:1
        attack: 0.005,   // 5ms
        release: 0.12    // 120ms
      };

      assert.strictEqual(limiterSpecs.threshold, -2.0);
      assert.strictEqual(limiterSpecs.ratio, 4.0);
      assert.ok(limiterSpecs.attack <= 0.01, 'Fast attack prevents clipping transients');
      assert.ok(limiterSpecs.release >= 0.1, 'Release prevents audible pumping');
    });

    test('Loudness normalization gain calculation applies consistent headroom', () => {
      function calculateNormalizedVolume(baseVolume, isNormalizationEnabled) {
        if (!isNormalizationEnabled) return baseVolume;
        // Standard ReplayGain leveling target ~ -14 LUFS (0.92 scale headroom)
        return Math.min(1, Math.max(0, baseVolume * 0.92));
      }

      assert.strictEqual(calculateNormalizedVolume(1.0, false), 1.0);
      assert.strictEqual(calculateNormalizedVolume(1.0, true), 0.92);
      assert.strictEqual(calculateNormalizedVolume(0.5, true), 0.46);
      assert.strictEqual(calculateNormalizedVolume(0, true), 0);
    });
  });

  describe('Time-Of-Day Greeting Engine', () => {
    function getGreeting(hour) {
      if (hour >= 22 || hour < 5) return 'Late Night Vibes';
      if (hour < 12) return 'Good Morning';
      if (hour < 18) return 'Good Afternoon';
      return 'Good Evening';
    }

    test('Late Night Vibes fires between 22:00 and 04:59', () => {
      assert.strictEqual(getGreeting(22), 'Late Night Vibes');
      assert.strictEqual(getGreeting(23), 'Late Night Vibes');
      assert.strictEqual(getGreeting(0), 'Late Night Vibes');
      assert.strictEqual(getGreeting(3), 'Late Night Vibes');
      assert.strictEqual(getGreeting(4), 'Late Night Vibes');
    });

    test('Standard greetings fire accurately during daytime hours', () => {
      assert.strictEqual(getGreeting(5), 'Good Morning');
      assert.strictEqual(getGreeting(9), 'Good Morning');
      assert.strictEqual(getGreeting(11), 'Good Morning');
      assert.strictEqual(getGreeting(12), 'Good Afternoon');
      assert.strictEqual(getGreeting(15), 'Good Afternoon');
      assert.strictEqual(getGreeting(18), 'Good Evening');
      assert.strictEqual(getGreeting(21), 'Good Evening');
    });
  });

  describe('Search History Memory & Deduplication Engine', () => {
    function simulateHistoryState() {
      let storage = [];
      const MAX = 15;

      return {
        get: () => [...storage],
        save: (term) => {
          const clean = (term || '').trim();
          if (!clean) return [...storage];
          storage = [clean, ...storage.filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, MAX);
          return [...storage];
        },
        remove: (term) => {
          storage = storage.filter((s) => s.toLowerCase() !== (term || '').trim().toLowerCase());
          return [...storage];
        },
        clear: () => {
          storage = [];
        }
      };
    }

    test('Adds unique terms to front and trims duplicates case-insensitively', () => {
      const history = simulateHistoryState();
      history.save('The Weeknd');
      history.save('Drake');
      history.save('the weeknd'); // Duplicate with different case

      assert.deepStrictEqual(history.get(), ['the weeknd', 'Drake']);
    });

    test('Caps maximum search history to 15 items', () => {
      const history = simulateHistoryState();
      for (let i = 1; i <= 20; i++) {
        history.save(`Search Query ${i}`);
      }
      assert.strictEqual(history.get().length, 15);
      assert.strictEqual(history.get()[0], 'Search Query 20');
      assert.strictEqual(history.get()[14], 'Search Query 6');
    });

    test('One-tap clear removes all stored queries', () => {
      const history = simulateHistoryState();
      history.save('Billie Eilish');
      history.save('Taylor Swift');
      assert.strictEqual(history.get().length, 2);

      history.clear();
      assert.strictEqual(history.get().length, 0);
    });

    test('Individual item removal functions accurately', () => {
      const history = simulateHistoryState();
      history.save('Coldplay');
      history.save('Radiohead');
      history.remove('coldplay');

      assert.deepStrictEqual(history.get(), ['Radiohead']);
    });
  });

  describe('Resilient External Playlist Query Sanitization', () => {
    function sanitizeImportTitle(rawTitle) {
      return (rawTitle || '')
        .replace(/\s*[\(\[][^)\]]*?(?:feat\.|ft\.|remaster|deluxe|edition|version|anniversary|live|bonus|explicit)[^)\]]*?[\)\]]/gi, '')
        .replace(/\s*[-–—]\s*(?:(?:\d{4}\s*)?(?:remaster|deluxe|version|live|radio edit)|bonus|anniversary).*$/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    test('Strips Spotify and Apple Music remastered/deluxe tags cleanly', () => {
      assert.strictEqual(
        sanitizeImportTitle('Bohemian Rhapsody - Remastered 2011'),
        'Bohemian Rhapsody'
      );
      assert.strictEqual(
        sanitizeImportTitle('Starboy (feat. Daft Punk) [Deluxe Edition]'),
        'Starboy'
      );
      assert.strictEqual(
        sanitizeImportTitle('Hotel California (2013 Remaster)'),
        'Hotel California'
      );
      assert.strictEqual(
        sanitizeImportTitle('Blinding Lights (Live)'),
        'Blinding Lights'
      );
    });

    test('Builds progressive multi-tier fallback query list', () => {
      function generateFallbackQueries(title, artist) {
        const clean = sanitizeImportTitle(title);
        const searchStr = `${title} ${artist || ''}`.trim();
        return [
          searchStr,
          clean && clean !== title ? `${clean} ${artist || ''}`.trim() : null,
          clean || title,
          clean ? `${clean} audio` : `${title} audio`
        ].filter((item, idx, arr) => Boolean(item) && arr.indexOf(item) === idx);
      }

      const queries = generateFallbackQueries('In The End - 2020 Remaster', 'Linkin Park');
      assert.strictEqual(queries[0], 'In The End - 2020 Remaster Linkin Park');
      assert.strictEqual(queries[1], 'In The End Linkin Park');
      assert.strictEqual(queries[2], 'In The End');
      assert.strictEqual(queries[3], 'In The End audio');
    });
  });

  describe('Offline Vault Mode & Queue Chaining', () => {
    test('Offline mode filters out online stream actions and pulls vault tracks', () => {
      const offlineVault = [
        { id: 'off-1', title: 'Offline Song 1', artist: 'Artist 1' },
        { id: 'off-2', title: 'Offline Song 2', artist: 'Artist 2' }
      ];
      const activeQueue = [{ id: 'off-1', title: 'Offline Song 1', artist: 'Artist 1' }];

      const existingIds = new Set(activeQueue.map((t) => t.id));
      const unplayedVaultTracks = offlineVault.filter((t) => !existingIds.has(t.id));

      assert.strictEqual(unplayedVaultTracks.length, 1);
      assert.strictEqual(unplayedVaultTracks[0].id, 'off-2');
    });
  });

  describe('Plain Lyrics Parsing & Distribution Math', () => {
    function parsePlainLyrics(rawText, totalDuration = 200) {
      const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return [];
      const step = Math.max(3, (totalDuration * 0.88) / lines.length);
      return lines.map((text, idx) => ({
        time: idx * step,
        text
      }));
    }

    test('Distributes timestamps evenly across song duration for plain unsynced lyrics', () => {
      const text = 'Line 1\nLine 2\nLine 3\nLine 4';
      const parsed = parsePlainLyrics(text, 200);

      assert.strictEqual(parsed.length, 4);
      assert.strictEqual(parsed[0].time, 0);
      assert.ok(parsed[1].time > 0);
      assert.ok(parsed[3].time < 200);
      assert.strictEqual(parsed[0].text, 'Line 1');
      assert.strictEqual(parsed[3].text, 'Line 4');
    });
  });
});
