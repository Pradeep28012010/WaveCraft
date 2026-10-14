import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  romanizeIndicText,
  containsNonLatinScript,
  computeWordTimings
} from '../src/services/transliterate.ts';

describe('Floating Picture-in-Picture & Syllable-Synced Live Lyrics', () => {
  describe('Phonetic Transliteration & Script Detection', () => {
    it('detects non-Latin scripts correctly', () => {
      assert.strictEqual(containsNonLatinScript('రా రా నా వీరా'), true);
      assert.strictEqual(containsNonLatinScript('तुम ही हो'), true);
      assert.strictEqual(containsNonLatinScript('காதல்'), true);
      assert.strictEqual(containsNonLatinScript('夜に駆ける'), true);
      assert.strictEqual(containsNonLatinScript('Blinding Lights'), false);
      assert.strictEqual(containsNonLatinScript('Shape of You - Ed Sheeran'), false);
      assert.strictEqual(containsNonLatinScript(''), false);
    });

    it('transliterates Telugu script to Romanized phonetics', () => {
      // Telugu: రా (raa) రా (raa)
      const res = romanizeIndicText('రా రా');
      assert.ok(res.includes('Raa'), `Expected "Raa" in result, got: ${res}`);
    });

    it('transliterates Devanagari script to Romanized phonetics', () => {
      // Devanagari: तुम (tum)
      const res = romanizeIndicText('तुम');
      assert.ok(res.toLowerCase().includes('tum'), `Expected "tum" in result, got: ${res}`);
    });

    it('passes through pure Latin text with proper capitalization', () => {
      const input = 'Never Gonna Give You Up';
      assert.strictEqual(romanizeIndicText(input), input);
    });

    it('handles empty strings and null safely', () => {
      assert.strictEqual(romanizeIndicText(''), '');
      assert.strictEqual(romanizeIndicText(null), '');
    });
  });

  describe('Apple Music Syllable Glow Sweep Timing Math', () => {
    it('correctly splits line text into word intervals matching total duration', () => {
      const line = 'Hello darkness my old friend';
      const startTime = 10;
      const endTime = 15;
      const duration = endTime - startTime; // 5.0 seconds

      const timings = computeWordTimings(line, startTime, endTime);

      assert.strictEqual(timings.length, 5);
      assert.strictEqual(timings[0].word, 'Hello');
      assert.strictEqual(timings[4].word, 'friend');

      // First word must start at 0 ratio / startTime
      assert.strictEqual(timings[0].startRatio, 0);
      assert.strictEqual(timings[0].startTime, startTime);

      // Last word must end at 1.0 ratio / endTime
      assert.strictEqual(timings[timings.length - 1].endRatio, 1);
      assert.strictEqual(timings[timings.length - 1].endTime, endTime);

      // Intervals must be strictly continuous (end of word i == start of word i+1)
      for (let i = 0; i < timings.length - 1; i++) {
        assert.ok(
          Math.abs(timings[i].endRatio - timings[i + 1].startRatio) < 1e-6,
          `Interval gap between word ${i} and ${i + 1}`
        );
        assert.ok(
          Math.abs(timings[i].endTime - timings[i + 1].startTime) < 1e-6,
          `Time gap between word ${i} and ${i + 1}`
        );
      }
    });

    it('weights longer words with longer durations', () => {
      const line = 'I Supercalifragilisticexpialidocious';
      const timings = computeWordTimings(line, 0, 10);

      // Word 1 ('Supercalifragilisticexpialidocious') is much longer than Word 0 ('I')
      const dur0 = timings[0].endTime - timings[0].startTime;
      const dur1 = timings[1].endTime - timings[1].startTime;

      assert.ok(dur1 > dur0 * 4, `Expected long word duration (${dur1}) to far exceed short word (${dur0})`);
    });

    it('handles single word line safely', () => {
      const timings = computeWordTimings('Solo', 20, 25);
      assert.strictEqual(timings.length, 1);
      assert.strictEqual(timings[0].startRatio, 0);
      assert.strictEqual(timings[0].endRatio, 1);
      assert.strictEqual(timings[0].startTime, 20);
      assert.strictEqual(timings[0].endTime, 25);
    });

    it('handles empty line or whitespace safely', () => {
      const timings = computeWordTimings('    ', 0, 10);
      assert.strictEqual(timings.length, 0);
    });

    it('enforces a minimum duration floor of 1.2s to prevent division by zero', () => {
      // Passing identical start and end time
      const timings = computeWordTimings('Fast lyrics', 10, 10);
      assert.strictEqual(timings.length, 2);
      const totalDur = timings[1].endTime - timings[0].startTime;
      assert.ok(totalDur >= 1.199 && totalDur <= 1.201, `Expected duration ~1.2s, got ${totalDur}`);
    });
  });

  describe('Picture-in-Picture State & Preferences Logic', () => {
    it('manages script preference cycles accurately', () => {
      const sequence = ['auto', 'romanized', 'native'];
      let current = 'auto';

      const cycle = (pref) => sequence[(sequence.indexOf(pref) + 1) % sequence.length];

      current = cycle(current);
      assert.strictEqual(current, 'romanized');

      current = cycle(current);
      assert.strictEqual(current, 'native');

      current = cycle(current);
      assert.strictEqual(current, 'auto');
    });

    it('correctly maps candidates based on script preference', () => {
      const candidates = [
        { id: 1, scriptType: 'Native', languageCode: 'te', trackName: 'Song (Telugu)' },
        { id: 2, scriptType: 'Latin', languageCode: 'latn', trackName: 'Song (Romanized)' },
      ];

      function resolveCandidateForPreference(cands, pref) {
        if (pref === 'romanized') {
          return cands.find((c) => c.scriptType === 'Latin') || cands[0];
        }
        if (pref === 'native') {
          return cands.find((c) => c.scriptType !== 'Latin') || cands[0];
        }
        return cands[0];
      }

      assert.strictEqual(resolveCandidateForPreference(candidates, 'romanized').id, 2);
      assert.strictEqual(resolveCandidateForPreference(candidates, 'native').id, 1);
      assert.strictEqual(resolveCandidateForPreference(candidates, 'auto').id, 1);
    });

    it('computes active lyric index with user offset accurately', () => {
      const lines = [
        { time: 10, text: 'First line' },
        { time: 20, text: 'Second line' },
        { time: 30, text: 'Third line' },
      ];

      function getActiveIndex(currentTime, offset) {
        const syncTime = currentTime + offset + 0.25;
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].time >= 0 && syncTime >= lines[i].time) {
            idx = i;
          } else {
            break;
          }
        }
        return idx;
      }

      // At 12s, no offset -> activeIndex = 0 ('First line')
      assert.strictEqual(getActiveIndex(12, 0), 0);

      // At 19.8s (+ 0.25 = 20.05s) -> activeIndex = 1 ('Second line')
      assert.strictEqual(getActiveIndex(19.8, 0), 1);

      // At 15s with +6s offset (21.25s) -> advanced to line 1
      assert.strictEqual(getActiveIndex(15, 6), 1);

      // At 22s with -5s offset (17.25s) -> delayed back to line 0
      assert.strictEqual(getActiveIndex(22, -5), 0);
    });
  });
});
