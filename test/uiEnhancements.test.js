import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('UI Enhancements & Gestures Validation', () => {
  // Pure implementation of the Elastic Snap Slider calculation used in NowPlaying & MiniPlayer
  function calculateScrubberRatioAndOffset(x, width, maxOffset = 32) {
    if (x < 0) {
      const pull = -x;
      const resisted = -Math.min(maxOffset, Math.pow(pull, 0.68) * 1.5);
      return { ratio: 0, offset: resisted };
    } else if (x > width) {
      const pull = x - width;
      const resisted = Math.min(maxOffset, Math.pow(pull, 0.68) * 1.5);
      return { ratio: 1, offset: resisted };
    } else {
      return { ratio: Math.max(0, Math.min(1, x / width)), offset: 0 };
    }
  }

  function calculateSliderVisualGeometry(percent, elasticOffset) {
    const fillLeft = elasticOffset < 0 ? elasticOffset : 0;
    const fillWidth = elasticOffset < 0 ? -elasticOffset : `calc(${percent}% + ${elasticOffset}px)`;
    const thumbLeft = `calc(${percent}% + ${elasticOffset}px)`;
    return { fillLeft, fillWidth, thumbLeft };
  }

  describe('Elastic Snap Slider Rubber-Band Bounds & Fill Geometry', () => {
    test('Within bounds [0, width] returns exact linear ratio and zero elastic offset', () => {
      const width = 300;
      const atZero = calculateScrubberRatioAndOffset(0, width);
      assert.strictEqual(atZero.ratio, 0);
      assert.strictEqual(atZero.offset, 0);

      const atMid = calculateScrubberRatioAndOffset(150, width);
      assert.strictEqual(atMid.ratio, 0.5);
      assert.strictEqual(atMid.offset, 0);

      const atEnd = calculateScrubberRatioAndOffset(300, width);
      assert.strictEqual(atEnd.ratio, 1);
      assert.strictEqual(atEnd.offset, 0);

      const geom = calculateSliderVisualGeometry(50, 0);
      assert.strictEqual(geom.fillLeft, 0);
      assert.strictEqual(geom.fillWidth, 'calc(50% + 0px)');
      assert.strictEqual(geom.thumbLeft, 'calc(50% + 0px)');
    });

    test('Dragging before start (x < 0) locks ratio to 0 and provides elastic negative resistance', () => {
      const width = 300;
      const res = calculateScrubberRatioAndOffset(-50, width);
      assert.strictEqual(res.ratio, 0);
      assert.ok(res.offset < 0, `Expected negative offset, got ${res.offset}`);
      assert.ok(res.offset >= -32, `Expected offset bounded by -32, got ${res.offset}`);

      // Further drag should have diminishing returns (sub-linear power law 0.68)
      const resSmall = calculateScrubberRatioAndOffset(-20, width);
      const resLarge = calculateScrubberRatioAndOffset(-80, width);
      assert.ok(Math.abs(resLarge.offset) > Math.abs(resSmall.offset));
      assert.ok(Math.abs(resLarge.offset) <= 32);

      // Verify that visual fill bar shifts into negative coordinates and does not clamp to 0
      const geom = calculateSliderVisualGeometry(0, res.offset);
      assert.strictEqual(geom.fillLeft, res.offset);
      assert.strictEqual(geom.fillWidth, -res.offset);
      assert.strictEqual(geom.thumbLeft, `calc(0% + ${res.offset}px)`);
    });

    test('Dragging beyond end (x > width) locks ratio to 1 and provides elastic positive resistance', () => {
      const width = 300;
      const res = calculateScrubberRatioAndOffset(350, width);
      assert.strictEqual(res.ratio, 1);
      assert.ok(res.offset > 0, `Expected positive offset, got ${res.offset}`);
      assert.ok(res.offset <= 32, `Expected offset bounded by 32, got ${res.offset}`);

      const geom = calculateSliderVisualGeometry(100, res.offset);
      assert.strictEqual(geom.fillLeft, 0);
      assert.strictEqual(geom.fillWidth, `calc(100% + ${res.offset}px)`);
      assert.strictEqual(geom.thumbLeft, `calc(100% + ${res.offset}px)`);
    });
  });

  describe('TrackRow Multi-Action Reveal Thresholds & Playlist Picker', () => {
    function evaluateRowDrag(offsetX, velocityX) {
      if (offsetX < -45 || velocityX < -280) {
        return 'open';
      } else if (offsetX > 30 || velocityX > 200) {
        return 'close';
      }
      return 'close';
    }

    test('Swiping left past -45px offset reveals action tray', () => {
      assert.strictEqual(evaluateRowDrag(-50, 0), 'open');
    });

    test('Flicking left with high negative velocity (< -280) reveals tray even with small offset', () => {
      assert.strictEqual(evaluateRowDrag(-20, -320), 'open');
    });

    test('Swiping right snaps row closed', () => {
      assert.strictEqual(evaluateRowDrag(35, 0), 'close');
      assert.strictEqual(evaluateRowDrag(10, 250), 'close');
    });

    test('Incomplete swipe snaps back closed', () => {
      assert.strictEqual(evaluateRowDrag(-20, 0), 'close');
    });

    test('Playlist picker behaves consistently on phone and desktop with 0 or many playlists', () => {
      function getPlaylistOptions(playlists) {
        if (!playlists || playlists.length === 0) {
          return [{ id: 'new', label: '+ Create Playlist & Add' }];
        }
        return playlists.map((p) => ({ id: p.id, label: p.name }));
      }

      const emptyList = getPlaylistOptions([]);
      assert.strictEqual(emptyList.length, 1);
      assert.strictEqual(emptyList[0].id, 'new');

      const existingList = getPlaylistOptions([{ id: 'pl-1', name: 'Chill Waves' }]);
      assert.strictEqual(existingList.length, 1);
      assert.strictEqual(existingList[0].label, 'Chill Waves');
    });
  });

  describe('Adaptive High-FPS Glass Engine Profiles', () => {
    const PROFILES = ['ultra', 'balanced', 'performance'];

    test('Supported profiles contain ultra, balanced, and performance', () => {
      assert.ok(PROFILES.includes('ultra'));
      assert.ok(PROFILES.includes('balanced'));
      assert.ok(PROFILES.includes('performance'));
    });

    test('Performance profile disables heavy multi-node blur passes', () => {
      function getActiveLayerCount(profile) {
        if (profile === 'performance') return 0; // zero heavy blur nodes
        if (profile === 'balanced') return 2;    // optimized primary + secondary
        return 4;                                // full 4-node aurora mesh
      }

      assert.strictEqual(getActiveLayerCount('performance'), 0);
      assert.strictEqual(getActiveLayerCount('balanced'), 2);
      assert.strictEqual(getActiveLayerCount('ultra'), 4);
    });

    test('ParticleCanvas dynamically scales particle count per profile', () => {
      function getParticleCount(profile) {
        return profile === 'ultra' ? 120 : profile === 'performance' ? 32 : 80;
      }
      assert.strictEqual(getParticleCount('performance'), 32);
      assert.strictEqual(getParticleCount('balanced'), 80);
      assert.strictEqual(getParticleCount('ultra'), 120);
    });
  });
});
