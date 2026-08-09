/**
 * DevServerRunPlan / RunPlanSource / DeploymentState Generated Types Tests
 *
 * Verifies the TypeSpec-generated types for spec 103 (agentic-dev-server):
 * - RunPlanSource enum members map to their exact string values
 * - DeploymentState gains the additive Analyzing and Installing members
 *   while keeping the existing Booting/Ready/Stopped values unchanged
 * - DevServerRunPlan model exists and a full fixture literal compiles
 */

import { describe, it, expect } from 'vitest';
import type { DevServerRunPlan } from '@/domain/generated/output.js';
import { RunPlanSource, DeploymentState } from '@/domain/generated/output.js';

describe('RunPlanSource enum', () => {
  it('should have exactly 3 values', () => {
    expect(Object.values(RunPlanSource)).toHaveLength(3);
  });

  it('should map Deterministic to "Deterministic"', () => {
    expect(RunPlanSource.Deterministic).toBe('Deterministic');
  });

  it('should map Agent to "Agent"', () => {
    expect(RunPlanSource.Agent).toBe('Agent');
  });

  it('should map Manual to "Manual" (spec 108 user-authored override)', () => {
    expect(RunPlanSource.Manual).toBe('Manual');
  });
});

describe('DeploymentState enum (spec 103 additive members)', () => {
  it('should map Analyzing to "Analyzing"', () => {
    expect(DeploymentState.Analyzing).toBe('Analyzing');
  });

  it('should map Installing to "Installing"', () => {
    expect(DeploymentState.Installing).toBe('Installing');
  });

  it('should keep the existing members with unchanged string values', () => {
    expect(DeploymentState.Booting).toBe('Booting');
    expect(DeploymentState.Ready).toBe('Ready');
    expect(DeploymentState.Stopped).toBe('Stopped');
  });

  it('should have exactly 5 values', () => {
    expect(Object.values(DeploymentState)).toHaveLength(5);
  });
});

describe('DevServerRunPlan model', () => {
  it('should compile a full fixture literal with every field', () => {
    const plan: DevServerRunPlan = {
      repoPath: '/home/user/example-repo',
      source: RunPlanSource.Agent,
      command: 'pnpm dev',
      cwd: '/home/user/example-repo/apps/web',
      packageManager: 'pnpm',
      expectedPort: 3000,
      language: 'TypeScript',
      framework: 'Next.js',
      setupCommands: ['corepack enable pnpm', 'pnpm exec playwright install'],
      configHash: 'abc123def456',
      installStampHash: 'lockhash789',
      createdAt: new Date('2026-07-04T10:00:00Z'),
      updatedAt: new Date('2026-07-04T11:00:00Z'),
    };

    expect(plan.repoPath).toBe('/home/user/example-repo');
    expect(plan.source).toBe(RunPlanSource.Agent);
    expect(plan.setupCommands).toHaveLength(2);
  });

  it('should compile a minimal fixture literal without optional fields', () => {
    const plan: DevServerRunPlan = {
      repoPath: '/home/user/other-repo',
      source: RunPlanSource.Deterministic,
      command: 'npm run dev',
      cwd: '/home/user/other-repo',
      setupCommands: [],
      configHash: 'hash-only-required',
      createdAt: new Date('2026-07-04T10:00:00Z'),
      updatedAt: new Date('2026-07-04T10:00:00Z'),
    };

    expect(plan.packageManager).toBeUndefined();
    expect(plan.expectedPort).toBeUndefined();
    expect(plan.language).toBeUndefined();
    expect(plan.framework).toBeUndefined();
    expect(plan.installStampHash).toBeUndefined();
  });
});
