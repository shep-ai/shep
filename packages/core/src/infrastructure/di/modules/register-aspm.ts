/**
 * ASPM (Application Security Posture Management) registrations.
 *
 * Feature 098. Invoked from `container.ts` after the existing `register-*`
 * modules and after migrations run. Each phase adds bindings in this file
 * in dependency order so the DI graph mirrors the layered architecture.
 *
 * Phase 2 (Asset & Ownership Model) registers:
 *
 *   Repositories — Owner / Team / BusinessUnit / Service / ApiAsset /
 *                  CloudEnvironment
 *   Services     — IOwnershipYamlReader
 *   Use cases    — ListOwners / AssignOwner / ImportOwnershipYaml /
 *                  ResolveOwnershipForFinding
 *
 * Tokens live in `./aspm-tokens.ts` — never inline string literals at the
 * call site (.claude/rules/code-quality.md — No Magic Values).
 */
import type Database from 'better-sqlite3';
import type { DependencyContainer } from 'tsyringe';

import { ASPM_TOKENS } from './aspm-tokens.js';

// Repository ports
import type { IApiAssetRepository } from '../../../application/ports/output/repositories/api-asset-repository.interface.js';
import type { IBusinessUnitRepository } from '../../../application/ports/output/repositories/business-unit-repository.interface.js';
import type { ICloudEnvironmentRepository } from '../../../application/ports/output/repositories/cloud-environment-repository.interface.js';
import type { IOwnerRepository } from '../../../application/ports/output/repositories/owner-repository.interface.js';
import type { IServiceRepository } from '../../../application/ports/output/repositories/service-repository.interface.js';
import type { ITeamRepository } from '../../../application/ports/output/repositories/team-repository.interface.js';

// Service ports
import type { IOwnershipYamlReader } from '../../../application/ports/output/services/ownership-yaml-reader.interface.js';

// Concrete repositories
import { SQLiteApiAssetRepository } from '../../repositories/aspm/sqlite-api-asset-repository.js';
import { SQLiteBusinessUnitRepository } from '../../repositories/aspm/sqlite-business-unit-repository.js';
import { SQLiteCloudEnvironmentRepository } from '../../repositories/aspm/sqlite-cloud-environment-repository.js';
import { SQLiteOwnerRepository } from '../../repositories/aspm/sqlite-owner-repository.js';
import { SQLiteServiceRepository } from '../../repositories/aspm/sqlite-service-repository.js';
import { SQLiteTeamRepository } from '../../repositories/aspm/sqlite-team-repository.js';

// Concrete services
import { OwnershipYamlReader } from '../../services/aspm/ownership-yaml-reader.js';

// Use cases
import { AssignOwnerUseCase } from '../../../application/use-cases/aspm/ownership/assign-owner.js';
import { ImportOwnershipYamlUseCase } from '../../../application/use-cases/aspm/ownership/import-ownership-yaml.js';
import { ListOwnersUseCase } from '../../../application/use-cases/aspm/ownership/list-owners.js';
import { ResolveOwnershipForFindingUseCase } from '../../../application/use-cases/aspm/ownership/resolve-ownership-for-finding.js';

/**
 * Register ASPM repositories, ports, services, and use cases on the
 * tsyringe container. Touching this file is MANDATORY when adding any
 * ASPM infrastructure binding.
 */
export function registerAspm(container: DependencyContainer): void {
  // Phase 2 — Asset & Ownership Model
  registerPhase2Repositories(container);
  registerPhase2Services(container);
  registerPhase2UseCases(container);

  // Phases 3-10 attach below as they land:
  //
  //   - Phase 3: SecurityFinding repository + IFindingIngestPort (SARIF).
  //   - Phase 4: ISbomPort (CycloneDX) + IExploitIntelPort (KEV+EPSS).
  //   - Phase 5: RiskScore repository + scoring use cases.
  //   - Phase 6: SecurityPolicy / RemediationCampaign / RiskException
  //              + ISlaClockPort.
  //   - Phase 7: Posture/trend/application-posture + finding→work-item
  //              use cases + SSE wiring.
  //   - Phase 8: AiChangeRiskSignal repository + AI-review use cases.
  //   - Phase 9: ComplianceControl repository + coverage use case.
  //   - Phase 10: CLI + final web wiring (no new container bindings).

  // Keep the token import live so future maintainers can `Cmd-Click` into
  // `aspm-tokens.ts` from this module — and so a typo in token names
  // surfaces here, not in a far-away use case constructor.
  void ASPM_TOKENS;
}

function registerPhase2Repositories(container: DependencyContainer): void {
  container.register<IOwnerRepository>(ASPM_TOKENS.IOwnerRepository, {
    useFactory: (c) => new SQLiteOwnerRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ITeamRepository>(ASPM_TOKENS.ITeamRepository, {
    useFactory: (c) => new SQLiteTeamRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IBusinessUnitRepository>(ASPM_TOKENS.IBusinessUnitRepository, {
    useFactory: (c) => new SQLiteBusinessUnitRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IServiceRepository>(ASPM_TOKENS.IServiceRepository, {
    useFactory: (c) => new SQLiteServiceRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IApiAssetRepository>(ASPM_TOKENS.IApiAssetRepository, {
    useFactory: (c) => new SQLiteApiAssetRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ICloudEnvironmentRepository>(ASPM_TOKENS.ICloudEnvironmentRepository, {
    useFactory: (c) =>
      new SQLiteCloudEnvironmentRepository(c.resolve<Database.Database>('Database')),
  });
}

function registerPhase2Services(container: DependencyContainer): void {
  container.register<IOwnershipYamlReader>(ASPM_TOKENS.IOwnershipYamlReader, {
    useClass: OwnershipYamlReader,
  });
}

function registerPhase2UseCases(container: DependencyContainer): void {
  container.register(ListOwnersUseCase, { useClass: ListOwnersUseCase });
  container.register(AssignOwnerUseCase, { useClass: AssignOwnerUseCase });
  container.register(ImportOwnershipYamlUseCase, { useClass: ImportOwnershipYamlUseCase });
  container.register(ResolveOwnershipForFindingUseCase, {
    useClass: ResolveOwnershipForFindingUseCase,
  });
}
