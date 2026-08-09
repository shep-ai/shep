// @vitest-environment node

/**
 * extractExplicitPort Unit Tests
 *
 * `expectedPort` feeds the verify node's TCP fallback, where the failure
 * modes are asymmetric: an unset port degrades safely to log parsing, while
 * a WRONG port manufactures a readiness failure on a server that started
 * perfectly and can escalate into a remediation agent editing working code.
 *
 * So the bar is "the author wrote this port down", not "this port is
 * probably right" — every ambiguous form below must return undefined.
 */

import { describe, it, expect } from 'vitest';
import {
  extractExplicitPort,
  FRAMEWORK_DEFAULT_PORTS,
  PORT_MIN,
  PORT_MAX,
} from '@/infrastructure/services/deployment/detectors/shared/command-port.js';

describe('extractExplicitPort — explicit forms', () => {
  it('extracts a space-separated --port', () => {
    expect(extractExplicitPort('npm run dev -- --port 8080')).toBe(8080);
  });

  it('extracts an equals-separated --port', () => {
    expect(extractExplicitPort('vite --port=5173')).toBe(5173);
  });

  it('extracts a space-separated -p', () => {
    expect(extractExplicitPort('bin/rails server -p 4001')).toBe(4001);
  });

  it('takes the first explicit port when several appear', () => {
    expect(extractExplicitPort('sh -c "svc --port 3000 && other --port 4000"')).toBe(3000);
  });

  it('accepts the boundary ports', () => {
    expect(extractExplicitPort(`svc --port ${PORT_MIN}`)).toBe(PORT_MIN);
    expect(extractExplicitPort(`svc --port ${PORT_MAX}`)).toBe(PORT_MAX);
  });
});

describe('extractExplicitPort — ambiguous or absent forms return undefined', () => {
  it('returns undefined when the command carries no port token', () => {
    expect(extractExplicitPort('npm run dev')).toBeUndefined();
    expect(extractExplicitPort('docker compose up')).toBeUndefined();
    expect(extractExplicitPort('')).toBeUndefined();
  });

  it('returns undefined for a trailing flag with no value', () => {
    expect(extractExplicitPort('svc --port')).toBeUndefined();
    expect(extractExplicitPort('svc -p')).toBeUndefined();
  });

  it('returns undefined for a non-numeric value', () => {
    expect(extractExplicitPort('svc --port abc')).toBeUndefined();
    expect(extractExplicitPort('svc --port=$PORT')).toBeUndefined();
    expect(extractExplicitPort('svc -p my-project')).toBeUndefined();
  });

  it('returns undefined for a value outside 1–65535', () => {
    expect(extractExplicitPort('svc --port 0')).toBeUndefined();
    expect(extractExplicitPort('svc --port 65536')).toBeUndefined();
    expect(extractExplicitPort('svc --port -1')).toBeUndefined();
  });

  it('does not treat a flag that merely starts with --port as a port flag', () => {
    expect(extractExplicitPort('svc --ports 8080')).toBeUndefined();
    expect(extractExplicitPort('svc --port-file /tmp/p')).toBeUndefined();
  });
});

describe('FRAMEWORK_DEFAULT_PORTS', () => {
  it('exposes the three single-valued framework defaults as named constants', () => {
    expect(FRAMEWORK_DEFAULT_PORTS.Rails).toBe(3000);
    expect(FRAMEWORK_DEFAULT_PORTS.Phoenix).toBe(4000);
    expect(FRAMEWORK_DEFAULT_PORTS.Django).toBe(8000);
  });

  it('covers exactly the three positively-identifiable frameworks', () => {
    expect(Object.keys(FRAMEWORK_DEFAULT_PORTS)).toEqual(['Rails', 'Phoenix', 'Django']);
  });
});
