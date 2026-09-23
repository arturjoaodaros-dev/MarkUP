import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Every workspace package exposes a `source` export condition that points at its
 * TypeScript entry. Resolving it here means tests always run against the current
 * sources of sibling packages — no build step is required before `npm test`.
 */
const resolve = { conditions: ['source', ...defaultClientConditions] };
const ssr = { resolve: { conditions: ['source', ...defaultServerConditions] } };

export default defineConfig({
  resolve,
  ssr,
  test: {
    projects: [
      {
        resolve,
        ssr,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/test/**/*.test.ts',
            'examples/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
          exclude: ['packages/desktop/**', '**/node_modules/**'],
          testTimeout: 30_000,
        },
      },
      {
        resolve,
        ssr,
        test: {
          name: 'desktop',
          environment: 'jsdom',
          include: ['packages/desktop/test/**/*.test.{ts,tsx}'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
