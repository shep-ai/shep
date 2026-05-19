/**
 * registerAspm DI-Module Tests
 *
 * Phase 1 (feature 098) intentionally ships an empty registerAspm
 * skeleton — the module exists so that container.ts has a stable
 * insertion point and ASPM_TOKENS lives in one place. The test
 * asserts:
 *
 *  - invoking registerAspm() against a fresh child container does not
 *    throw (no existing token clobbers, no missing transitive deps).
 *  - container.resolve still rejects unregistered ASPM tokens, so
 *    future phases adding registrations are clearly observable.
 *  - ASPM_TOKENS exports each documented repository/service token
 *    under a stable string value (no magic literals at call sites).
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container as rootContainer } from 'tsyringe';
import Database from 'better-sqlite3';
import { registerAspm } from '@/infrastructure/di/modules/register-aspm.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import {
  ASPM_REPOSITORY_TOKENS,
  ASPM_SERVICE_TOKENS,
  ASPM_TOKENS,
} from '@/infrastructure/di/modules/aspm-tokens.js';

describe('registerAspm', () => {
  it('does not throw when invoked against a fresh child container', () => {
    const c = rootContainer.createChildContainer();
    expect(() => registerAspm(c)).not.toThrow();
  });

  it('is idempotent — calling twice still does not throw', () => {
    const c = rootContainer.createChildContainer();
    registerAspm(c);
    expect(() => registerAspm(c)).not.toThrow();
  });

  it('phase 8 overrides the phase-7 NoOp with a real SQLite repo', async () => {
    const c = rootContainer.createChildContainer();
    const db = new Database(':memory:');
    await runSQLiteMigrations(db);
    c.registerInstance('Database', db);
    registerAspm(c);
    try {
      const repo = c.resolve<{ countOpen: () => Promise<number> }>(
        ASPM_REPOSITORY_TOKENS.IAiChangeRiskSignalRepository
      );
      expect(repo).toBeDefined();
      // Empty DB → no open signals.
      expect(await repo.countOpen()).toBe(0);
    } finally {
      db.close();
    }
  });

  it('phase 9 wires the IComplianceControlRepository token', async () => {
    const c = rootContainer.createChildContainer();
    const db = new Database(':memory:');
    await runSQLiteMigrations(db);
    c.registerInstance('Database', db);
    registerAspm(c);
    try {
      const repo = c.resolve(ASPM_REPOSITORY_TOKENS.IComplianceControlRepository);
      expect(repo).toBeDefined();
    } finally {
      db.close();
    }
  });

  it('wires the phase-4 exploit-intel + SBOM ports', () => {
    const c = rootContainer.createChildContainer();
    registerAspm(c);
    expect(c.resolve(ASPM_SERVICE_TOKENS.ISbomPort)).toBeDefined();
    expect(c.resolve(ASPM_SERVICE_TOKENS.IExploitIntelPort)).toBeDefined();
  });
});

describe('ASPM_TOKENS constants', () => {
  it('exports a stable string value for every documented repository token', () => {
    expect(ASPM_REPOSITORY_TOKENS.IFindingRepository).toBe('IFindingRepository');
    expect(ASPM_REPOSITORY_TOKENS.IRiskScoreRepository).toBe('IRiskScoreRepository');
    expect(ASPM_REPOSITORY_TOKENS.IOwnerRepository).toBe('IOwnerRepository');
    expect(ASPM_REPOSITORY_TOKENS.ITeamRepository).toBe('ITeamRepository');
    expect(ASPM_REPOSITORY_TOKENS.IBusinessUnitRepository).toBe('IBusinessUnitRepository');
    expect(ASPM_REPOSITORY_TOKENS.IServiceRepository).toBe('IServiceRepository');
    expect(ASPM_REPOSITORY_TOKENS.IApiAssetRepository).toBe('IApiAssetRepository');
    expect(ASPM_REPOSITORY_TOKENS.ICloudEnvironmentRepository).toBe('ICloudEnvironmentRepository');
    expect(ASPM_REPOSITORY_TOKENS.IRemediationCampaignRepository).toBe(
      'IRemediationCampaignRepository'
    );
    expect(ASPM_REPOSITORY_TOKENS.ISecurityPolicyRepository).toBe('ISecurityPolicyRepository');
    expect(ASPM_REPOSITORY_TOKENS.IRiskExceptionRepository).toBe('IRiskExceptionRepository');
    expect(ASPM_REPOSITORY_TOKENS.IComplianceControlRepository).toBe(
      'IComplianceControlRepository'
    );
    expect(ASPM_REPOSITORY_TOKENS.IAiChangeRiskSignalRepository).toBe(
      'IAiChangeRiskSignalRepository'
    );
  });

  it('exports a stable string value for every documented service-port token', () => {
    expect(ASPM_SERVICE_TOKENS.IFindingIngestPort).toBe('IFindingIngestPort');
    expect(ASPM_SERVICE_TOKENS.ISbomPort).toBe('ISbomPort');
    expect(ASPM_SERVICE_TOKENS.IExploitIntelPort).toBe('IExploitIntelPort');
    expect(ASPM_SERVICE_TOKENS.ISlaClockPort).toBe('ISlaClockPort');
    expect(ASPM_SERVICE_TOKENS.IOwnershipYamlReader).toBe('IOwnershipYamlReader');
  });

  it('union ASPM_TOKENS contains every repository and service token', () => {
    for (const [name, value] of Object.entries(ASPM_REPOSITORY_TOKENS)) {
      expect(ASPM_TOKENS[name as keyof typeof ASPM_TOKENS]).toBe(value);
    }
    for (const [name, value] of Object.entries(ASPM_SERVICE_TOKENS)) {
      expect(ASPM_TOKENS[name as keyof typeof ASPM_TOKENS]).toBe(value);
    }
  });
});
