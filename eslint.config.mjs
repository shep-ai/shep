// @ts-check
/**
 * ESLint Flat Config for Shep AI CLI
 *
 * This configuration uses ESLint 9+ flat config format with TypeScript support.
 * It's designed to be scalable and maintainable for a large open source project.
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 * @see https://typescript-eslint.io/getting-started/
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import tailwindPlugin from 'eslint-plugin-tailwindcss';
import storybookPlugin from 'eslint-plugin-storybook';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  // =============================================================================
  // Global ignores (replaces .eslintignore)
  // =============================================================================
  {
    ignores: [
      // Build outputs
      'dist/**',
      'packages/*/dist/**',
      'packages/*/release/**',
      'build/**',
      'web/**',
      '**/.next/**',
      'out/**',
      '**/storybook-static/**',

      // Dependencies
      'node_modules/**',

      // Git worktrees (parallel development checkouts)
      '.worktrees/**',

      // Generated files
      'apis/**',
      '*.generated.*',
      'coverage/**',
      'next-env.d.ts',
      'src/domain/generated/**', // TypeSpec-generated domain models
      'packages/core/src/domain/generated/**', // TypeSpec-generated domain models (core)

      // Spec artifacts (auto-generated YAML/MD, evidence PNGs)
      'specs/**',

      // Claude Code skills (third-party)
      '.claude/skills/**',

      // TypeSpec (handled by tsp linter)
      'tsp/**',

      // Test outputs
      'test-results/**',
      'playwright-report/**',

      // POC TypeScript files (not part of main tsconfig)
      'docs/poc/**/*.ts',

      // Config files that don't need linting
      '*.config.js',
      '*.config.mjs',
      '*.config.cjs',
      '*.config.ts',
    ],
  },

  // =============================================================================
  // Base ESLint recommended rules
  // =============================================================================
  eslint.configs.recommended,

  // =============================================================================
  // TypeScript recommended rules
  // =============================================================================
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  // =============================================================================
  // Project-specific TypeScript rules
  // =============================================================================
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // -------------------------------------------------------------------------
      // TypeScript-specific rules
      // -------------------------------------------------------------------------

      // Prefer type-only imports for types (tree-shaking friendly)
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],

      // Require explicit return types on public methods
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Allow unused vars with underscore prefix
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Prefer nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // Prefer optional chaining
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // No floating promises (must handle or void)
      '@typescript-eslint/no-floating-promises': 'off', // Enable when typed linting is set up

      // No misused promises
      '@typescript-eslint/no-misused-promises': 'off', // Enable when typed linting is set up

      // -------------------------------------------------------------------------
      // General code quality rules
      // -------------------------------------------------------------------------

      // Enforce consistent brace style
      curly: ['warn', 'all'],

      // Require === and !==
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // No console in production code (warn for now)
      'no-console': 'warn',

      // No debugger statements
      'no-debugger': 'error',

      // Prefer const over let when variable is not reassigned
      'prefer-const': 'warn',

      // Prefer template literals over string concatenation
      'prefer-template': 'warn',

      // No var, use let or const
      'no-var': 'error',
    },
  },

  // =============================================================================
  // JavaScript files (no TypeScript rules)
  // =============================================================================
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  // =============================================================================
  // CLI presentation layer - allow console statements (intentional user output)
  // =============================================================================
  {
    files: ['src/presentation/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // =============================================================================
  // POC/Demo files - browser environment, relaxed rules
  // =============================================================================
  {
    files: ['docs/poc/**/*.js'],
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },

  // =============================================================================
  // Test files - relaxed rules
  // =============================================================================
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  // =============================================================================
  // React/Next.js configuration for web presentation layer
  // =============================================================================
  {
    files: ['src/presentation/web/**/*.tsx', 'src/presentation/web/**/*.ts'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      '@next/next': nextPlugin,
      tailwindcss: tailwindPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      tailwindcss: {
        config: `${__dirname}/src/presentation/web/app/globals.css`,
      },
    },
    rules: {
      // React rules
      'react/jsx-uses-react': 'off', // Not needed with React 19 JSX transform
      'react/react-in-jsx-scope': 'off', // Not needed with React 19 JSX transform
      'react/prop-types': 'off', // Using TypeScript for prop types
      'react/jsx-no-target-blank': 'error',
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'warn',
      'react/self-closing-comp': 'warn',
      'react/jsx-no-useless-fragment': 'warn',
      'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],
      'react/hook-use-state': 'warn',
      'react/jsx-no-leaked-render': 'warn',
      'react/no-unstable-nested-components': 'error',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Next.js rules
      '@next/next/no-html-link-for-pages': 'error',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-sync-scripts': 'error',

      // Tailwind CSS rules
      // Class sorting is handled by prettier-plugin-tailwindcss
      'tailwindcss/classnames-order': 'off',
      'tailwindcss/no-contradicting-classname': 'error',
      'tailwindcss/no-unnecessary-arbitrary-value': 'warn',
      'tailwindcss/enforces-shorthand': 'warn',
    },
  },

  // =============================================================================
  // Storybook story files
  // =============================================================================
  {
    files: ['**/*.stories.@(ts|tsx)'],
    plugins: {
      storybook: storybookPlugin,
    },
    rules: {
      'storybook/default-exports': 'error',
      'storybook/hierarchy-separator': 'error',
      'storybook/no-uninstalled-addons': 'error',
      'storybook/prefer-pascal-case': 'warn',
    },
  },

  // =============================================================================
  // Prettier compatibility (must be last)
  // =============================================================================
  prettierConfig
);
