/**
 * CLI Version Command E2E Tests
 *
 * Tests for the `shep version` command and `shep --version` flag.
 * Verifies correct output format and content.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../helpers/cli/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf-8'));

describe('CLI: version', () => {
  it('should display full version info with name, description, Node, and platform', () => {
    const result = runCli('version');

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('@shepai/cli');
    expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
    expect(result.stdout).toContain('Autonomous AI-native SDLC platform');
    expect(result.stdout).toContain('Node:');
    expect(result.stdout).toMatch(/Node:.*v\d+\.\d+\.\d+/);
    expect(result.stdout).toContain('Platform:');
    expect(result.stdout).toMatch(/Platform:.*\w+\s+\w+/);
  });

  it('should display version matching package.json with --version flag', () => {
    const result = runCli('--version');

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.stdout).toBe(pkg.version);
  });

  it('should display version number with -v short flag', () => {
    const result = runCli('-v');

    expect(result.success).toBe(true);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
