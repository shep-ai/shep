// @vitest-environment node

/**
 * Docker Compose detector Unit Tests
 *
 * `expectedPort` is the interesting part: it must be set ONLY when the whole
 * stack publishes exactly one host port, because a wrong port makes the
 * verify node fail a server that started perfectly.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { detectCompose } from '@/infrastructure/services/deployment/detectors/compose.detector.js';
import { cleanupFixtures, makeFixture } from '@tests/helpers/detector-fixture.helper.js';

afterEach(() => cleanupFixtures());

describe('detectCompose — command', () => {
  it('resolves "docker compose up" for a single-service stack', () => {
    const dir = makeFixture('compose-single', {
      'docker-compose.yml': 'services:\n  web:\n    image: nginx\n    ports:\n      - "8080:80"\n',
    });

    expect(detectCompose(dir)).toMatchObject({
      success: true,
      command: 'docker compose up',
      runtime: 'docker',
      expectedPort: 8080,
      resolvedDir: dir,
    });
  });

  it('recognises every supported compose filename', () => {
    for (const name of [
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml',
    ]) {
      const dir = makeFixture('compose-name', { [name]: 'services:\n  web:\n    image: nginx\n' });

      expect(detectCompose(dir)).toMatchObject({ command: 'docker compose up' });
    }
  });
});

describe('detectCompose — expectedPort', () => {
  it('reads the host port from long-form syntax', () => {
    const dir = makeFixture('compose-long', {
      'compose.yaml':
        'services:\n  web:\n    image: nginx\n    ports:\n      - published: 5000\n        target: 80\n',
    });

    expect(detectCompose(dir)).toMatchObject({ expectedPort: 5000 });
  });

  it('reads the host port from an interface-qualified short mapping', () => {
    const dir = makeFixture('compose-iface', {
      'compose.yaml':
        'services:\n  web:\n    image: nginx\n    ports:\n      - "127.0.0.1:7000:80"\n',
    });

    expect(detectCompose(dir)).toMatchObject({ expectedPort: 7000 });
  });

  it('ignores a protocol suffix', () => {
    const dir = makeFixture('compose-proto', {
      'compose.yaml': 'services:\n  web:\n    image: nginx\n    ports:\n      - "6000:80/tcp"\n',
    });

    expect(detectCompose(dir)).toMatchObject({ expectedPort: 6000 });
  });

  it('leaves expectedPort unset when several host ports are published', () => {
    const dir = makeFixture('compose-multi', {
      'compose.yaml':
        'services:\n  web:\n    image: nginx\n    ports:\n      - "8080:80"\n  db:\n    image: postgres\n    ports:\n      - "5432:5432"\n',
    });

    const result = detectCompose(dir);

    expect(result.success && result.command).toBe('docker compose up');
    expect(result.success && result.expectedPort).toBeUndefined();
  });

  it('leaves expectedPort unset when no ports are published', () => {
    const dir = makeFixture('compose-noports', {
      'compose.yaml': 'services:\n  web:\n    image: nginx\n',
    });

    const result = detectCompose(dir);

    expect(result.success && result.expectedPort).toBeUndefined();
  });

  it('leaves expectedPort unset for a bare container port', () => {
    const dir = makeFixture('compose-bare', {
      'compose.yaml': 'services:\n  web:\n    image: nginx\n    ports:\n      - "3000"\n',
    });

    const result = detectCompose(dir);

    expect(result.success && result.expectedPort).toBeUndefined();
  });

  it('leaves expectedPort unset for a port range', () => {
    const dir = makeFixture('compose-range', {
      'compose.yaml':
        'services:\n  web:\n    image: nginx\n    ports:\n      - "3000-3005:3000-3005"\n',
    });

    const result = detectCompose(dir);

    expect(result.success && result.expectedPort).toBeUndefined();
  });
});

describe('detectCompose — fall-through', () => {
  it('falls through when no compose file exists', () => {
    const dir = makeFixture('compose-none');

    expect(detectCompose(dir).success).toBe(false);
  });

  it('falls through on unparseable YAML without throwing', () => {
    const dir = makeFixture('compose-broken', {
      'compose.yaml': 'services:\n  web:\n   - ]invalid: [\n',
    });

    expect(() => detectCompose(dir)).not.toThrow();
    expect(detectCompose(dir).success).toBe(false);
  });

  it('falls through when the document declares no services', () => {
    const dir = makeFixture('compose-noservices', { 'compose.yaml': 'version: "3.9"\n' });

    expect(detectCompose(dir).success).toBe(false);
  });

  it('never reads another ecosystem manifest when no compose file exists', () => {
    const dir = makeFixture('compose-gate', {
      'package.json': 'services:\n  web:\n    image: x\n',
    });

    expect(detectCompose(dir).success).toBe(false);
  });
});
