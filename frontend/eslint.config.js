import js from '@eslint/js';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    /**
     * No hard-coded user-facing strings.
     *
     * Every string a reader can see comes from src/locales. The rule is what
     * makes that true rather than aspirational: without it, the sixth language
     * silently stops being a real translation the first time someone types a
     * word straight into JSX.
     */
    files: ['src/**/*.tsx'],
    ignores: [
      // The design specimen is a development surface, not a product page, and it
      // is not registered in a production build. Translating it would put
      // developer prose into the shipped locale files.
      'src/routes/DesignSystem.tsx',
      'src/**/*.test.tsx',
    ],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'should-validate-template': false,
          'jsx-attributes': {
            include: ['alt', 'aria-label', 'aria-placeholder', 'placeholder', 'title'],
          },
          // `tc` is the house alias for the common namespace when a component
          // already holds a `t` for its own one. Without this the rule reads the
          // key inside tc('...') as a hard-coded string.
          callees: { exclude: ['t', 'tc', 'i18n.t', 'require', 'import'] },
          message: 'User-facing strings belong in src/locales, not in JSX.',
        },
      ],
    },
  },
  {
    // Node-side config and tests.
    files: ['*.config.{ts,js}', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
