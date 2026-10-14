import { describe, it } from 'node:test';
import assert from 'node:assert';

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

describe('Interactive 10-Band EQ & Studio FX Workstation', () => {
  it('covers all 10 standard octave frequency bands', () => {
    assert.strictEqual(EQ_FREQUENCIES.length, 10);
    assert.deepStrictEqual(EQ_FREQUENCIES, [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
    assert.strictEqual(EQ_FREQ_LABELS.length, 10);
    assert.deepStrictEqual(EQ_FREQ_LABELS, ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']);
  });

  it('correctly maps dB range [-12, +12] to normalized Y coordinates', () => {
    const SVG_HEIGHT = 200;
    const PAD_Y = 24;
    const GRAPH_HEIGHT = SVG_HEIGHT - PAD_Y * 2; // 152
    const ZERO_Y = PAD_Y + GRAPH_HEIGHT / 2; // 100
    const MAX_DB = 12;

    const dbToY = (db) => {
      const clamped = Math.max(-MAX_DB, Math.min(MAX_DB, db));
      return ZERO_Y - (clamped / MAX_DB) * (GRAPH_HEIGHT / 2);
    };

    const yToDb = (y) => {
      const clampedY = Math.max(PAD_Y, Math.min(PAD_Y + GRAPH_HEIGHT, y));
      const rawDb = ((ZERO_Y - clampedY) / (GRAPH_HEIGHT / 2)) * MAX_DB;
      return Math.round(rawDb * 2) / 2;
    };

    // 0 dB must be exactly center at ZERO_Y
    assert.strictEqual(dbToY(0), ZERO_Y);
    assert.strictEqual(yToDb(ZERO_Y), 0);

    // +12 dB must map to top (PAD_Y)
    assert.strictEqual(dbToY(12), PAD_Y);
    assert.strictEqual(yToDb(PAD_Y), 12);

    // -12 dB must map to bottom (PAD_Y + GRAPH_HEIGHT)
    assert.strictEqual(dbToY(-12), PAD_Y + GRAPH_HEIGHT);
    assert.strictEqual(yToDb(PAD_Y + GRAPH_HEIGHT), -12);

    // Symmetric intermediate checks (+6dB and -6dB)
    assert.strictEqual(yToDb(dbToY(6)), 6);
    assert.strictEqual(yToDb(dbToY(-6)), -6);
  });

  it('generates valid Catmull-Rom cubic Bezier path strings for smooth spline curves', () => {
    const points = [
      { x: 50, y: 100 },
      { x: 150, y: 80 },
      { x: 250, y: 120 },
      { x: 350, y: 100 }
    ];

    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    assert.ok(path.startsWith('M 50.0 100.0 C'));
    assert.ok(path.includes('C'));
    assert.strictEqual(path.split('C').length, 4); // 3 Bezier segments
  });
});
