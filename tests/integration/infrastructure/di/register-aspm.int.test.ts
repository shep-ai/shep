/**
 * register-aspm DI integration test (feature 098, phase 2).
 *
 * Verifies every ASPM token added in phase 2 resolves out of the
 * tsyringe container and that the four ownership use cases can be
 * constructed end-to-end (catches a missing @inject binding before it
 * blows up a CLI command or web route in production).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerAspm } from '@/infrastructure/di/modules/register-aspm.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { ASPM_TOKENS } from '@/infrastructure/di/modules/aspm-tokens.js';

import { AssignOwnerUseCase } from '@/application/use-cases/aspm/ownership/assign-owner.js';
import { ImportOwnershipYamlUseCase } from '@/application/use-cases/aspm/ownership/import-ownership-yaml.js';
import { ListOwnersUseCase } from '@/application/use-cases/aspm/ownership/list-owners.js';
import { ResolveOwnershipForFindingUseCase } from '@/application/use-cases/aspm/ownership/resolve-ownership-for-finding.js';

const PHASE_2_TOKENS = [
  ASPM_TOKENS.IOwnerRepository,
  ASPM_TOKENS.ITeamRepository,
  ASPM_TOKENS.IBusinessUnitRepository,
  ASPM_TOKENS.IServiceRepository,
  ASPM_TOKENS.IApiAssetRepository,
  ASPM_TOKENS.ICloudEnvironmentRepository,
  ASPM_TOKENS.IOwnershipYamlReader,
] as const;

const PHASE_3_TOKENS = [ASPM_TOKENS.IFindingRepository] as const;

const PHASE_6_TOKENS = [
  ASPM_TOKENS.ISecurityPolicyRepository,
  ASPM_TOKENS.ISlaClockPort,
  ASPM_TOKENS.IRiskExceptionRepository,
  ASPM_TOKENS.IRemediationCampaignRepository,
] as const;

describe('registerAspm — phase 2 wiring', () => {
  let container: DependencyContainer;
  let db: Database.Database;

  beforeEach(async () => {
    container = rootContainer.createChildContainer();
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    container.registerInstance<Database.Database>('Database', db);
    registerRepositories(container);
    registerAspm(container);
  });

  afterEach(() => {
    container.dispose();
    db.close();
  });

  it.each(PHASE_2_TOKENS)('resolves the %s token', (token) => {
    expect(container.resolve(token)).not.toBeNull();
  });

  it.each(PHASE_3_TOKENS)('resolves the %s token', (token) => {
    expect(container.resolve(token)).not.toBeNull();
  });

  it.each(PHASE_6_TOKENS)('resolves the %s token', (token) => {
    expect(container.resolve(token)).not.toBeNull();
  });

  it('resolves ListOwnersUseCase', () => {
    const uc = container.resolve(ListOwnersUseCase);
    expect(uc).toBeInstanceOf(ListOwnersUseCase);
  });

  it('resolves AssignOwnerUseCase', () => {
    const uc = container.resolve(AssignOwnerUseCase);
    expect(uc).toBeInstanceOf(AssignOwnerUseCase);
  });

  it('resolves ImportOwnershipYamlUseCase', () => {
    const uc = container.resolve(ImportOwnershipYamlUseCase);
    expect(uc).toBeInstanceOf(ImportOwnershipYamlUseCase);
  });

  it('resolves ResolveOwnershipForFindingUseCase', () => {
    const uc = container.resolve(ResolveOwnershipForFindingUseCase);
    expect(uc).toBeInstanceOf(ResolveOwnershipForFindingUseCase);
  });

  it('ListOwnersUseCase against the resolved repository starts with zero owners', async () => {
    const uc = container.resolve(ListOwnersUseCase);
    const owners = await uc.execute();
    expect(owners).toEqual([]);
  });
});
