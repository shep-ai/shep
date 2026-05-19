/**
 * Bedrock TypeSpec — Value Object Tests
 *
 * Verifies the generated bedrock types from TypeSpec expose the
 * lifecycle action enum, per-tier status object, aggregate health
 * report, and the bedrockEnabled field on Application. These are the
 * typed-end-to-end value objects consumed by the bedrock use cases,
 * the CLI command group, and the web action.
 */

import { describe, it, expect } from 'vitest';
import {
  BedrockLifecycleAction,
  type BedrockHealth,
  type BedrockTierStatus,
  type Application,
} from '@/domain/generated/output.js';

describe('BedrockLifecycleAction enum', () => {
  it('exposes init, sync, and ship as literal-string values', () => {
    expect(BedrockLifecycleAction.Init).toBe('init');
    expect(BedrockLifecycleAction.Sync).toBe('sync');
    expect(BedrockLifecycleAction.Ship).toBe('ship');
  });

  it('contains exactly three actions (no doctor — that has its own return shape)', () => {
    const values = Object.values(BedrockLifecycleAction);
    expect(values).toHaveLength(3);
    expect(new Set(values)).toEqual(new Set(['init', 'sync', 'ship']));
  });
});

describe('BedrockTierStatus value object', () => {
  it('accepts an ok status with optional detail', () => {
    const tier: BedrockTierStatus = {
      tier: 'python',
      status: 'ok',
      detail: 'Python 3.11.4',
    };

    expect(tier.tier).toBe('python');
    expect(tier.status).toBe('ok');
    expect(tier.detail).toBe('Python 3.11.4');
    expect(tier.remediation).toBeUndefined();
  });

  it('accepts a missing status with a remediation hint', () => {
    const tier: BedrockTierStatus = {
      tier: 'pipx',
      status: 'missing',
      remediation: 'brew install pipx',
    };

    expect(tier.status).toBe('missing');
    expect(tier.remediation).toBe('brew install pipx');
  });

  it('accepts an error status', () => {
    const tier: BedrockTierStatus = {
      tier: 'bedrock',
      status: 'error',
      detail: 'spawn ENOENT',
    };

    expect(tier.status).toBe('error');
  });
});

describe('BedrockHealth aggregate', () => {
  it('rolls up three tiers and an overall status', () => {
    const health: BedrockHealth = {
      python: { tier: 'python', status: 'ok' },
      pipx: { tier: 'pipx', status: 'ok' },
      bedrock: { tier: 'bedrock', status: 'ok' },
      overall: 'ok',
    };

    expect(health.overall).toBe('ok');
    expect(health.python.status).toBe('ok');
    expect(health.pipx.status).toBe('ok');
    expect(health.bedrock.status).toBe('ok');
  });

  it('represents a degraded chain (missing bedrock binary)', () => {
    const health: BedrockHealth = {
      python: { tier: 'python', status: 'ok', detail: 'Python 3.12.1' },
      pipx: { tier: 'pipx', status: 'ok' },
      bedrock: {
        tier: 'bedrock',
        status: 'missing',
        remediation: 'pipx install project-bedrock',
      },
      overall: 'missing',
    };

    expect(health.overall).toBe('missing');
    expect(health.bedrock.status).toBe('missing');
  });
});

describe('Application.bedrockEnabled field', () => {
  it('exposes bedrockEnabled as a boolean', () => {
    const partial: Pick<Application, 'bedrockEnabled'> = {
      bedrockEnabled: false,
    };

    expect(partial.bedrockEnabled).toBe(false);

    const enabled: Pick<Application, 'bedrockEnabled'> = {
      bedrockEnabled: true,
    };

    expect(enabled.bedrockEnabled).toBe(true);
  });
});
