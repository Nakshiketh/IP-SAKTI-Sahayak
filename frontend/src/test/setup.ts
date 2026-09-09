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
