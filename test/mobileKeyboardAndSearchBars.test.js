import test from 'node:test';
import assert from 'node:assert/strict';

test('Mobile Keyboard & Search Bottom Bars Behavior', async (t) => {
  function computeHideMobileBars({ isPhone, pathname, isKeyboardOpen }) {
    const isSearch = pathname.startsWith('/search');
    return isPhone && (isSearch || isKeyboardOpen);
  }

  function computeMainContentPadding({ isPhone, hideMobileBars, hasCurrentTrack }) {
    if (!isPhone) {
      return hasCurrentTrack ? 'pb-32' : 'pb-24';
    }
    return hideMobileBars ? 'pb-8' : hasCurrentTrack ? 'pb-44' : 'pb-28';
  }

  await t.test('Hides bottom bars and now playing on mobile when navigating to /search', () => {
    const hidden = computeHideMobileBars({
      isPhone: true,
      pathname: '/search',
      isKeyboardOpen: false
    });
    assert.equal(hidden, true, 'Bottom bars and mini player must be suppressed on mobile search page');
  });

  await t.test('Hides bottom bars on mobile when search has query params', () => {
    const hidden = computeHideMobileBars({
      isPhone: true,
      pathname: '/search?q=anuv+jain',
      isKeyboardOpen: false
    });
    assert.equal(hidden, true, 'Must stay hidden during active query browsing');
  });

  await t.test('Hides bottom bars on mobile whenever virtual keyboard is open on any route', () => {
    const hidden = computeHideMobileBars({
      isPhone: true,
      pathname: '/library',
      isKeyboardOpen: true
    });
    assert.equal(hidden, true, 'Bottom bars must hide when keyboard is open to avoid pushing bars into viewport');
  });

  await t.test('Keeps bottom bars visible on regular pages when keyboard is closed', () => {
    const hiddenHome = computeHideMobileBars({
      isPhone: true,
      pathname: '/',
      isKeyboardOpen: false
    });
    const hiddenLibrary = computeHideMobileBars({
      isPhone: true,
      pathname: '/library',
      isKeyboardOpen: false
    });
    assert.equal(hiddenHome, false, 'Bottom bars should be visible on Home');
    assert.equal(hiddenLibrary, false, 'Bottom bars should be visible on Library');
  });

  await t.test('Desktop view is never affected by phone search hiding logic', () => {
    const hiddenDesktop = computeHideMobileBars({
      isPhone: false,
      pathname: '/search',
      isKeyboardOpen: false
    });
    assert.equal(hiddenDesktop, false, 'Desktop navigation and player bars must remain untouched');
  });

  await t.test('Reduces bottom scroll padding on mobile search so content is not pushed or cut off', () => {
    const searchPadding = computeMainContentPadding({
      isPhone: true,
      hideMobileBars: true,
      hasCurrentTrack: true
    });
    const normalPadding = computeMainContentPadding({
      isPhone: true,
      hideMobileBars: false,
      hasCurrentTrack: true
    });

    assert.equal(searchPadding, 'pb-8', 'Search padding must be compact (pb-8)');
    assert.equal(normalPadding, 'pb-44', 'Normal padding with bars visible must accommodate bars (pb-44)');
  });
});
