import type { Config } from 'tailwindcss';

/**
 * The theme is the token file. Every value here dereferences a CSS variable
 * declared in src/styles/tokens.css, so there is one place a colour, size or
 * radius is decided and Tailwind is only a way of reaching it.
 *
 * Deliberately absent: a shadow scale (this design rules with hairlines, not
 * shadows), a gradient stop set, and any colour outside the six palette tokens.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        leaf: 'rgb(var(--leaf-rgb) / <alpha-value>)',
        sap: 'rgb(var(--sap-rgb) / <alpha-value>)',
        bone: 'rgb(var(--bone-rgb) / <alpha-value>)',
        lac: 'rgb(var(--lac-rgb) / <alpha-value>)',
        stamp: 'rgb(var(--stamp-rgb) / <alpha-value>)',
        surface: 'var(--surface)',
        'surface-sunk': 'var(--surface-sunk)',
        muted: 'var(--text-muted)',
      },
      borderColor: {
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        'rule-faint': 'var(--rule-faint)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
      },
      fontSize: {
        xs: ['var(--text-xs)', { lineHeight: '1.5' }],
        base: ['var(--text-base)', { lineHeight: '1.6' }],
        md: ['var(--text-md)', { lineHeight: '1.45' }],
        lg: ['var(--text-lg)', { lineHeight: '1.3' }],
        xl: ['var(--text-xl)', { lineHeight: '1.2' }],
        '2xl': ['var(--text-2xl)', { lineHeight: '1.15' }],
        '3xl': ['var(--text-3xl)', { lineHeight: '1.1' }],
      },
      borderRadius: {
        data: 'var(--radius-data)',
        control: 'var(--radius-control)',
        seal: 'var(--radius-seal)',
      },
      maxWidth: {
        measure: 'var(--measure)',
      },
      transitionTimingFunction: {
        incise: 'var(--ease-incise)',
      },
      transitionDuration: {
        quick: 'var(--dur-quick)',
        panel: 'var(--dur-panel)',
      },
      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        // The hero's draw-on. A stroke incised along its own length, not faded
        // in: opacity would read as decoration, this reads as writing.
        incise: {
          from: { strokeDashoffset: 'var(--len)' },
          to: { strokeDashoffset: '0' },
        },
        seal: {
          from: { opacity: '0', transform: 'scale(0.6)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        // Motion that answers an action: a panel arriving from the edge it lives on.
        'slide-in-right': 'slide-in-right var(--dur-panel) var(--ease-incise)',
        'slide-up': 'slide-up var(--dur-panel) var(--ease-incise)',
      },
    },
  },
  plugins: [],
} satisfies Config;
