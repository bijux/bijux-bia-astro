// Source structure audit, independent of unused-code rules.
import astro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';
import markup from '../../../scripts/audits/markup/explicit-closing-tags.mjs';

export default [
  { ignores: ['.astro', '**/node_modules/**', '**/.git/**', '.astro/**', 'dist/**', '.netlify/**', 'artifacts/**', 'coverage/**'] },
  ...astro.configs.base,
  {
    files: ['**/*.astro'],
    processor: 'astro/client-side-ts',
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.astro'] },
    },
    plugins: { markup },
    rules: {
      // Retain compiler warnings alongside authored-boundary checks.
      'astro/valid-compile': 'error',
      'markup/explicit-closing-tags': 'error',
    },
  },
  {
    files: ['**/*.astro/*.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: null } },
  },
];
