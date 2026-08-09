// @vitest-environment node

/**
 * Rust detector Unit Tests
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { detectRust } from '@/infrastructure/services/deployment/detectors/rust.detector.js';
import { cleanupFixtures, makeFixture } from '@tests/helpers/detector-fixture.helper.js';

afterEach(() => cleanupFixtures());

describe('detectRust', () => {
  it('resolves "cargo run" for a package manifest', () => {
    const dir = makeFixture('rust-pkg', {
      'Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\n\n[dependencies]\n',
    });

    expect(detectRust(dir)).toEqual({
      success: true,
      command: 'cargo run',
      needsInstall: false,
      resolvedDir: dir,
      language: 'Rust',
      runtime: 'cargo',
      setupCommands: [],
    });
  });

  it('resolves regardless of Cargo.toml contents beyond the [package] header', () => {
    const dir = makeFixture('rust-content', {
      'Cargo.toml': '[dependencies]\naxum = "0.7"\n\n[package]\nname = "svc"\n',
      'Cargo.lock': '',
    });

    expect(detectRust(dir)).toMatchObject({ command: 'cargo run' });
  });
});

describe('detectRust — fall-through', () => {
  it('falls through for a virtual workspace manifest', () => {
    const dir = makeFixture('rust-workspace', {
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
    });

    expect(detectRust(dir).success).toBe(false);
  });

  it('falls through when Cargo.toml is absent', () => {
    const dir = makeFixture('rust-none');

    expect(detectRust(dir).success).toBe(false);
  });

  it('falls through on malformed content without throwing', () => {
    const dir = makeFixture('rust-broken', { 'Cargo.toml': '[[[garbage\n' });

    expect(() => detectRust(dir)).not.toThrow();
    expect(detectRust(dir).success).toBe(false);
  });

  it('does not treat a bracketed word inside a value as a table header', () => {
    const dir = makeFixture('rust-value', {
      'Cargo.toml': '[workspace]\ndescription = "[package] not a header"\n',
    });

    expect(detectRust(dir).success).toBe(false);
  });

  it('never reads another ecosystem manifest when Cargo.toml is absent', () => {
    const dir = makeFixture('rust-gate', { 'package.json': '[package]\nname = "app"\n' });

    expect(detectRust(dir).success).toBe(false);
  });
});
