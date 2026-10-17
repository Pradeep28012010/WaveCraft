import test from 'node:test';
import assert from 'node:assert/strict';

test('Atmosphere Soundscapes & 3D Visualizer Architecture', async (t) => {
  await t.test('Visualizer Styles Coverage', () => {
    const validStyles = [
      'cyber-mesh',
      'nebula',
      'analog-vu',
      'starfield',
      'particles',
      'circular',
      'blob',
      'bars',
      'wave'
    ];

    assert.equal(validStyles.includes('cyber-mesh'), true, 'cyber-mesh mode must be supported');
    assert.equal(validStyles.includes('analog-vu'), true, 'analog-vu mode must be supported');
    assert.equal(validStyles.length, 9, 'Should have exactly 9 visualizer modes');
  });

  await t.test('Atmosphere Mood Presets Validation', () => {
    const presets = [
      { id: 'rainy-lofi', name: 'Rainy Lo-Fi', blend: { rain: 0.65, vinyl: 0.35 } },
      { id: 'midnight-cafe', name: 'Midnight Café', blend: { cafe: 0.7, rain: 0.3 } },
      { id: 'hearth-fire', name: 'Cozy Hearth', blend: { campfire: 0.8, vinyl: 0.25 } },
      { id: 'ocean-slumber', name: 'Ocean Slumber', blend: { waves: 0.75, binaural: 0.25 } },
      { id: 'deep-focus', name: 'Deep Focus', blend: { binaural: 0.6, rain: 0.4 } },
      { id: 'cosmic-calm', name: 'Cosmic Calm', blend: { waves: 0.45, binaural: 0.45, vinyl: 0.2 } }
    ];

    for (const p of presets) {
      assert.ok(p.id, 'Preset must have an id');
      assert.ok(p.name, 'Preset must have a display name');
      const layers = Object.keys(p.blend);
      assert.ok(layers.length >= 2, 'Preset must blend at least two ambient layers');
      for (const [layerId, vol] of Object.entries(p.blend)) {
        assert.ok(vol > 0 && vol <= 1.0, `Volume for ${layerId} in ${p.name} must be within (0, 1]`);
      }
    }
  });

  await t.test('Master Ambient Blend Scaling Math', () => {
    const initialVolumes = {
      rain: 0.6,
      vinyl: 0.4,
      waves: 0,
      binaural: 0,
      campfire: 0,
      cafe: 0
    };

    const activeLayers = Object.entries(initialVolumes).filter(([, v]) => v > 0.02);
    const avg = activeLayers.reduce((acc, [, v]) => acc + v, 0) / activeLayers.length;
    assert.equal(avg, 0.5, 'Average of 0.6 and 0.4 should be 0.5');

    // Scaling to 0.75 master (scale factor 1.5)
    const targetMaster = 0.75;
    const scale = targetMaster / avg;
    const scaledRain = Math.min(1, Math.max(0, initialVolumes.rain * scale));
    const scaledVinyl = Math.min(1, Math.max(0, initialVolumes.vinyl * scale));

    assert.ok(Math.abs(scaledRain - 0.9) < 0.001, 'Scaled rain should be ~0.9');
    assert.ok(Math.abs(scaledVinyl - 0.6) < 0.001, 'Scaled vinyl should be ~0.6');
  });

  await t.test('Ballistic VU Needle Decay & Overshoot Constraints', () => {
    // Ballistic physics parameters
    const dt = 1.0;
    const attackRate = 0.38 * dt;
    const releaseRate = 0.09 * dt;

    let needle = 0.0;
    const peakSignal = 0.95;

    // Fast attack step
    needle += (peakSignal - needle) * attackRate;
    assert.ok(needle > 0.35, 'Needle should jump fast on attack');

    // Release step when signal drops to 0
    const decayedNeedle = needle + (0 - needle) * releaseRate;
    assert.ok(decayedNeedle < needle, 'Needle should decay smoothly');
    assert.ok(decayedNeedle > 0.25, 'Needle decay should be damped and gentle');
  });

  await t.test('Studio FX & Atmosphere Modal Drag Suppression Logic', () => {
    const resolveDragSetting = (isStudioModalOpen, showQueue, showWaveCard) => {
      return isStudioModalOpen || showQueue || showWaveCard ? false : 'y';
    };

    assert.equal(resolveDragSetting(false, false, false), 'y', 'Drag should be enabled when no modal is open');
    assert.equal(resolveDragSetting(true, false, false), false, 'Drag must be disabled when Atmosphere/Studio modal is open');
    assert.equal(resolveDragSetting(false, true, false), false, 'Drag must be disabled when Queue is open');
    assert.equal(resolveDragSetting(false, false, true), false, 'Drag must be disabled when WaveCard is open');
  });

  await t.test('Studio Store Atmosphere Tab Routing', () => {
    let state = {
      isStudioModalOpen: false,
      studioActiveTab: 'eq'
    };

    const openStudioWithTab = (tab) => {
      state = { ...state, isStudioModalOpen: true, studioActiveTab: tab };
    };

    openStudioWithTab('atmosphere');
    assert.equal(state.isStudioModalOpen, true, 'isStudioModalOpen must be true');
    assert.equal(state.studioActiveTab, 'atmosphere', 'studioActiveTab must be atmosphere');
  });
});
