import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

const sharedExclude = [
  'node_modules',
  'dist',
  'tests/e2e/**/*.spec.ts',
  'tests/e2e/**/*.spec.tsx',
  'tests/manual/**/*.manual.test.ts',
  'tests/manual/**/*.manual.test.tsx',
];

const sharedResolve = {
  alias: [
    {
      find: '@tanstack/react-query',
      replacement: resolve(__dirname, './src/presentation/web/node_modules/@tanstack/react-query'),
    },
    { find: '@shepai/core', replacement: resolve(__dirname, './packages/core/src') },
    { find: '@/application', replacement: resolve(__dirname, './packages/core/src/application') },
    {
      find: '@/infrastructure',
      replacement: resolve(__dirname, './packages/core/src/infrastructure'),
    },
    { find: '@/domain', replacement: resolve(__dirname, './packages/core/src/domain') },
    { find: '@/components', replacement: resolve(__dirname, './src/presentation/web/components') },
    { find: '@/lib', replacement: resolve(__dirname, './src/presentation/web/lib') },
    { find: '@/hooks', replacement: resolve(__dirname, './src/presentation/web/hooks') },
    { find: '@/app', replacement: resolve(__dirname, './src/presentation/web/app') },
    { find: '@/types', replacement: resolve(__dirname, './src/presentation/web/types') },
    { find: '@cli', replacement: resolve(__dirname, './src') },
    { find: '@', replacement: resolve(__dirname, './src') },
    { find: '@tests', replacement: resolve(__dirname, './tests') },
  ],
};

// Ensure React loads its development bundle (which exports `act`) even when
// the shell environment has NODE_ENV=production (e.g. after a build step).
(process.env as Record<string, string>).NODE_ENV = 'test';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'tests', '**/*.d.ts', '**/*.config.*'],
    },
    // Two projects: web tests get jsdom + setup, everything else runs in fast node env
    projects: [
      {
        test: {
          name: 'web',
          include: [
            'tests/unit/presentation/web/**/*.test.ts',
            'tests/unit/presentation/web/**/*.test.tsx',
          ],
          exclude: sharedExclude,
          environment: 'jsdom',
          setupFiles: ['tests/unit/presentation/web/setup.ts'],
          testTimeout: 10000,
        },
        resolve: sharedResolve,
      },
      {
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: [
            ...sharedExclude,
            'tests/unit/presentation/web/**/*.test.ts',
            'tests/unit/presentation/web/**/*.test.tsx',
          ],
          environment: 'node',
          setupFiles: ['tests/unit/setup.ts'],
          // testTimeout / hookTimeout are sized for the heaviest integration
          // tests, which spawn real git harnesses. On the Windows CI runner
          // git's process startup + filesystem latency can push a single
          // setup or test past vitest's defaults (10s hook / 30s test) even
          // when the test itself is healthy. Bumping the project ceilings
          // turns Windows-only flakes into either a clean pass or a real
          // signal we have to investigate, never a false positive at the
          // arbitrary default boundary.
          testTimeout: 60000,
          hookTimeout: 20000,
        },
        resolve: sharedResolve,
      },
    ],
  },
  resolve: sharedResolve,
});
