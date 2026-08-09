// @vitest-environment node

/**
 * Go detector Unit Tests
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { detectGo } from '@/infrastructure/services/deployment/detectors/go.detector.js';
import { cleanupFixtures, makeFixture } from '@tests/helpers/detector-fixture.helper.js';

const GO_MOD = 'module example.com/app\n\ngo 1.22\n';

afterEach(() => cleanupFixtures());

describe('detectGo', () => {
  it('resolves "go run ." for a root main package', () => {
    const dir = makeFixture('go-root', {
      'go.mod': GO_MOD,
      'main.go': 'package main\n\nfunc main() {}\n',
    });

    expect(detectGo(dir)).toMatchObject({
      success: true,
      command: 'go run .',
      language: 'Go',
      runtime: 'go',
      setupCommands: ['go mod download'],
      resolvedDir: dir,
    });
  });

  it('resolves the cmd/ layout to its package path', () => {
    const dir = makeFixture('go-cmd', {
      'go.mod': GO_MOD,
      'internal/lib.go': 'package internal\n',
      'cmd/server/main.go': 'package main\n\nfunc main() {}\n',
    });

    expect(detectGo(dir)).toMatchObject({ command: 'go run ./cmd/server' });
  });

  it('leaves expectedPort unset — nothing explicit declares one', () => {
    const dir = makeFixture('go-port', {
      'go.mod': GO_MOD,
      'main.go': 'package main\n',
    });

    const result = detectGo(dir);

    expect(result.success && result.expectedPort).toBeUndefined();
  });
});

describe('detectGo — fall-through', () => {
  it('falls through when go.mod is absent', () => {
    const dir = makeFixture('go-nomod', { 'main.go': 'package main\n' });

    expect(detectGo(dir).success).toBe(false);
  });

  it('falls through for a library-only module rather than emitting an unrunnable command', () => {
    const dir = makeFixture('go-lib', {
      'go.mod': GO_MOD,
      'lib.go': 'package lib\n\nfunc Do() {}\n',
    });

    expect(detectGo(dir).success).toBe(false);
  });

  it('ignores _test.go files when looking for a main package', () => {
    const dir = makeFixture('go-testonly', {
      'go.mod': GO_MOD,
      'main_test.go': 'package main\n',
    });

    expect(detectGo(dir).success).toBe(false);
  });

  it('never reads another ecosystem manifest when go.mod is absent', () => {
    const dir = makeFixture('go-gate', { 'package.json': 'module example.com/app\n' });

    expect(detectGo(dir).success).toBe(false);
  });
});
