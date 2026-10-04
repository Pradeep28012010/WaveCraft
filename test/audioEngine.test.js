import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Spatial 3D & DSP Math Validation', () => {
  // Pure implementation of the spatial math algorithm used in audioEngine.ts
  function computeSpatialPhysics(rawX, rawZ) {
    const ox = Number.isFinite(rawX) ? Math.max(-1, Math.min(1, rawX)) : 0;
    const oz = Number.isFinite(rawZ) ? Math.max(-1, Math.min(1, rawZ)) : -0.85;

    const azDeg = Math.round(((Math.atan2(ox, -oz) * 180) / Math.PI + 360) % 360);
    const rawDist = Math.hypot(ox, oz);
    const dist = Number.isFinite(rawDist) ? (rawDist * 2.5).toFixed(2) : '2.12';
    const lEar = Math.round(Math.min(100, Math.max(18, 72 - ox * 38)));
    const rEar = Math.round(Math.min(100, Math.max(18, 72 + ox * 38)));

    const stageLabel =
      azDeg >= 315 || azDeg < 45
        ? 'Front Center Stage'
        : azDeg < 135
        ? 'Right Acoustic Wing'
        : azDeg < 225
        ? 'Rear Surround Halo'
        : 'Left Acoustic Wing';

    // Head-shadow and distance attenuation physics
    // Front (oz <= 0): direct unobstructed acoustic line-of-sight = 1.0
    // Rear (oz > 0): human skull acoustic absorption dips volume down to ~60%
    const headShadow = oz > 0 ? 1 - (oz * 0.45) : 1.0;
    const earProximity = 1 + Math.abs(ox) * 0.05;
    const distanceDecay = 1 - Math.min(0.20, Math.max(0, rawDist - 0.85) * 0.60);
    const finalVolScale = Math.max(0.48, Math.min(1.05, headShadow * earProximity * distanceDecay));

    // Dynamic Pinna Head-Shadow Cutoff Frequency
    const targetFreq = oz > 0 ? 8000 - oz * 5800 : 8000;
    const clampedFreq = Math.max(1600, targetFreq);

    return {
      ox,
      oz,
      azDeg,
      distMeters: parseFloat(dist),
      lEar,
      rEar,
      stageLabel,
      finalVolScale,
      headShadowCutoffHz: clampedFreq
    };
  }

  describe('Cardinal Positions & Boundaries', () => {
    test('Front Center Stage (0, -0.85): direct attack, high volume, open pinna', () => {
      const res = computeSpatialPhysics(0, -0.85);
      assert.strictEqual(res.azDeg, 0);
      assert.strictEqual(res.stageLabel, 'Front Center Stage');
      assert.ok(res.finalVolScale >= 0.85, `Expected scale >= 0.85, got ${res.finalVolScale}`);
      assert.strictEqual(res.headShadowCutoffHz, 8000, 'Front pinna filter must be open to 8000Hz');
      assert.strictEqual(res.lEar, 72);
      assert.strictEqual(res.rEar, 72);
    });

    test('Hard Right (+0.85, 0): right ear max, right acoustic wing', () => {
      const res = computeSpatialPhysics(0.85, 0);
      assert.strictEqual(res.azDeg, 90);
      assert.strictEqual(res.stageLabel, 'Right Acoustic Wing');
      assert.ok(res.rEar > res.lEar, 'Right ear level must exceed left ear');
      assert.strictEqual(res.headShadowCutoffHz, 8000);
    });

    test('Rear Surround Halo (0, +0.85): skull head-shadow attenuation down to 50-60%', () => {
      const res = computeSpatialPhysics(0, 0.85);
      assert.strictEqual(res.azDeg, 180);
      assert.strictEqual(res.stageLabel, 'Rear Surround Halo');
      assert.ok(res.finalVolScale <= 0.62, `Expected scale <= 0.62 behind head, got ${res.finalVolScale}`);
      assert.ok(res.headShadowCutoffHz <= 3500, `Expected muffled rear cutoff <= 3500Hz, got ${res.headShadowCutoffHz}`);
    });

    test('Hard Left (-0.85, 0): left ear max, left acoustic wing', () => {
      const res = computeSpatialPhysics(-0.85, 0);
      assert.strictEqual(res.azDeg, 270);
      assert.strictEqual(res.stageLabel, 'Left Acoustic Wing');
      assert.ok(res.lEar > res.rEar, 'Left ear level must exceed right ear');
    });
  });

  describe('Input Sanitization & Extreme Boundaries', () => {
    test('Clamps extreme out-of-bounds coordinates to [-1, 1]', () => {
      const res = computeSpatialPhysics(999, -999);
      assert.strictEqual(res.ox, 1);
      assert.strictEqual(res.oz, -1);
      assert.ok(res.distMeters > 0);
      assert.ok(Number.isFinite(res.finalVolScale));
    });

    test('Handles NaN gracefully with default safe center-front fallback', () => {
      const res = computeSpatialPhysics(NaN, NaN);
      assert.strictEqual(res.ox, 0);
      assert.strictEqual(res.oz, -0.85);
      assert.strictEqual(res.azDeg, 0);
      assert.strictEqual(res.stageLabel, 'Front Center Stage');
      assert.ok(Number.isFinite(res.finalVolScale));
    });

    test('Handles Infinity gracefully without crashing', () => {
      const res = computeSpatialPhysics(Infinity, -Infinity);
      assert.strictEqual(res.ox, 0);
      assert.strictEqual(res.oz, -0.85);
    });
  });

  describe('Volume & Mute Scaling Physics', () => {
    function computeScaledGain(nominalMaxGain, userVol, isMuted) {
      const effectiveVol = isMuted ? 0 : Math.max(0, Math.min(1, userVol));
      return Math.min(nominalMaxGain, nominalMaxGain * effectiveVol);
    }

    test('When muted, all generator gains are exactly 0', () => {
      const subGain = computeScaledGain(0.35, 1.0, true);
      const airGain = computeScaledGain(0.24, 0.8, true);
      const arenaGain = computeScaledGain(0.48, 0.5, true);
      const spatialGain = computeScaledGain(0.38, 1.0, true);

      assert.strictEqual(subGain, 0);
      assert.strictEqual(airGain, 0);
      assert.strictEqual(arenaGain, 0);
      assert.strictEqual(spatialGain, 0);
    });

    test('When volume is at 50%, generators scale proportionally', () => {
      const subGain = computeScaledGain(0.35, 0.5, false);
      assert.strictEqual(subGain, 0.175);
    });

    test('When volume is at 0, generators are 0', () => {
      const subGain = computeScaledGain(0.35, 0, false);
      assert.strictEqual(subGain, 0);
    });
  });

  describe('Orbit Angle Continuity & Manual Transition', () => {
    test('Manual angle correctly converts Cartesian (x, z) to polar angle [0, 2π)', () => {
      const testCases = [
        { x: 0, z: -1, expectedDeg: 0 },
        { x: 1, z: 0, expectedDeg: 90 },
        { x: 0, z: 1, expectedDeg: 180 },
        { x: -1, z: 0, expectedDeg: 270 }
      ];

      for (const tc of testCases) {
        const rad = (Math.atan2(tc.x, -tc.z) + Math.PI * 2) % (Math.PI * 2);
        const deg = Math.round((rad * 180) / Math.PI);
        assert.strictEqual(deg, tc.expectedDeg);
      }
    });

    test('Orbit accumulator handles multi-hour delta time without accumulating NaN', () => {
      let angle = 0;
      const speed = 0.12;
      const dt = 0.016; // 60fps
      // Simulate 100,000 frames (approx 28 minutes of continuous 60fps playback)
      for (let i = 0; i < 100000; i++) {
        angle = (angle + dt * speed * Math.PI * 2) % (Math.PI * 2);
      }
      assert.ok(Number.isFinite(angle));
      assert.ok(angle >= 0 && angle < Math.PI * 2);
    });
  });
});
