// Security-only flat configuration. It does not replace the normal lint config.
// Install and lock compatible analyzer versions; probes verify actual coverage.
import astro from 'eslint-plugin-astro';
import { parser as tsParser } from 'typescript-eslint';
import security from 'eslint-plugin-security';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

const scriptFiles = ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'];
export default [
  // Intentionally no blanket source-directory ignores. The runner inventories files.
  ...astro.configs.base,
  {
    files: scriptFiles,
    languageOptions: { ecmaVersion: 'latest', parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    files: ['**/*.{ts,mts,cts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { project: null } },
  },
  {
    files: ['**/*.astro'],
    languageOptions: { parserOptions: { parser: tsParser } },
    rules: { 'astro/no-set-html-directive': 'error' },
  },
  {
    files: [...scriptFiles, '**/*.astro'],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    plugins: { security, 'no-unsanitized': noUnsanitized },
    rules: {
      ...security.configs.recommended.rules,
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
    },
  },
];
