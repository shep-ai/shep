/**
 * Smoke tests verifying that the cross-platform dependencies (tree-kill, which)
 * are correctly installed and importable from within the core package.
 *
 * These packages are used by:
 * - tree-kill: process-tree-terminator.adapter.ts (Stop / liveness sweep tree termination)
 * - which: tool-installer.service.ts, json-driven-ide-launcher.service.ts (binary detection)
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Resolve from packages/core where the dependencies are installed.
// Use a path ending in a dummy filename (not package.json) so that
// createRequire resolves relative to the packages/core directory
// reliably across platforms and vitest worker environments.
const coreRequire = createRequire(
  resolve(import.meta.dirname, '../../../../packages/core/index.js')
);

describe('cross-platform dependency smoke tests', () => {
  describe('tree-kill', () => {
    it('is installed and exports a function', () => {
      const treeKill = coreRequire('tree-kill');
      expect(typeof treeKill).toBe('function');
    });
  });

  describe('which', () => {
    it('is installed and exports a function', () => {
      const which = coreRequire('which');
      expect(typeof which).toBe('function');
    });

    it('has a sync method', () => {
      const which = coreRequire('which');
      expect(typeof which.sync).toBe('function');
    });
  });
});
