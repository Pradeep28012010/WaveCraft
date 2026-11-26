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
  localStorage: globalThis.localStorage,
  navigator: globalThis.navigator
};

const lsData = new Map();
const localStorageMock = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
  clear: () => lsData.clear()
};

const windowListeners = new Map();
const cssProperties = new Map();
let mockIdbSettings = null;
const savedIdbPayloads = [];

globalThis.localStorage = localStorageMock;
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  localStorage: localStorageMock,
  addEventListener: (ev, fn) => {
    if (!windowListeners.has(ev)) windowListeners.set(ev, new Set());
    windowListeners.get(ev).add(fn);
  },
  removeEventListener: (ev, fn) => windowListeners.get(ev)?.delete(fn)
};
globalThis.document = {
  visibilityState: 'visible',
  documentElement: {
    style: {
      setProperty: (k, v) => cssProperties.set(k, v)
    }
  },
  addEventListener: () => {}
};
globalThis.navigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
};

const configCode = transpileTsFile('src/utils/contextMenuConfig.ts');
const settingsStoreCode = transpileTsFile('src/stores/settingsStore.ts');

function loadConfigModule() {
  const mod = { exports: {} };
  const req = (id) => {
    if (id === '../types') return {};
    return nodeRequire(id);
  };
  new Function('require', 'exports', 'module', configCode)(req, mod.exports, mod);
  return mod.exports;
}

function loadFreshSettingsStoreModule(configExports) {
  const mod = { exports: {} };
  const req = (id) => {
    if (id === 'zustand') return nodeRequire('zustand');
    if (id === '../types') return {};
    if (id === '../utils/contextMenuConfig') return configExports;
    if (id === '../utils/constants') {
      return {
        EQ_PRESETS: {
          Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        }
      };
    }
    if (id === '../services/storage') {
      return {
        loadSettings: async () => mockIdbSettings,
        saveSettings: async (clean) => {
          mockIdbSettings = JSON.parse(JSON.stringify(clean));
          savedIdbPayloads.push(mockIdbSettings);
        }
      };
    }
    return nodeRequire(id);
  };
  new Function('require', 'exports', 'module', settingsStoreCode)(req, mod.exports, mod);
  return mod.exports;
}

const configApi = loadConfigModule();
let settingsModule = loadFreshSettingsStoreModule(configApi);

function flushWindowUnload() {
  for (const fn of windowListeners.get('beforeunload') || []) {
    fn();
  }
}

describe('Context Menu Config & settingsStore Persistence Tests', () => {
  beforeEach(() => {
    flushWindowUnload();
    lsData.clear();
    cssProperties.clear();
    mockIdbSettings = null;
    savedIdbPayloads.length = 0;
    settingsModule.useSettingsStore.getState().resetSettings();
    flushWindowUnload();
    lsData.clear();
    savedIdbPayloads.length = 0;
  });

  after(() => {
    flushWindowUnload();
    if (origGlobals.window === undefined) delete globalThis.window;
    else globalThis.window = origGlobals.window;
    if (origGlobals.document === undefined) delete globalThis.document;
    else globalThis.document = origGlobals.document;
    if (origGlobals.localStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = origGlobals.localStorage;
    if (origGlobals.navigator === undefined) delete globalThis.navigator;
    else globalThis.navigator = origGlobals.navigator;
  });

  it('provides 10 track actions, 10 page actions, and distinct compact vs ultra-compact density tokens', () => {
    const def = configApi.createDefaultContextMenuConfig();
    assert.equal(def.density, 'compact');
    assert.equal(def.trackActions.length, 10);
    assert.equal(def.pageActions.length, 10);
    assert.ok(def.trackActions.every((item) => item.enabled === true));
    assert.ok(def.pageActions.every((item) => item.enabled === true));

    const compact = configApi.CONTEXT_MENU_DENSITY_TOKENS.compact;
    const ultra = configApi.CONTEXT_MENU_DENSITY_TOKENS['ultra-compact'];
    assert.ok(compact.widthPx > ultra.widthPx);
    assert.ok(compact.rowHeightPx > ultra.rowHeightPx);
    assert.notEqual(compact.rowPadding, ultra.rowPadding);
    assert.notEqual(compact.textSize, ultra.textSize);
    assert.notEqual(compact.iconSize, ultra.iconSize);
  });

  it('normalizes undefined, partial, duplicate, and unknown config entries safely', () => {
    const fromUndefined = configApi.normalizeContextMenuConfig(undefined);
    assert.deepEqual(fromUndefined, configApi.createDefaultContextMenuConfig());

    const normalized = configApi.normalizeContextMenuConfig({
      density: 'huge-invalid',
      trackActions: [
        { id: 'share', enabled: false },
        { id: 'unknownAction', enabled: true },
        { id: 'share', enabled: true },
        { id: 'playNow', enabled: true }
      ],
      pageActions: 'not-an-array'
    });

    assert.equal(normalized.density, 'compact');
    assert.equal(normalized.trackActions[0].id, 'share');
    assert.equal(normalized.trackActions[0].enabled, false);
    assert.equal(normalized.trackActions[1].id, 'playNow');
    assert.equal(normalized.trackActions[1].enabled, true);
    assert.equal(normalized.trackActions.length, 10);
    assert.equal(
      new Set(normalized.trackActions.map((a) => a.id)).size,
      10
    );
    assert.equal(normalized.pageActions.length, 10);
    assert.ok(normalized.pageActions.every((a) => a.enabled === true));
  });

  it('filters visible actions in configured order and clamps menu coordinates dynamically', () => {
    let cfg = configApi.createDefaultContextMenuConfig();
    cfg = configApi.setContextMenuDensity(cfg, 'ultra-compact');
    cfg = configApi.toggleContextMenuAction(cfg, 'track', 'playNext', false);
    cfg = configApi.reorderContextMenuActions(cfg, 'track', 9, 0); // move 'share' to index 0

    const visible = configApi.getVisibleContextMenuActions(cfg, 'track');
    assert.equal(visible[0].id, 'share');
    assert.equal(visible.some((a) => a.id === 'playNext'), false);
    assert.equal(visible.length, 9);

    const dimsUltra = configApi.estimateMenuDimensions(cfg, 'track', { hasTrackHeader: true });
    const dimsCompact = configApi.estimateMenuDimensions(
      configApi.setContextMenuDensity(cfg, 'compact'),
      'track',
      { hasTrackHeader: true }
    );
    assert.ok(dimsUltra.height < dimsCompact.height);
    assert.ok(dimsUltra.width < dimsCompact.width);

    const clamped = configApi.computeClampedMenuPosition({
      x: 1260,
      y: 790,
      menuWidth: dimsUltra.width,
      menuHeight: dimsUltra.height,
      viewportWidth: 1280,
      viewportHeight: 800,
      margin: 12
    });
    assert.equal(clamped.left, 1280 - dimsUltra.width - 12);
    assert.equal(clamped.top, 800 - dimsUltra.height - 12);

    const clampedTopLeft = configApi.computeClampedMenuPosition({
      x: -20,
      y: -10,
      menuWidth: 200,
      menuHeight: 200,
      viewportWidth: 1280,
      viewportHeight: 800,
      margin: 12
    });
    assert.deepEqual(clampedTopLeft, { left: 12, top: 12 });
  });

  it('supports density switching, toggling, reordering, moving, and Reset to Default in settingsStore', () => {
    const store = settingsModule.useSettingsStore.getState();

    store.setAccentColor('#3b82f6');
    store.setContextMenuDensity('ultra-compact');
    store.toggleContextMenuAction('track', 'chorusPreview', false);
    store.toggleContextMenuAction('page', 'nightstand', false);
    store.reorderContextMenuActions('track', 0, 3);
    store.moveContextMenuAction('page', 'studioFx', 'up');

    const state = settingsModule.useSettingsStore.getState();
    assert.equal(state.contextMenu.density, 'ultra-compact');
    assert.equal(
      state.contextMenu.trackActions.find((a) => a.id === 'chorusPreview')?.enabled,
      false
    );
    assert.equal(
      state.contextMenu.pageActions.find((a) => a.id === 'nightstand')?.enabled,
      false
    );
    assert.equal(state.contextMenu.trackActions[3].id, 'playNow');
    assert.equal(state.contextMenu.pageActions[5].id, 'studioFx');

    // Out-of-bounds reorder is a safe no-op
    const beforeOob = JSON.stringify(state.contextMenu.trackActions);
    store.reorderContextMenuActions('track', -1, 5);
    assert.equal(
      JSON.stringify(settingsModule.useSettingsStore.getState().contextMenu.trackActions),
      beforeOob
    );

    // resetContextMenuConfig resets only contextMenu while preserving accentColor
    store.resetContextMenuConfig();
    const afterContextReset = settingsModule.useSettingsStore.getState();
    assert.equal(afterContextReset.accentColor, '#3b82f6');
    assert.deepEqual(
      afterContextReset.contextMenu,
      configApi.createDefaultContextMenuConfig()
    );

    // resetSettings resets everything including contextMenu
    store.setContextMenuDensity('ultra-compact');
    store.resetSettings();
    const afterFullReset = settingsModule.useSettingsStore.getState();
    assert.equal(afterFullReset.accentColor, '#fa2d48');
    assert.deepEqual(
      afterFullReset.contextMenu,
      configApi.createDefaultContextMenuConfig()
    );
  });

  it('persists contextMenu customizations synchronously to localStorage across simulated page reloads', () => {
    const store = settingsModule.useSettingsStore.getState();
    store.setContextMenuDensity('ultra-compact');
    store.toggleContextMenuAction('track', 'share', false);
    store.toggleContextMenuAction('page', 'smartDj', false);
    store.reorderContextMenuActions('track', 4, 0); // addToPlaylist -> first

    // Immediately verify localStorage already has the updated state (no 120ms race)
    const rawSaved = localStorageMock.getItem('wavecraft_settings_v1');
    assert.ok(rawSaved);
    const parsedSaved = JSON.parse(rawSaved);
    assert.equal(parsedSaved.contextMenu.density, 'ultra-compact');
    assert.equal(parsedSaved.contextMenu.trackActions[0].id, 'addToPlaylist');

    // Simulate a fresh page reload by re-instantiating settingsStore against the same localStorage
    const reloadedModule = loadFreshSettingsStoreModule(configApi);
    const reloadedState = reloadedModule.useSettingsStore.getState();
    assert.equal(reloadedState.contextMenu.density, 'ultra-compact');
    assert.equal(reloadedState.contextMenu.trackActions[0].id, 'addToPlaylist');
    assert.equal(
      reloadedState.contextMenu.trackActions.find((a) => a.id === 'share')?.enabled,
      false
    );
    assert.equal(
      reloadedState.contextMenu.pageActions.find((a) => a.id === 'smartDj')?.enabled,
      false
    );
  });

  it('hydrates legacy localStorage and partial IndexedDB payloads backward-compatibly', async () => {
    // 1. Legacy localStorage missing contextMenu completely
    localStorageMock.setItem(
      'wavecraft_settings_v1',
      JSON.stringify({
        theme: 'dark',
        accentColor: '#10b981',
        audioQuality: 'medium'
      })
    );

    const legacyHydrated = loadFreshSettingsStoreModule(configApi);
    const legacyState = legacyHydrated.useSettingsStore.getState();
    assert.equal(legacyState.accentColor, '#10b981');
    assert.equal(legacyState.audioQuality, 'medium');
    assert.deepEqual(legacyState.contextMenu, configApi.createDefaultContextMenuConfig());

    // 2. IndexedDB fallback when localStorage is empty with partial contextMenu
    localStorageMock.clear();
    mockIdbSettings = {
      theme: 'dark',
      accentColor: '#8b5cf6',
      contextMenu: {
        density: 'ultra-compact',
        trackActions: [
          { id: 'viewLyrics', enabled: false },
          { id: 'bogusId', enabled: false }
        ]
      }
    };

    const idbModule = loadFreshSettingsStoreModule(configApi);
    await idbModule.useSettingsStore.getState().loadFromStorage();
    const idbState = idbModule.useSettingsStore.getState();
    assert.equal(idbState.accentColor, '#8b5cf6');
    assert.equal(idbState.contextMenu.density, 'ultra-compact');
    assert.equal(idbState.contextMenu.trackActions[0].id, 'viewLyrics');
    assert.equal(idbState.contextMenu.trackActions[0].enabled, false);
    assert.equal(idbState.contextMenu.trackActions.length, 10);
    assert.equal(idbState.contextMenu.pageActions.length, 10);
  });

  it('verifies ContextMenu.tsx consumes settingsStore.contextMenu and contains zero inline customization controls', () => {
    const contextMenuSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ui/ContextMenu.tsx'),
      'utf8'
    );
    const settingsPageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/settings/SettingsPage.tsx'),
      'utf8'
    );

    assert.match(contextMenuSource, /useSettingsStore\(\(s\)\s*=>\s*s\.contextMenu\)/);
    assert.match(contextMenuSource, /getVisibleContextMenuActions/);
    assert.match(contextMenuSource, /CONTEXT_MENU_DENSITY_TOKENS/);
    assert.match(contextMenuSource, /glass-compact-menu/);
    assert.match(contextMenuSource, /computeClampedMenuPosition/);

    const forbiddenInlineControls = [
      'setContextMenuDensity',
      'toggleContextMenuAction',
      'reorderContextMenuActions',
      'moveContextMenuAction',
      'resetContextMenuConfig',
      'LiquidGlassToggle',
      'ReactBitsReorderList',
      'Reset to Default'
    ];
    for (const token of forbiddenInlineControls) {
      assert.equal(
        contextMenuSource.includes(token),
        false,
        `ContextMenu.tsx must not include inline customization control token: ${token}`
      );
    }

    assert.match(settingsPageSource, /ContextMenuSettingsSection/);
    assert.match(settingsPageSource, /activeCategory\s*===\s*'appearance'/);
    assert.match(settingsPageSource, /activeCategory\s*===\s*'controls'/);
  });
});
