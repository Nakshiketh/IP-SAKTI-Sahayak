import type { Config } from 'tailwindcss';

// Phase 0 wires Tailwind up and nothing more. The palette, type scale, radius set
// and structural tokens are defined in Phase 1 (design system) — see
// docs/MASTER_BUILD.md. Do not add ad-hoc colours here in the meantime.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
