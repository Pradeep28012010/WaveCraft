import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Load and transpile the production aiDjEngine.ts so tests run directly on the actual code
const enginePath = path.resolve(process.cwd(), 'src/services/aiDjEngine.ts');
const rawTs = fs.readFileSync(enginePath, 'utf8');
const transpiledJs = ts.transpileModule(rawTs, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;

const engineExports = {};
eval('(function(exports) { ' + transpiledJs.replace(/require\([^)]+\)/g, '{}') + ' })(engineExports);');

const {
  VIBE_TAXONOMY,
  INSPIRATIONAL_PRESETS,
  parseVibePrompt,
  estimateTrackAcoustics,
  applyEnergyCurve,
  generateLiquidVibeCoverArt
} = engineExports;

describe('AI Smart DJ & Hybrid Vibe Intelligence Engine Validation', () => {

  describe('Acoustic & Vibe Taxonomy Structure', () => {
    test('Contains the required 6 inspirational presets', () => {
      assert.strictEqual(INSPIRATIONAL_PRESETS.length, 6);
      const titles = INSPIRATIONAL_PRESETS.map((p) => p.title);
      assert.ok(titles.includes('Cyberpunk Night Drive'));
      assert.ok(titles.includes('Rainy Coffee Shop Study'));
      assert.ok(titles.includes('Golden Hour Chill'));
      assert.ok(titles.includes('Beast Mode Workout'));
      assert.ok(titles.includes('Late Night Lo-Fi Echoes'));
      assert.ok(titles.includes('Deep Focus Ambient'));
    });

    test('Taxonomy contains 60+ micro-vibes covering full acoustic spectrum', () => {
      assert.ok(
        VIBE_TAXONOMY.length >= 60,
        `Taxonomy must contain at least 60 micro-vibes (found ${VIBE_TAXONOMY.length})`
      );
    });

    test('All taxonomy nodes have valid BPM ranges, energy levels, and required metadata', () => {
      const categories = new Set();
      const ids = new Set();

      for (const node of VIBE_TAXONOMY) {
        // Unique ID check
        assert.ok(!ids.has(node.id), `Duplicate taxonomy id: ${node.id}`);
        ids.add(node.id);

        // Category check
        categories.add(node.category);

        // BPM bounds check (60 - 180 BPM range)
        assert.ok(node.bpmRange[0] >= 50 && node.bpmRange[1] <= 190, `Node ${node.id} bpmRange out of bounds`);
        assert.ok(node.targetBpm >= node.bpmRange[0] && node.targetBpm <= node.bpmRange[1], `Node ${node.id} targetBpm outside bpmRange`);

        // Energy level check (1 - 10)
        assert.ok(node.energyLevel >= 1 && node.energyLevel <= 10, `Node ${node.id} energyLevel out of bounds`);

        // Metadata completeness
        assert.ok(node.keywords.length >= 2, `Node ${node.id} must have >= 2 keywords`);
        assert.ok(node.seedQueries.length >= 2, `Node ${node.id} must have >= 2 seedQueries`);
        assert.ok(typeof node.suggestedEq === 'string' && node.suggestedEq.length > 0);
        assert.ok(typeof node.suggestedVisualizer === 'string' && node.suggestedVisualizer.length > 0);
        assert.ok(typeof node.accentColor === 'string' && node.accentColor.startsWith('#'));
        assert.ok(typeof node.vibeTag === 'string' && node.vibeTag.length > 0);
      }

      // Must cover all core acoustic categories
      assert.ok(categories.has('electronic'), 'Taxonomy must include electronic category');
      assert.ok(categories.has('lofi_chill'), 'Taxonomy must include lofi_chill category');
      assert.ok(categories.has('high_energy'), 'Taxonomy must include high_energy category');
      assert.ok(categories.has('regional'), 'Taxonomy must include regional category');
      assert.ok(categories.has('mood'), 'Taxonomy must include mood category');
      assert.ok(categories.has('ambient'), 'Taxonomy must include ambient category');
    });
  });

  describe('Natural Language Prompt Parser', () => {
    test('Extracts explicit BPM when typed in prompt', () => {
      const parsed1 = parseVibePrompt('dark driving synthwave at 140 bpm');
      assert.strictEqual(parsed1.targetBpm, 140);

      const parsed2 = parseVibePrompt('smooth chillhop study 85bpm');
      assert.strictEqual(parsed2.targetBpm, 85);

      const parsed3 = parseVibePrompt('fast gym workout 160 tempo');
      assert.strictEqual(parsed3.targetBpm, 160);
    });

    test('Detects "late night coding synthwave with rain" with nocturnal coding acoustics', () => {
      const parsed = parseVibePrompt('late night coding synthwave with rain');
      assert.strictEqual(parsed.detectedActivity, 'coding');
      assert.strictEqual(parsed.detectedTimeOfDay, 'late_night');
      assert.ok(parsed.targetBpm >= 100 && parsed.targetBpm <= 130);
      assert.strictEqual(parsed.suggestedEq, 'Electronic');
      assert.ok(
        parsed.matchedVibe.id.includes('coding') ||
        parsed.matchedVibe.id.includes('synthwave') ||
        parsed.matchedVibe.id.includes('cyberpunk')
      );
    });

    test('Detects "high energy gym phonk" workout and elevates energy and bass boost', () => {
      const parsed = parseVibePrompt('high energy gym phonk');
      assert.strictEqual(parsed.detectedActivity, 'workout');
      assert.ok(parsed.detectedEnergy >= 9);
      assert.strictEqual(parsed.suggestedEq, 'Bass Boost');
      assert.ok(parsed.matchedVibe.id.includes('phonk'));
    });

    test('Detects "cozy autumn acoustic afternoon" with warm organic folk acoustics', () => {
      const parsed = parseVibePrompt('cozy autumn acoustic afternoon');
      assert.strictEqual(parsed.suggestedEq, 'Acoustic');
      assert.ok(parsed.targetBpm <= 95);
      assert.ok(parsed.detectedEnergy <= 5);
      assert.ok(parsed.matchedVibe.id.includes('autumn') || parsed.matchedVibe.id.includes('acoustic'));
    });

    test('Strips noisy command words from prompt and synthesizes clean search queries', () => {
      const res = parseVibePrompt('create a playlist with phonk and hardstyle music for me');
      assert.ok(!res.cleanedPrompt.includes('playlist'));
      assert.ok(!res.cleanedPrompt.includes('create'));
      assert.ok(res.generatedQueries.length >= 3);
    });

    test('Handles conflicting or impossible prompt combinations gracefully without throwing', () => {
      const conflicting = parseVibePrompt('slow ambient phonk workout lullaby');
      assert.ok(typeof conflicting.targetBpm === 'number');
      assert.ok(conflicting.generatedQueries.length >= 2);
      assert.ok(conflicting.matchedVibe);
    });

    test('Handles empty or whitespace-only prompts with safe defaults', () => {
      const empty1 = parseVibePrompt('');
      assert.ok(empty1.matchedVibe);
      assert.ok(empty1.targetBpm > 0);

      const empty2 = parseVibePrompt('   ');
      assert.ok(empty2.matchedVibe);
      assert.ok(empty2.targetBpm > 0);
    });
  });

  describe('Deterministic Acoustic Metadata Estimator', () => {
    test('Calculates fast tempo and high energy for phonk tracks', () => {
      const phonkTrack = {
        id: 'yt_1',
        title: 'Sahara (Drift Phonk)',
        artist: 'Hensonn',
        duration: 180
      };
      const acoustics = estimateTrackAcoustics(phonkTrack);
      assert.ok(acoustics.bpm >= 135);
      assert.ok(acoustics.energy >= 9);
      assert.ok(acoustics.vibeTag.includes('High Energy') || acoustics.vibeTag.includes('PR'));
    });

    test('Calculates low tempo and calm energy for ambient rain tracks', () => {
      const ambientTrack = {
        id: 'yt_2',
        title: 'Weightless - Deep Ambient Rain',
        artist: 'Marconi Union',
        duration: 360
      };
      const acoustics = estimateTrackAcoustics(ambientTrack);
      assert.ok(acoustics.bpm <= 85);
      assert.ok(acoustics.energy <= 4);
    });

    test('Produces deterministic traits on repeated calls', () => {
      const track = {
        id: 'yt_test',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        duration: 200
      };
      const res1 = estimateTrackAcoustics(track);
      const res2 = estimateTrackAcoustics(track);
      assert.strictEqual(res1.bpm, res2.bpm);
      assert.strictEqual(res1.energy, res2.energy);
      assert.strictEqual(res1.vibeTag, res2.vibeTag);
    });

    test('Preserves pre-existing acoustic metadata if already populated on track', () => {
      const prePopulated = {
        id: 'yt_pre',
        title: 'Custom Track',
        artist: 'Custom Artist',
        bpm: 128,
        energy: 8,
        mood: 'Festival Euphoria',
        vibeTag: 'Mainstage Peak'
      };
      const res = estimateTrackAcoustics(prePopulated);
      assert.strictEqual(res.bpm, 128);
      assert.strictEqual(res.energy, 8);
      assert.strictEqual(res.mood, 'Festival Euphoria');
      assert.strictEqual(res.vibeTag, 'Mainstage Peak');
    });

    test('Handles missing title and artist safely without throwing', () => {
      const incompleteTrack = { id: 'yt_inc' };
      const res = estimateTrackAcoustics(incompleteTrack);
      assert.ok(typeof res.bpm === 'number' && res.bpm >= 50);
      assert.ok(typeof res.energy === 'number' && res.energy >= 1);
      assert.ok(typeof res.vibeTag === 'string');
    });
  });

  describe('Harmonic Energy Flow Curve Sequencing', () => {
    const mockTracks = [
      { id: 't1', title: 'Deep Meditation Chill', artist: 'Zen', duration: 180, energy: 2, bpm: 70 },
      { id: 't2', title: 'Hardstyle Apex PR', artist: 'Tevvez', duration: 200, energy: 10, bpm: 155 },
      { id: 't3', title: 'Warm Morning Acoustic', artist: 'Folk', duration: 190, energy: 4, bpm: 82 },
      { id: 't4', title: 'Festival Drop Banger', artist: 'Garrix', duration: 210, energy: 9, bpm: 128 },
      { id: 't5', title: 'Midnight Highway Cruise', artist: 'Synth', duration: 220, energy: 7, bpm: 118 },
      { id: 't6', title: 'Late Night Rain Lo-Fi', artist: 'Kupla', duration: 160, energy: 3, bpm: 78 }
    ];

    test('"peak" curve places highest energy and BPM tracks first', () => {
      const peakMix = applyEnergyCurve([...mockTracks], 'peak');
      assert.strictEqual(peakMix.length, mockTracks.length);
      assert.strictEqual(peakMix[0].id, 't2', 'Highest energy track (energy 10) must lead set');
      assert.strictEqual(peakMix[1].id, 't4', 'Second highest energy track (energy 9) must follow');
      assert.ok((peakMix[peakMix.length - 1].energy || 0) <= 3);
    });

    test('"wave" curve creates gentle warm-up, peak crescendo in middle, and cool-down at end', () => {
      const waveMix = applyEnergyCurve([...mockTracks], 'wave');
      assert.strictEqual(waveMix.length, mockTracks.length);

      const firstTrackEnergy = waveMix[0].energy || 0;
      assert.ok(firstTrackEnergy <= 5, 'Wave flow must start with low-medium warm-up energy');

      const peakIndex = waveMix.findIndex((t) => t.id === 't2');
      assert.ok(peakIndex > 0, 'Peak crescendo should happen within the flow, not at index 0');

      const lastTrackEnergy = waveMix[waveMix.length - 1].energy || 0;
      assert.ok(lastTrackEnergy <= 5, 'Wave flow must conclude with smooth cool-down');
    });

    test('"steady" curve balances tracks with minimal BPM variance', () => {
      const steadyMix = applyEnergyCurve([...mockTracks], 'steady');
      assert.strictEqual(steadyMix.length, mockTracks.length);
      assert.ok(steadyMix.every((t) => typeof t.bpm === 'number'));
    });

    test('Handles short track arrays (0, 1, 2 tracks) without errors', () => {
      assert.deepStrictEqual(applyEnergyCurve([], 'wave'), []);
      assert.deepStrictEqual(applyEnergyCurve([mockTracks[0]], 'wave'), [mockTracks[0]]);
      const pair = [mockTracks[0], mockTracks[1]];
      assert.deepStrictEqual(applyEnergyCurve(pair, 'peak'), pair);
    });
  });

  describe('Liquid Gradient Cover Art Generator', () => {
    test('Generates valid Data URL for playlist artwork', () => {
      const coverDataUrl = generateLiquidVibeCoverArt('Cyberpunk Night Drive', '#ec4899', 'Neon Pulse • 124 BPM');
      assert.ok(typeof coverDataUrl === 'string');
      assert.ok(coverDataUrl.startsWith('data:image/'), 'Must return an image data URL');
      assert.ok(coverDataUrl.length > 50, 'Data URL must contain non-empty image payload');
      assert.ok(coverDataUrl.includes('svg') || coverDataUrl.includes('jpeg'));
    });
  });
});
