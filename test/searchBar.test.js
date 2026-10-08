import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Search Bar Fast Typing & Feedback Loop Prevention', () => {
  // Model of the TopBar search state machine & feedback loop guard
  class SearchInputController {
    constructor(initialUrlQuery = '') {
      this.urlQuery = initialUrlQuery;
      this.searchQuery = initialUrlQuery;
      this.lastPushedQuery = initialUrlQuery;
      this.isFocused = false;
      this.dispatchedRoutes = [];
      this.debounceTimer = null;
      this.searchRequestId = 0;
      this.debounceMs = 280;
    }

    focus() {
      this.isFocused = true;
    }

    blur() {
      this.isFocused = false;
    }

    // Called on every keystroke
    type(nextValue) {
      this.searchQuery = nextValue;
      const reqId = ++this.searchRequestId;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);

      const trimmed = nextValue.trim();
      if (!trimmed) {
        this.lastPushedQuery = '';
        this.dispatchedRoutes.push('/search');
        return;
      }

      this.debounceTimer = setTimeout(() => {
        if (reqId !== this.searchRequestId) return;
        this.lastPushedQuery = trimmed;
        this.dispatchedRoutes.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }, this.debounceMs);
    }

    // Enter key immediate dispatch
    pressEnter() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      const trimmed = this.searchQuery.trim();
      this.lastPushedQuery = trimmed;
      if (trimmed) {
        this.dispatchedRoutes.push(`/search?q=${encodeURIComponent(trimmed)}`);
      } else {
        this.dispatchedRoutes.push('/search');
      }
    }

    // Simulates React Router updating urlQuery (e.g. after navigate replace or external link)
    receiveUrlChange(newUrlQuery) {
      this.urlQuery = newUrlQuery;
      // The guard implemented in TopBar:
      if (this.urlQuery === this.lastPushedQuery) {
        // Echo of our own dispatch — do NOT clobber user's active input!
        return;
      }
      if (this.isFocused) {
        // User is actively focused and typing — do not clobber
        return;
      }
      this.searchQuery = newUrlQuery;
      this.lastPushedQuery = newUrlQuery;
    }
  }

  test('High-speed continuous typing does not drop any characters', async () => {
    const controller = new SearchInputController('');
    controller.focus();

    const textToType = 'Coldplay Viva La Vida';
    let currentInput = '';

    // Simulate fast typing: 60ms between characters
    for (const char of textToType) {
      currentInput += char;
      controller.type(currentInput);
      await new Promise((r) => setTimeout(r, 20)); // faster than 280ms debounce
    }

    // Verify input state is 100% intact with zero dropped letters
    assert.strictEqual(controller.searchQuery, textToType);

    // Wait for debounce to fire
    await new Promise((r) => setTimeout(r, 320));

    // The router should have received the full query
    assert.strictEqual(controller.lastPushedQuery, textToType.trim());
    assert.ok(
      controller.dispatchedRoutes.includes(`/search?q=${encodeURIComponent(textToType.trim())}`)
    );

    // Now simulate React Router updating urlQuery with the pushed query
    controller.receiveUrlChange(textToType.trim());

    // Verify it didn't reset or alter the input state
    assert.strictEqual(controller.searchQuery, textToType);
  });

  test('Feedback loop guard prevents intermediate router update from clobbering incoming keystrokes', async () => {
    const controller = new SearchInputController('');
    controller.focus();

    // User types "Cold"
    controller.type('Cold');
    // Pause enough for debounce to fire for "Cold"
    await new Promise((r) => setTimeout(r, 300));
    assert.strictEqual(controller.lastPushedQuery, 'Cold');

    // While router is asynchronously processing the navigation, user immediately continues typing "play"
    controller.type('Coldp');
    controller.type('Coldpl');
    controller.type('Coldplay');

    // Router commits the previous navigation to "Cold"
    controller.receiveUrlChange('Cold');

    // CRITICAL: The search query must NOT have reverted to "Cold"! It must remain "Coldplay"!
    assert.strictEqual(controller.searchQuery, 'Coldplay');

    // Wait for the debounce of "Coldplay" to fire
    await new Promise((r) => setTimeout(r, 300));
    assert.strictEqual(controller.lastPushedQuery, 'Coldplay');

    // Router commits the navigation to "Coldplay"
    controller.receiveUrlChange('Coldplay');
    assert.strictEqual(controller.searchQuery, 'Coldplay');
  });

  test('Preserves trailing space during typing', async () => {
    const controller = new SearchInputController('');
    controller.focus();

    // User types "Taylor " (with space)
    controller.type('Taylor ');
    await new Promise((r) => setTimeout(r, 300));

    // Pushed query is trimmed to "Taylor"
    assert.strictEqual(controller.lastPushedQuery, 'Taylor');

    // Router updates to "Taylor"
    controller.receiveUrlChange('Taylor');

    // Space must NOT be stripped from active typing input
    assert.strictEqual(controller.searchQuery, 'Taylor ');

    // User continues typing "Swift"
    controller.type('Taylor Swift');
    assert.strictEqual(controller.searchQuery, 'Taylor Swift');
  });

  test('External navigation (e.g. clicking trending tag) cleanly updates the search bar when blurred', () => {
    const controller = new SearchInputController('');

    // User clicks a trending search tag like "Arijit Singh"
    controller.receiveUrlChange('Arijit Singh');

    assert.strictEqual(controller.searchQuery, 'Arijit Singh');
    assert.strictEqual(controller.lastPushedQuery, 'Arijit Singh');

    // User clicks browser Back to home page (empty query)
    controller.receiveUrlChange('');
    assert.strictEqual(controller.searchQuery, '');
    assert.strictEqual(controller.lastPushedQuery, '');
  });

  test('Enter key immediately flushes query and cancels pending debounce', async () => {
    const controller = new SearchInputController('');
    controller.focus();

    controller.type('The Beatles');
    controller.pressEnter();

    assert.strictEqual(controller.lastPushedQuery, 'The Beatles');
    assert.ok(
      controller.dispatchedRoutes.includes(`/search?q=${encodeURIComponent('The Beatles')}`)
    );
  });
});
