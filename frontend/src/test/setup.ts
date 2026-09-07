import '@testing-library/jest-dom/vitest';

import { initI18n } from '@/i18n';

// Components own some of their copy — the "not legal authority" label on a
// record card, the four confidence levels — so rendering one without i18n
// initialised would show raw keys. Pinned to English for determinism.
const i18n = initI18n();
void i18n.changeLanguage('en');
