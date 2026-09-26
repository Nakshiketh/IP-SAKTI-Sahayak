import '@testing-library/jest-dom/vitest';

import { configure } from '@testing-library/react';

import { i18n, initI18n } from '@/i18n';
import { loadAllEnglish } from '@/i18n/resources';

// Components own some of their copy — the "not legal authority" label on a
// record card, the four confidence levels — so rendering one without i18n
// initialised would show raw keys. Pinned to English for determinism.
//
// `initI18n` resolves once the detected language's files are in place, and it
// is awaited nowhere here on purpose: English is in the first chunk, so it is
// synchronously available the moment `init` returns, and every test then starts
// from the same state without a suite-wide await.
// Route namespaces now arrive with their route's chunk (see App.tsx). A test
// that renders a route component directly never goes through the router, so
// they are all put in place here instead — otherwise every such test would
// assert against dotted keys.
await initI18n();
await i18n.changeLanguage('en');
for (const [namespace, bundle] of Object.entries(await loadAllEnglish())) {
  i18n.addResourceBundle('en', namespace, bundle, true, true);
}

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

// The sign-in gate asks the server who is signed in. Tests answer that one
// question from `test/signedIn.ts` instead; everything else in the auth service
// stays real. See `signInForTest`.
vi.mock('@/services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/auth')>();
  const { currentTestSession } = await import('@/test/signedIn');
  return { ...actual, checkSession: vi.fn(async () => currentTestSession()) };
});

afterEach(async () => {
  const { signOutForTest } = await import('@/test/signedIn');
  signOutForTest();
});

// The sign-in gate now waits for the server's answer before it renders a route
// (it used to trust a token in sessionStorage synchronously), so the first
// page in a test file arrives a tick later, behind a cold lazy import. One
// second was already tight under a full parallel run; `findBy*` waits three.
configure({ asyncUtilTimeout: 3000 });
