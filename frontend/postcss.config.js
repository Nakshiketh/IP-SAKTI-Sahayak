export default {
  plugins: {
    // First, so @import is inlined before Tailwind processes @layer blocks.
    'postcss-import': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
