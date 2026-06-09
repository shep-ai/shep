/**
 * Supply-chain security registrations (spec 083).
 *
 * Invoked from `container.ts` after migrations run.
 * Registers the policy engine, security event repository,
 * evaluators, and the four supply-chain security use cases.
 */
import type Database from 'better-sqlite3';
import type { DependencyContainer } from 'tsyringe';

import type { ISecurityPolicyService } from '../../../application/ports/output/services/security-policy-service.interface.js';
import type { ISecurityEventRepository } from '../../../application/ports/output/repositories/security-event.repository.interface.js';
import type { ISettingsRepository } from '../../../application/ports/output/repositories/settings.repository.interface.js';
import type { IGitHubRepositoryService } from '../../../application/ports/output/services/github-repository-service.interface.js';
import type { IDependencyRiskEvaluator } from '../../../application/ports/output/services/dependency-risk-evaluator.interface.js';
import type { IReleaseIntegrityEvaluator } from '../../../application/ports/output/services/release-integrity-evaluator.interface.js';

import { SecurityPolicyService } from '../../services/security/security-policy.service.js';
import { SecurityPolicyFileReader } from '../../services/security/security-policy-file-reader.js';
import { SecurityPolicyValidator } from '../../services/security/security-policy-validator.js';
import { SQLiteSecurityEventRepository } from '../../repositories/sqlite-security-event.repository.js';
import { DependencyRiskEvaluator } from '../../services/security/dependency-risk-evaluator.js';
import { ReleaseIntegrityEvaluator } from '../../services/security/release-integrity-evaluator.js';

import { EnforceSecurityUseCase } from '../../../application/use-cases/security/enforce-security.use-case.js';
import { EvaluateSecurityPolicyUseCase } from '../../../application/use-cases/security/evaluate-security-policy.use-case.js';
import { GetSecurityStateUseCase } from '../../../application/use-cases/security/get-security-state.use-case.js';
import { RecordSecurityEventUseCase } from '../../../application/use-cases/security/record-security-event.use-case.js';

export function registerSecurity(c: DependencyContainer): void {
  // ─── Infrastructure ────────────────────────────────────────────────────────
  c.register('SecurityPolicyFileReader', {
    useFactory: () => new SecurityPolicyFileReader(),
  });

  c.register('SecurityPolicyValidator', {
    useFactory: () => new SecurityPolicyValidator(),
  });

  c.register<ISecurityPolicyService>('ISecurityPolicyService', {
    useFactory: (container) => {
      const fileReader = container.resolve<SecurityPolicyFileReader>('SecurityPolicyFileReader');
      const validator = container.resolve<SecurityPolicyValidator>('SecurityPolicyValidator');
      const settingsRepo = container.resolve<ISettingsRepository>('ISettingsRepository');
      return new SecurityPolicyService(fileReader, validator, settingsRepo);
    },
  });

  c.register<ISecurityEventRepository>('ISecurityEventRepository', {
    useFactory: (container) => {
      const database = container.resolve<Database.Database>('Database');
      return new SQLiteSecurityEventRepository(database);
    },
  });

  c.register<IDependencyRiskEvaluator>('IDependencyRiskEvaluator', {
    useFactory: () => new DependencyRiskEvaluator(),
  });

  c.register<IReleaseIntegrityEvaluator>('IReleaseIntegrityEvaluator', {
    useFactory: () => new ReleaseIntegrityEvaluator(),
  });

  // ─── Use cases ─────────────────────────────────────────────────────────────
  c.register(EnforceSecurityUseCase, {
    useFactory: (container) =>
      new EnforceSecurityUseCase(
        container.resolve<ISecurityPolicyService>('ISecurityPolicyService'),
        container.resolve<ISecurityEventRepository>('ISecurityEventRepository'),
        container.resolve<ISettingsRepository>('ISettingsRepository'),
        container.resolve<IDependencyRiskEvaluator>('IDependencyRiskEvaluator'),
        container.resolve<IReleaseIntegrityEvaluator>('IReleaseIntegrityEvaluator'),
        container.resolve<IGitHubRepositoryService>('IGitHubRepositoryService')
      ),
  });

  c.register(EvaluateSecurityPolicyUseCase, {
    useFactory: (container) =>
      new EvaluateSecurityPolicyUseCase(
        container.resolve<ISecurityPolicyService>('ISecurityPolicyService'),
        container.resolve<ISettingsRepository>('ISettingsRepository')
      ),
  });

  c.register(GetSecurityStateUseCase, {
    useFactory: (container) =>
      new GetSecurityStateUseCase(
        container.resolve<ISecurityEventRepository>('ISecurityEventRepository'),
        container.resolve<ISettingsRepository>('ISettingsRepository')
      ),
  });

  c.register(RecordSecurityEventUseCase, {
    useFactory: (container) =>
      new RecordSecurityEventUseCase(
        container.resolve<ISecurityEventRepository>('ISecurityEventRepository')
      ),
  });

  // ─── String-token aliases (for web route resolvers) ─────────────────────
  c.register('GetSecurityStateUseCase', {
    useFactory: (container) => container.resolve(GetSecurityStateUseCase),
  });

  c.register('EnforceSecurityUseCase', {
    useFactory: (container) => container.resolve(EnforceSecurityUseCase),
  });
}
