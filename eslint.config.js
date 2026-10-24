// Lint, for development only: `cd tests && npm run lint`. ESLint is installed in tests/, not in the app.
const { createRequire } = require('module');

const req = createRequire(`${__dirname}/tests/`);
const js = req('@eslint/js');
const globals = req('globals');

module.exports = [
  { ignores: ['public/**', 'vendor/**', '**/node_modules/**', 'tests/shots/**'] },
  js.configs.recommended,
  // The page scripts: plain browser scripts, each one inside its own function.
  { files: ['*.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser } } },
  { files: ['sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  {
    files: ['build.js', 'eslint.config.js', 'api/**/*.js', 'tests/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  // The tests also hold code that runs in the page (page.evaluate).
  { files: ['tests/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      // The code starts variables with a value on purpose (null before a try), and its regexes strip control
      // characters on purpose.
      'no-useless-assignment': 'off',
      'no-control-regex': 'off',
      'preserve-caught-error': 'off',
    },
  },
];
