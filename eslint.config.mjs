import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      'release-*/**',
      'tmp-*/**',
      'artifacts/**',
      '.git/**'
    ]
  },
  {
    files: ['**/*.{ts,tsx,js,cjs,mjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  {
    files: ['components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: [
                '../electron/**',
                '../../electron/**',
                '../backend/**',
                '../../backend/**',
                '../main.cjs',
                '../../main.cjs',
                '../preload.cjs',
                '../../preload.cjs',
                '../services/runtimeOpsExternalBridge.cjs',
                '../../services/runtimeOpsExternalBridge.cjs'
              ],
              message: 'UI components must consume runtime data through hooks/services ports, not deep runtime internals.'
            }
          ]
        }
      ],
      'import/no-restricted-paths': [
        'warn',
        {
          zones: [
            {
              target: './components',
              from: './electron',
              message: 'components/** cannot import electron/** directly.'
            },
            {
              target: './components',
              from: './backend',
              message: 'components/** cannot import backend/** directly.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['orchestrators/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../components/**', '../../components/**'],
              message: 'orchestrators/** must not import UI components directly.'
            }
          ]
        }
      ]
    }
  }
];
