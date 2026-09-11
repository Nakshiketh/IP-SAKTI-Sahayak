import '@testing-library/jest-dom/vitest';

import { i18n, initI18n } from '@/i18n';

// Components own some of their copy — the "not legal authority" label on a
// record card, the four confidence levels — so rendering one without i18n
// initialised would show raw keys. Pinned to English for determinism.
//
// `initI18n` resolves once the detected language's files are in place, and it
// is awaited nowhere here on purpose: English is in the first chunk, so it is
// synchronously available the moment `init` returns, and every test then starts
// from the same state without a suite-wide await.
void initI18n();
void i18n.changeLanguage('en');

// jsdom implements no media playback: `play()` reports "not implemented" and
// returns nothing. The shell plays a background video on every route, so
// without this every route test would print that error. Resolving is what a
// browser does when playback is allowed.
// Writable, so a test can make one play refused, as a browser does before any
// gesture.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  writable: true,
  value: () => Promise.resolve(),
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  writable: true,
  value: () => undefined,
});
