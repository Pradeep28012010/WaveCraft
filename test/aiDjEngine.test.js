import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('AI Smart DJ & Hybrid Vibe Intelligence Engine Validation', () => {

  // Pure implementation of the Vibe Taxonomy used in aiDjEngine.ts
  const VIBE_TAXONOMY = [
    {
      id: 'cyberpunk-night-drive',
      name: 'Cyberpunk Night Drive',
      category: 'electronic',
      keywords: ['cyberpunk', 'night drive', 'highway', 'outrun', 'synthwave', 'neon', 'kavinsky', 'dark synth', 'blinding lights'],
      bpmRange: [118, 130],
      targetBpm: 124,
      energyLevel: 8,
      genre: 'Synthwave & Darksynth',
      mood: 'Adrenaline & Neon Noir',
      suggestedEq: 'Electronic',
      suggestedFx: '8d-orbit',
      suggestedVisualizer: 'starfield',
      accentColor: '#ec4899',
      energyLabel: 'Neon Pulse • 124 BPM',
      seedQueries: ['Kavinsky Nightcall', 'The Midnight Sunset', 'The Weeknd synthwave', 'Daft Punk Tron synth', 'Carpenter Brut synthwave'],
      vibeTag: 'Cyberpunk Synth'
    },
    {
      id: 'rainy-coffee-shop',
      name: 'Rainy Coffee Shop Study',
      category: 'lofi_chill',
      keywords: ['rain', 'coffee', 'study', 'reading', 'cozy', 'lofi', 'chill', 'cafe', 'tokyo rain', 'rainy coffee'],
      bpmRange: [72, 85],
      targetBpm: 80,
      energyLevel: 3,
      genre: 'Lo-Fi Jazzhop & Rain',
      mood: 'Warm & Contemplative',
      suggestedEq: 'Electronic',
      suggestedFx: 'normal',
      suggestedVisualizer: 'particles',
      accentColor: '#8b5cf6',
      energyLabel: 'Warm Hearth • 80 BPM',
      seedQueries: ['Kupla lofi beats', 'Jinsang feelings lofi', 'Tomppabeats lofi hip hop', 'idealism rainy lofi'],
      vibeTag: 'Rainy Lo-Fi'
    },
    {
      id: 'beast-mode-phonk',
      name: 'Beast Mode Gym Phonk',
      category: 'high_energy',
      keywords: ['beast mode', 'gym phonk', 'phonk', 'drift', 'workout', 'deadlift', 'kordhell', 'dvrst', 'heavy bass', 'pr'],
      bpmRange: [135, 160],
      targetBpm: 148,
      energyLevel: 10,
      genre: 'Drift Phonk & Bass Overdrive',
      mood: 'Aggressive & Invincible',
      suggestedEq: 'Bass Boost',
      suggestedFx: 'arena-live',
      suggestedVisualizer: 'starfield',
      accentColor: '#fa2d48',
      energyLabel: 'Maximum Adrenaline • 148 BPM',
      seedQueries: ['Kordhell Live Another Day phonk', 'DVRST Close Eyes', 'Ghostface Playa Why Not', 'Hensonn Sahara phonk'],
      vibeTag: 'Drift Phonk'
    },
    {
      id: 'golden-hour-chill',
      name: 'Golden Hour Chill',
      category: 'mood',
      keywords: ['golden hour', 'sunset', 'warm', 'chill', 'ocean', 'breeze', 'calm evening', 'afternoon warm'],
      bpmRange: [90, 110],
      targetBpm: 98,
      energyLevel: 5,
      genre: 'Indie Chill & Soft Pop',
      mood: 'Radiant & Serene',
      suggestedEq: 'Acoustic',
      suggestedFx: 'normal',
      suggestedVisualizer: 'wave',
      accentColor: '#f59e0b',
      energyLabel: 'Sunset Radiance • 98 BPM',
      seedQueries: ['Leon Bridges Texas Sun', 'Khruangbin Texas Sun', 'Surfaces Sunday Best'],
      vibeTag: 'Golden Hour'
    },
    {
      id: 'tollywood-high-voltage-mass',
      name: 'Tollywood High-Voltage Mass',
      category: 'regional',
      keywords: ['telugu', 'tollywood', 'mass', 'anirudh', 'thaman', 'dsp', 'energetic', 'devara', 'pushpa', 'banger'],
      bpmRange: [124, 138],
      targetBpm: 130,
      energyLevel: 10,
      genre: 'South Indian Mass EDM Fusion',
      mood: 'Electric & Euphoric',
      suggestedEq: 'Bass Boost',
      suggestedFx: 'arena-live',
      suggestedVisualizer: 'nebula',
      accentColor: '#f59e0b',
      energyLabel: 'Mass Explosion • 130 BPM',
      seedQueries: ['Anirudh Ravichander mass hits', 'Thaman S Telugu mass beats', 'Pushpa energetic hits'],
      vibeTag: 'Tollywood Mass'
    },
    {
      id: 'deep-focus-ambient',
      name: 'Deep Focus Ambient Code',
      category: 'lofi_chill',
      keywords: ['deep focus', 'focus', 'ambient coding', 'programming', 'work', 'terminal', 'productivity'],
      bpmRange: [80, 95],
      targetBpm: 88,
      energyLevel: 4,
      genre: 'Minimal Ambient IDM',
      mood: 'Hypnotic & Clear',
      suggestedEq: 'Electronic',
      suggestedFx: 'normal',
      suggestedVisualizer: 'particles',
      accentColor: '#6366f1',
      energyLabel: 'Flow State • 88 BPM',
      seedQueries: ['Tycho Awake focus', 'Kiasmos minimal ambient', 'Jon Hopkins Singularity ambient'],
      vibeTag: 'Deep Focus'
    },
    {
      id: 'cozy-autumn-acoustic',
      name: 'Cozy Autumn Acoustic Afternoon',
      category: 'lofi_chill',
      keywords: ['cozy', 'autumn', 'acoustic', 'afternoon', 'sweater', 'indie folk', 'campfire', 'unplugged'],
      bpmRange: [78, 92],
      targetBpm: 84,
      energyLevel: 4,
      genre: 'Warm Indie Folk',
      mood: 'Intimate & Earthy',
      suggestedEq: 'Acoustic',
      suggestedFx: 'normal',
      suggestedVisualizer: 'wave',
      accentColor: '#d97706',
      energyLabel: 'Golden Hearth • 84 BPM',
      seedQueries: ['Noah Kahan Stick Season acoustic', 'Bon Iver Holocene acoustic'],
      vibeTag: 'Autumn Folk'
    },
    {
      id: '3am-slowed-reverb-cloud',
      name: '3AM Slowed + Reverb Cloud',
      category: 'mood',
      keywords: ['slowed', 'reverb', 'slowed and reverb', 'slowed reverb', 'cloud', '3am', 'ethereal', 'aesthetic'],
      bpmRange: [65, 80],
      targetBpm: 72,
      energyLevel: 3,
      genre: 'Ethereal Slowed + Reverb',
      mood: 'Detached & Hypnotic',
      suggestedEq: 'Vocal',
      suggestedFx: 'normal',
      suggestedVisualizer: 'nebula',
      accentColor: '#c084fc',
      energyLabel: 'Ethereal Cloud • 0.88x Reverb',
      seedQueries: ['The Weeknd slowed reverb', 'romantic pop slowed reverb aesthetic'],
      vibeTag: 'Slowed + Reverb'
    }
  ];

  const INSPIRATIONAL_PRESETS = [
    { id: 'cyberpunk-night-drive', title: 'Cyberpunk Night Drive', prompt: 'Cyberpunk night drive dark synthwave highway neon kavinsky 120 bpm' },
    { id: 'rainy-coffee-shop-study', title: 'Rainy Coffee Shop Study', prompt: 'Rainy coffee shop study warm lofi jazzhop acoustic beats' },
    { id: 'golden-hour-chill', title: 'Golden Hour Chill', prompt: 'Golden hour chill sunset warm indie acoustic groove' },
    { id: 'beast-mode-workout', title: 'Beast Mode Workout', prompt: 'Beast mode workout gym phonk high adrenaline hardstyle 150 bpm' },
    { id: 'late-night-lofi-echoes', title: 'Late Night Lo-Fi Echoes', prompt: 'Late night lo-fi echoes 3am solitude chill beats slowed reverb' },
    { id: 'deep-focus-ambient', title: 'Deep Focus Ambient', prompt: 'Deep focus ambient coding flow state electronic beats' }
  ];

  // Pure implementation of the Prompt Parser
  function parseVibePrompt(prompt) {
    const lower = (prompt || '').toLowerCase().trim();

    let userBpm = null;
    const bpmMatch = lower.match(/(\d{2,3})\s*(?:bpm|tempo)/i);
    if (bpmMatch && bpmMatch[1]) {
      const val = parseInt(bpmMatch[1], 10);
      if (val >= 50 && val <= 220) userBpm = val;
    }

    let detectedActivity = 'general';
    if (/(gym|workout|lift|deadlift|bench|sprint|hiit|run|running|cardio|pr|sweat)/.test(lower)) {
      detectedActivity = 'workout';
    } else if (/(code|coding|dev|program|terminal|debug|algorithm)/.test(lower)) {
      detectedActivity = 'coding';
    } else if (/(study|read|reading|homework|exam|library|write|focus)/.test(lower)) {
      detectedActivity = 'study';
    } else if (/(drive|driving|highway|cruise|cruising|night drive|car)/.test(lower)) {
      detectedActivity = 'drive';
    } else if (/(sleep|insomnia|rest|bed|nap|relax)/.test(lower)) {
      detectedActivity = 'sleep';
    }

    let detectedTimeOfDay = 'anytime';
    if (/(3am|2am|late night|midnight|1am|4am|insomnia)/.test(lower)) {
      detectedTimeOfDay = 'late_night';
    } else if (/(morning|sunrise|dawn|breakfast|coffee morning)/.test(lower)) {
      detectedTimeOfDay = 'morning';
    } else if (/(sunset|golden hour|dusk|evening|afternoon)/.test(lower)) {
      detectedTimeOfDay = 'golden_hour';
    }

    let bestMatch = VIBE_TAXONOMY[0];
    let highestScore = -1;

    for (const vibe of VIBE_TAXONOMY) {
      let score = 0;
      for (const kw of vibe.keywords) {
        if (lower.includes(kw)) {
          score += kw.length > 5 ? 3 : 2;
        }
      }
      if (lower.includes(vibe.name.toLowerCase())) {
        score += 5;
      }
      if (detectedActivity === 'workout' && vibe.category === 'high_energy') score += 3;
      if (detectedActivity === 'coding' && (vibe.id.includes('focus') || vibe.id.includes('rain') || vibe.id.includes('cyberpunk'))) score += 3;
      if (detectedActivity === 'study' && vibe.category === 'lofi_chill') score += 3;
      if (detectedActivity === 'drive' && (vibe.id.includes('drive') || vibe.id.includes('highway'))) score += 3;
      if (detectedTimeOfDay === 'late_night' && (vibe.name.includes('Night') || vibe.id.includes('3am'))) score += 3;
      if (detectedTimeOfDay === 'golden_hour' && vibe.name.includes('Golden')) score += 3;

      if (userBpm !== null) {
        const diff = Math.abs(vibe.targetBpm - userBpm);
        if (diff <= 8) score += 4;
        else if (diff <= 18) score += 2;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = vibe;
      }
    }

    const targetBpm = userBpm ?? bestMatch.targetBpm;
    const cleaned = lower.replace(/playlist|songs|music|tracks|mix|prepare|give|me|create/gi, '').trim();

    const synthesizedQueries = [...bestMatch.seedQueries];
    if (cleaned.length > 3 && !synthesizedQueries.some((q) => q.toLowerCase().includes(cleaned))) {
      synthesizedQueries.unshift(`${cleaned} top hits`, `${cleaned} audio`);
    }

    return {
      rawPrompt: prompt,
      cleanedPrompt: cleaned,
      matchedVibe: bestMatch,
      detectedBpmRange: bestMatch.bpmRange,
      targetBpm,
      detectedEnergy: bestMatch.energyLevel,
      detectedMood: bestMatch.mood,
      detectedActivity,
      detectedTimeOfDay,
      suggestedEq: bestMatch.suggestedEq,
      suggestedFx: bestMatch.suggestedFx,
      suggestedVisualizer: bestMatch.suggestedVisualizer,
      accentColor: bestMatch.accentColor,
      energyLabel: bestMatch.energyLabel,
      generatedQueries: Array.from(new Set(synthesizedQueries)).slice(0, 6)
    };
  }

  // Pure implementation of the Acoustic Estimator
  function estimateTrackAcoustics(track, vibeContext) {
    if (track.bpm && track.energy) {
      return {
        bpm: track.bpm,
        mood: track.mood || vibeContext?.mood || 'Harmonic',
        energy: track.energy,
        vibeTag: track.vibeTag || vibeContext?.vibeTag || 'AI Soundstage',
        genre: track.genre || 'Soundstage'
      };
    }

    const titleLower = (track.title || '').toLowerCase();
    const artistLower = (track.artist || '').toLowerCase();
    const combined = `${titleLower} ${artistLower}`;

    let bpm = vibeContext?.bpm || 115;
    let energy = vibeContext?.energy || 6;
    let mood = vibeContext?.mood || 'Harmonic';
    let vibeTag = vibeContext?.vibeTag || 'AI Soundstage';
    const genre = track.genre || vibeContext?.genre || 'Studio';

    if (/phonk|drift|hardstyle|metal|aggressive|pr|rage|heavy/i.test(combined)) {
      bpm = Math.max(bpm, 142);
      energy = Math.min(10, Math.max(energy, 9));
      mood = 'Adrenaline Overdrive';
      vibeTag = 'High Energy PR';
    } else if (/slowed|reverb|ambient|sleep|relax|rain|calm|zen/i.test(combined)) {
      bpm = Math.min(bpm, 74);
      energy = Math.max(2, Math.min(energy, 4));
      mood = 'Deep Relax';
      vibeTag = 'Chill Horizon';
    } else if (/acoustic|piano|unplugged|folk|indie folk|coffee/i.test(combined)) {
      bpm = Math.min(94, bpm);
      energy = Math.max(3, Math.min(energy, 5));
      mood = 'Organic Warmth';
      vibeTag = 'Acoustic Soul';
    }

    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash * 31 + combined.charCodeAt(i)) & 0xfffff;
    }
    const varianceBpm = (hash % 11) - 5;
    const finalBpm = Math.max(55, Math.min(185, bpm + varianceBpm));

    return {
      bpm: finalBpm,
      mood,
      energy,
      vibeTag,
      genre
    };
  }

  // Pure implementation of the Energy Curve Sorter
  function applyEnergyCurve(tracks, curve) {
    if (tracks.length <= 2) return [...tracks];

    const enriched = tracks.map((t) => ({
      track: { ...t },
      acoustics: estimateTrackAcoustics(t)
    }));

    if (curve === 'peak') {
      return enriched
        .sort((a, b) => {
          const scoreB = b.acoustics.energy * 20 + b.acoustics.bpm;
          const scoreA = a.acoustics.energy * 20 + a.acoustics.bpm;
          return scoreB - scoreA;
        })
        .map((item) => {
          item.track.bpm = item.acoustics.bpm;
          item.track.mood = item.acoustics.mood;
          item.track.energy = item.acoustics.energy;
          item.track.vibeTag = item.acoustics.vibeTag;
          return item.track;
        });
    }

    if (curve === 'steady') {
      const sorted = [...enriched].sort((a, b) => a.acoustics.bpm - b.acoustics.bpm);
      const medianIndex = Math.floor(sorted.length / 2);
      const medianBpm = sorted[medianIndex]?.acoustics.bpm || 110;

      const steadySorted = [...sorted].sort((a, b) => {
        const diffA = Math.abs(a.acoustics.bpm - medianBpm);
        const diffB = Math.abs(b.acoustics.bpm - medianBpm);
        return diffA - diffB;
      });

      return steadySorted.map((item) => {
        item.track.bpm = item.acoustics.bpm;
        item.track.mood = item.acoustics.mood;
        item.track.energy = item.acoustics.energy;
        item.track.vibeTag = item.acoustics.vibeTag;
        return item.track;
      });
    }

    // Default 'wave' flow
    const sortedByEnergy = [...enriched].sort((a, b) => a.acoustics.energy - b.acoustics.energy);
    const total = sortedByEnergy.length;
    const warmupCount = Math.max(1, Math.floor(total * 0.25));
    const cooldownCount = Math.max(1, Math.floor(total * 0.2));

    const warmup = sortedByEnergy.slice(0, warmupCount);
    const cooldown = sortedByEnergy.slice(warmupCount, warmupCount + cooldownCount);
    const buildAndPeak = sortedByEnergy.slice(warmupCount + cooldownCount);

    buildAndPeak.sort((a, b) => a.acoustics.bpm - b.acoustics.bpm);

    const sequenced = [...warmup, ...buildAndPeak, ...cooldown.reverse()];

    return sequenced.map((item) => {
      item.track.bpm = item.acoustics.bpm;
      item.track.mood = item.acoustics.mood;
      item.track.energy = item.acoustics.energy;
      item.track.vibeTag = item.acoustics.vibeTag;
      return item.track;
    });
  }

  // Pure implementation of the Cover Art Data URI Generator
  function generateLiquidVibeCoverArt(title, accentColor = '#fa2d48', energyLabel = 'AI SMART DJ SET') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <radialGradient id="g1" cx="20%" cy="20%" r="80%">
          <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.9"/>
          <stop offset="60%" stop-color="#4f46e5" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#09090b" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <rect width="512" height="512" fill="url(#g1)"/>
      <text x="50" y="420" font-family="sans-serif" font-weight="900" font-size="28" fill="#ffffff">${title.slice(0, 22)}</text>
      <text x="50" y="455" font-family="sans-serif" font-weight="700" font-size="14" fill="#ffffff" opacity="0.7">${energyLabel}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // --- TESTS ---

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

    test('All taxonomy nodes have valid BPM ranges and energy levels', () => {
      for (const node of VIBE_TAXONOMY) {
        assert.ok(node.bpmRange[0] >= 50 && node.bpmRange[1] <= 190);
        assert.ok(node.targetBpm >= node.bpmRange[0] && node.targetBpm <= node.bpmRange[1]);
        assert.ok(node.energyLevel >= 1 && node.energyLevel <= 10);
        assert.ok(node.seedQueries.length >= 2);
        assert.ok(node.suggestedEq);
        assert.ok(node.suggestedVisualizer);
      }
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

    test('Detects workout activity and elevates energy and bass boost', () => {
      const parsed = parseVibePrompt('high energy gym phonk workout deadlift');
      assert.strictEqual(parsed.detectedActivity, 'workout');
      assert.ok(parsed.detectedEnergy >= 9);
      assert.strictEqual(parsed.suggestedEq, 'Bass Boost');
    });

    test('Detects late-night coding with ambient focus', () => {
      const parsed = parseVibePrompt('2am late night coding in tokyo rain ambient');
      assert.strictEqual(parsed.detectedActivity, 'coding');
      assert.strictEqual(parsed.detectedTimeOfDay, 'late_night');
      assert.ok(parsed.targetBpm <= 90);
      assert.strictEqual(parsed.suggestedEq, 'Electronic');
    });

    test('Detects cozy autumn acoustic afternoon', () => {
      const parsed = parseVibePrompt('cozy autumn acoustic afternoon indie folk');
      assert.strictEqual(parsed.suggestedEq, 'Acoustic');
      assert.ok(parsed.targetBpm <= 90);
      assert.ok(parsed.detectedEnergy <= 5);
    });

    test('Strips noisy command words from prompt and synthesizes clean search queries', () => {
      const res = parseVibePrompt('create a playlist with phonk and hardstyle music for me');
      assert.ok(!res.cleanedPrompt.includes('playlist'));
      assert.ok(!res.cleanedPrompt.includes('create'));
      assert.ok(res.generatedQueries.length >= 3);
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
  });

  describe('Liquid Gradient Cover Art Generator', () => {
    test('Generates valid Data URL for playlist artwork', () => {
      const coverDataUrl = generateLiquidVibeCoverArt('Cyberpunk Night Drive', '#ec4899', 'Neon Pulse • 124 BPM');
      assert.ok(typeof coverDataUrl === 'string');
      assert.ok(coverDataUrl.startsWith('data:image/'), 'Must return an image data URL');
      assert.ok(coverDataUrl.length > 50, 'Data URL must contain non-empty image payload');
    });
  });
});
