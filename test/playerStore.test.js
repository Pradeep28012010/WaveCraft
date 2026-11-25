import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);

function transpileTsFile(relPath) {
  const fullPath = path.resolve(process.cwd(), relPath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
}

const origGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  localStorage: globalThis.localStorage
};

const lsData = new Map();
const localStorageMock = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
  clear: () => lsData.clear()
};
const windowListeners = new Map();
globalThis.localStorage = localStorageMock;
globalThis.window = {
  localStorage: localStorageMock,
  addEventListener: (ev, fn) => {
    if (!windowListeners.has(ev)) windowListeners.set(ev, new Set());
    windowListeners.get(ev).add(fn);
  },
  removeEventListener: (ev, fn) => windowListeners.get(ev)?.delete(fn)
};
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: () => {}
};

let guestBlocked = false;
let remoteApplying = false;
const guestDelegatedTracks = [];

const shuffleModule = { exports: {} };
new Function('require', 'exports', 'module', transpileTsFile('src/utils/shuffle.ts'))(
  nodeRequire,
  shuffleModule.exports,
  shuffleModule
);

const playerModule = { exports: {} };
const playerRequire = (id) => {
  if (id === 'zustand') return nodeRequire('zustand');
  if (id === '../utils/shuffle') return shuffleModule.exports;
  if (id === '../components/player/YouTubeEmbed') {
    return { seekToTime: () => {}, cancelActiveCrossfade: () => {} };
  }
  if (id === '../services/audioEngine') {
    return { unlockAudioEngine: () => {}, playVinylBackspin: () => {}, setAudioCrossfade: () => {} };
  }
  if (id === './settingsStore') {
    return {
      useSettingsStore: {
        getState: () => ({
          autoplay: false,
          offlineModeOnly: false,
          crossfadeDuration: 0,
          setCrossfade: () => {}
        }),
        setState: () => {}
      }
    };
  }
  if (id === '../services/recommendationEngine') {
    return { getSmartRecommendations: async () => [] };
  }
  if (id === '../services/offlineVault') {
    return { getOfflineTracks: () => [] };
  }
  if (id === '../services/jamAuthority') {
    return {
      isJamGuestBlocked: () => guestBlocked,
      handleJamGuestPlayTrack: (track) => guestDelegatedTracks.push(track),
      isJamRemoteApplying: () => remoteApplying
    };
  }
  return nodeRequire(id);
};

new Function('require', 'exports', 'module', transpileTsFile('src/stores/playerStore.ts'))(
  playerRequire,
  playerModule.exports,
  playerModule
);

const { usePlayerStore } = playerModule.exports;

function makeTrack(id, title, duration = 200) {
  return {
    id,
    title,
    artist: 'Artist',
    album: 'Album',
    duration,
    thumbnail: '',
    thumbnailLarge: ''
  };
}

describe('Real playerStore Queue, Repeat, Shuffle & Jam Guard Tests (src/stores/playerStore.ts)', () => {
  beforeEach(() => {
    guestBlocked = false;
    remoteApplying = false;
    guestDelegatedTracks.length = 0;
    lsData.clear();
    usePlayerStore.setState({
      currentTrack: null,
      isPlaying: false,
      progress: 0,
      currentTime: 0,
      duration: 0,
      volume: 0.8,
      isMuted: false,
      repeatMode: 'off',
      isShuffled: false,
      queue: [],
      originalQueue: [],
      queueIndex: -1
    });
  });

  after(() => {
    // Flush any pending 120ms session timer cleanly so Node exits immediately
    for (const fn of windowListeners.get('beforeunload') || []) {
      fn();
    }
    if (origGlobals.window === undefined) delete globalThis.window;
    else globalThis.window = origGlobals.window;
    if (origGlobals.document === undefined) delete globalThis.document;
    else globalThis.document = origGlobals.document;
    if (origGlobals.localStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = origGlobals.localStorage;
  });

  it('plays track with explicit queue, advances nextTrack, and respects repeatMode off vs all', () => {
    const t1 = makeTrack('1', 'One', 180);
    const t2 = makeTrack('2', 'Two', 210);
    const t3 = makeTrack('3', 'Three', 240);

    const store = usePlayerStore.getState();
    store.playTrack(t1, [t1, t2, t3], 0);
    assert.equal(usePlayerStore.getState().queueIndex, 0);
    assert.equal(usePlayerStore.getState().isPlaying, true);
    assert.equal(usePlayerStore.getState().currentTrack?.id, '1');

    store.nextTrack({ silent: true });
    assert.equal(usePlayerStore.getState().queueIndex, 1);
    assert.equal(usePlayerStore.getState().currentTrack?.id, '2');

    store.nextTrack({ silent: true });
    assert.equal(usePlayerStore.getState().queueIndex, 2);
    assert.equal(usePlayerStore.getState().currentTrack?.id, '3');

    // End of queue with repeatMode='off' pauses cleanly
    store.nextTrack({ silent: true });
    assert.equal(usePlayerStore.getState().isPlaying, false);
    assert.equal(usePlayerStore.getState().progress, 0);

    // Enable repeatMode='all' via cycleRepeat and verify wrap-around
    store.cycleRepeat(); // off -> all
    assert.equal(usePlayerStore.getState().repeatMode, 'all');
    store.nextTrack({ silent: true });
    assert.equal(usePlayerStore.getState().queueIndex, 0);
    assert.equal(usePlayerStore.getState().currentTrack?.id, '1');
    assert.equal(usePlayerStore.getState().isPlaying, true);

    store.prevTrack({ silent: true });
    assert.equal(usePlayerStore.getState().queueIndex, 2);
    assert.equal(usePlayerStore.getState().currentTrack?.id, '3');

    // Restart current track when currentTime > 3
    usePlayerStore.setState({ currentTime: 18, progress: 10 });
    store.prevTrack({ silent: true });
    assert.equal(usePlayerStore.getState().queueIndex, 2);
    assert.equal(usePlayerStore.getState().currentTime, 0);
  });

  it('keeps active track first when shuffling and restores exact originalQueue + index on unshuffle', () => {
    const tracks = [makeTrack('a', 'A'), makeTrack('b', 'B'), makeTrack('c', 'C'), makeTrack('d', 'D')];
    const store = usePlayerStore.getState();
    store.playTrack(tracks[2], tracks, 2);
    assert.equal(usePlayerStore.getState().queueIndex, 2);

    store.toggleShuffle();
    let state = usePlayerStore.getState();
    assert.equal(state.isShuffled, true);
    assert.equal(state.queueIndex, 0);
    assert.equal(state.queue[0]?.id, 'c');
    assert.equal(state.queue.length, 4);
    assert.deepEqual(
      [...state.queue].map((t) => t.id).sort(),
      ['a', 'b', 'c', 'd']
    );

    store.toggleShuffle();
    state = usePlayerStore.getState();
    assert.equal(state.isShuffled, false);
    assert.deepEqual(
      state.queue.map((t) => t.id),
      ['a', 'b', 'c', 'd']
    );
    assert.equal(state.queueIndex, 2);
  });

  it('adjusts queueIndex on removeFromQueue, clears state on last item, and enforces Jam guest lock', () => {
    const t1 = makeTrack('1', 'First');
    const t2 = makeTrack('2', 'Second');
    const store = usePlayerStore.getState();
    store.playTrack(t2, [t1, t2], 1);

    // Removing earlier index shifts queueIndex down
    store.removeFromQueue(0);
    assert.equal(usePlayerStore.getState().queueIndex, 0);
    assert.equal(usePlayerStore.getState().currentTrack?.id, '2');

    // Removing last remaining item stops playback cleanly
    store.removeFromQueue(0);
    assert.equal(usePlayerStore.getState().queue.length, 0);
    assert.equal(usePlayerStore.getState().queueIndex, -1);
    assert.equal(usePlayerStore.getState().currentTrack, null);
    assert.equal(usePlayerStore.getState().isPlaying, false);

    // Jam guest mode delegates playTrack without mutating queue directly
    guestBlocked = true;
    store.playTrack(t1, [t1], 0);
    assert.equal(guestDelegatedTracks.length, 1);
    assert.equal(usePlayerStore.getState().queue.length, 0);

    // Remote Jam sync bypasses guest block
    remoteApplying = true;
    store.playTrack(t1, [t1], 0);
    assert.equal(usePlayerStore.getState().currentTrack?.id, '1');
  });
});
