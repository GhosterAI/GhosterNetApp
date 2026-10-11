const js = require('@eslint/js')
const react = require('eslint-plugin-react')
const { configs } = require('@electron-toolkit/eslint-config-ts')

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/extra/**',
      '**/Slipgate-main/**',
      '**/Zapret-Zen-main/**',
      '**/Dns-AI/**',
      '**/antigravityUnlocker/**',
      '**/tg-ws-proxy-main/**',
      '**/zapret-discord-youtube-main/**'
    ]
  },

  js.configs.recommended,
  ...configs.recommended,

  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: react
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react/prop-types': 'off'
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    languageOptions: {
      ...react.configs.recommended.languageOptions
    }
  },

  {
    files: ['**/*.cjs', '**/*.mjs', '**/tailwind.config.js', '**/postcss.config.js', 'scripts/**/*'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
]
