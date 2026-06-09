/**
 * EnforceSecurityUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock child_process.execFile used by runGovernanceAudit to resolve git remote
vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: object,
      cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void
    ) => {
      cb(null, { stdout: 'https://github.com/test/repo.git\n', stderr: '' });
    }
  ),
}));

import { EnforceSecurityUseCase } from '@/application/use-cases/security/enforce-security.use-case.js';
import {
  SecurityMode,
  SecurityActionDisposition,
  SecuritySeverity,
  SecurityActionCategory,
  DependencyRiskType,
  ReleaseIntegrityCheckType,
} from '@/domain/generated/output.js';
import type {
  EffectivePolicySnapshot,
  DependencyFinding,
  ReleaseIntegrityResult,
  Settings,
} from '@/domain/generated/output.js';
import type { ISecurityPolicyService } from '@/application/ports/output/services/security-policy-service.interface.js';
import type { ISecurityEventRepository } from '@/application/ports/output/repositories/security-event.repository.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { DependencyRiskEvaluator } from '@/infrastructure/services/security/dependency-risk-evaluator.js';
import type { ReleaseIntegrityEvaluator } from '@/infrastructure/services/security/release-integrity-evaluator.js';
import {
  GovernanceFindingCategory,
  type IGitHubRepositoryService,
} from '@/application/ports/output/services/github-repository-service.interface.js';

function createMockPolicy(mode: SecurityMode): EffectivePolicySnapshot {
  return {
    mode,
    source: 'shep.security.yaml',
    evaluatedAt: new Date().toISOString(),
    actionDispositions: Object.values(SecurityActionCategory).map((category) => ({
      category,
      disposition: SecurityActionDisposition.Allowed,
    })),
  };
}

function createMockPolicyService(): ISecurityPolicyService {
  return {
    evaluatePolicy: vi.fn(),
    getEffectivePolicy: vi.fn(),
    validatePolicyFile: vi.fn(),
    getActionDisposition: vi.fn(),
  };
}

function createMockEventRepo(): ISecurityEventRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findByRepository: vi.fn().mockResolvedValue([]),
    findByFeature: vi.fn().mockResolvedValue([]),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
    count: vi.fn().mockResolvedValue(0),
  };
}

function createMockSettingsRepo(): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({
      id: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      security: { mode: SecurityMode.Advisory },
    } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDepEvaluator(): DependencyRiskEvaluator {
  return {
    evaluate: vi.fn().mockReturnValue([]),
  } as unknown as DependencyRiskEvaluator;
}

function createMockReleaseEvaluator(): ReleaseIntegrityEvaluator {
  return {
    evaluate: vi.fn().mockReturnValue({ checks: [], passed: true }),
  } as unknown as ReleaseIntegrityEvaluator;
}

function createMockGitHubService(): IGitHubRepositoryService {
  return {
    checkAuth: vi.fn().mockResolvedValue(undefined),
    cloneRepository: vi.fn().mockResolvedValue(undefined),
    listUserRepositories: vi.fn().mockResolvedValue([]),
    listOrganizations: vi.fn().mockResolvedValue([]),
    parseGitHubUrl: vi
      .fn()
      .mockReturnValue({ owner: 'test', repo: 'repo', nameWithOwner: 'test/repo' }),
    getViewerPermission: vi.fn().mockResolvedValue('ADMIN'),
    getAuthenticatedUser: vi.fn().mockResolvedValue('test'),
    checkPushAccess: vi.fn().mockResolvedValue({ hasPushAccess: true, viewerLogin: 'test' }),
    forkRepository: vi
      .fn()
      .mockResolvedValue({ nameWithOwner: 'test/repo', alreadyExisted: false }),
    auditRepositoryGovernance: vi.fn().mockResolvedValue([]),
  };
}

describe('EnforceSecurityUseCase', () => {
  let useCase: EnforceSecurityUseCase;
  let policyService: ISecurityPolicyService;
  let eventRepo: ISecurityEventRepository;
  let settingsRepo: ISettingsRepository;
  let depEvaluator: DependencyRiskEvaluator;
  let releaseEvaluator: ReleaseIntegrityEvaluator;
  let githubService: IGitHubRepositoryService;

  beforeEach(() => {
    policyService = createMockPolicyService();
    eventRepo = createMockEventRepo();
    settingsRepo = createMockSettingsRepo();
    depEvaluator = createMockDepEvaluator();
    releaseEvaluator = createMockReleaseEvaluator();
    githubService = createMockGitHubService();

    useCase = new EnforceSecurityUseCase(
      policyService,
      eventRepo,
      settingsRepo,
      depEvaluator,
      releaseEvaluator,
      githubService
    );
  });

  it('should return empty pass result when mode is Disabled', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Disabled)
    );

    const result = await useCase.execute({ repositoryPath: '/repo' });

    expect(result.passed).toBe(true);
    expect(result.mode).toBe(SecurityMode.Disabled);
    expect(result.dependencyFindings).toHaveLength(0);
    expect(result.releaseIntegrity.checks).toHaveLength(0);
    expect(result.totalFindings).toBe(0);
    // Should not call evaluators
    expect(depEvaluator.evaluate).not.toHaveBeenCalled();
    expect(releaseEvaluator.evaluate).not.toHaveBeenCalled();
  });

  it('should return pass status with findings in Advisory mode', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Advisory)
    );

    const depFindings: DependencyFinding[] = [
      {
        packageName: 'evil',
        severity: SecuritySeverity.Critical,
        riskType: DependencyRiskType.DenylistViolation,
        message: 'Denylisted package',
      },
    ];
    vi.mocked(depEvaluator.evaluate).mockReturnValue(depFindings);

    const result = await useCase.execute({ repositoryPath: '/repo' });

    expect(result.passed).toBe(true); // Advisory always passes
    expect(result.mode).toBe(SecurityMode.Advisory);
    expect(result.dependencyFindings).toHaveLength(1);
    expect(result.totalFindings).toBe(1);
  });

  it('should return fail status with findings in Enforce mode', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Enforce)
    );

    const depFindings: DependencyFinding[] = [
      {
        packageName: 'evil',
        severity: SecuritySeverity.Critical,
        riskType: DependencyRiskType.DenylistViolation,
        message: 'Denylisted package',
      },
    ];
    vi.mocked(depEvaluator.evaluate).mockReturnValue(depFindings);

    const result = await useCase.execute({ repositoryPath: '/repo' });

    expect(result.passed).toBe(false); // Enforce fails on violations
    expect(result.mode).toBe(SecurityMode.Enforce);
    expect(result.totalFindings).toBe(1);
  });

  it('should pass in Enforce mode when no findings exist', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Enforce)
    );

    const result = await useCase.execute({ repositoryPath: '/repo' });

    expect(result.passed).toBe(true);
    expect(result.mode).toBe(SecurityMode.Enforce);
    expect(result.totalFindings).toBe(0);
  });

  it('should persist security events for dependency findings', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Advisory)
    );

    const depFindings: DependencyFinding[] = [
      {
        packageName: 'bad-pkg',
        severity: SecuritySeverity.High,
        riskType: DependencyRiskType.LockfileInconsistency,
        message: 'No lockfile',
        remediation: 'Run pnpm install',
      },
    ];
    vi.mocked(depEvaluator.evaluate).mockReturnValue(depFindings);

    await useCase.execute({ repositoryPath: '/repo' });

    expect(eventRepo.save).toHaveBeenCalledTimes(1);
    const savedEvent = vi.mocked(eventRepo.save).mock.calls[0][0];
    expect(savedEvent.repositoryPath).toBe('/repo');
    expect(savedEvent.severity).toBe(SecuritySeverity.High);
    expect(savedEvent.category).toBe(SecurityActionCategory.DependencyInstall);
  });

  it('should persist security events for failed release checks', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Advisory)
    );

    const releaseResult: ReleaseIntegrityResult = {
      checks: [
        {
          checkType: ReleaseIntegrityCheckType.CiOnlyPublishing,
          passed: false,
          message: 'No CI workflow',
          severity: SecuritySeverity.Critical,
        },
        {
          checkType: ReleaseIntegrityCheckType.WorkflowIntegrity,
          passed: true,
          message: 'OK',
          severity: SecuritySeverity.Medium,
        },
      ],
      passed: false,
    };
    vi.mocked(releaseEvaluator.evaluate).mockReturnValue(releaseResult);

    await useCase.execute({ repositoryPath: '/repo' });

    // Only the failed check should be saved
    expect(eventRepo.save).toHaveBeenCalledTimes(1);
    const savedEvent = vi.mocked(eventRepo.save).mock.calls[0][0];
    expect(savedEvent.category).toBe(SecurityActionCategory.PublishRelease);
    expect(savedEvent.severity).toBe(SecuritySeverity.Critical);
  });

  it('should update settings with evaluation timestamp', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Advisory)
    );

    await useCase.execute({ repositoryPath: '/repo' });

    expect(settingsRepo.update).toHaveBeenCalledTimes(1);
    const updatedSettings = vi.mocked(settingsRepo.update).mock.calls[0][0];
    expect(updatedSettings.security?.lastEvaluationAt).toBeDefined();
    expect(updatedSettings.security?.policySource).toBe('shep.security.yaml');
  });

  it('should include governance findings in result', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Advisory)
    );

    const govFindings = [
      {
        category: GovernanceFindingCategory.BranchProtection,
        severity: 'High' as const,
        message: 'No branch protection on main',
        remediation: 'Enable branch protection',
      },
    ];
    vi.mocked(githubService.auditRepositoryGovernance).mockResolvedValue(govFindings);

    const result = await useCase.execute({ repositoryPath: '/repo' });

    expect(result.governanceFindings).toHaveLength(1);
    expect(result.governanceFindings[0].category).toBe('BranchProtection');
  });

  it('should not cause overall failure from governance findings in Enforce mode', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Enforce)
    );

    // No dependency or release findings — only governance
    const govFindings = [
      {
        category: GovernanceFindingCategory.BranchProtection,
        severity: 'High' as const,
        message: 'No branch protection on main',
        remediation: 'Enable branch protection',
      },
      {
        category: GovernanceFindingCategory.Codeowners,
        severity: 'Medium' as const,
        message: 'No CODEOWNERS file',
        remediation: 'Add CODEOWNERS',
      },
    ];
    vi.mocked(githubService.auditRepositoryGovernance).mockResolvedValue(govFindings);

    const result = await useCase.execute({ repositoryPath: '/repo' });

    // Governance findings are audit-only — they should NOT cause failure
    expect(result.passed).toBe(true);
    expect(result.totalFindings).toBe(0); // totalFindings excludes governance
    expect(result.governanceFindings).toHaveLength(2);
  });

  it('should persist governance findings as security events', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Advisory)
    );

    const govFindings = [
      {
        category: GovernanceFindingCategory.Codeowners,
        severity: 'Medium' as const,
        message: 'No CODEOWNERS file',
        remediation: 'Add CODEOWNERS',
      },
    ];
    vi.mocked(githubService.auditRepositoryGovernance).mockResolvedValue(govFindings);

    await useCase.execute({ repositoryPath: '/repo' });

    expect(eventRepo.save).toHaveBeenCalledTimes(1);
    const savedEvent = vi.mocked(eventRepo.save).mock.calls[0][0];
    expect(savedEvent.message).toContain('Governance Audit');
    expect(savedEvent.message).toContain('CODEOWNERS');
  });

  it('should return empty governance findings when git remote fails', async () => {
    vi.mocked(policyService.evaluatePolicy).mockResolvedValue(
      createMockPolicy(SecurityMode.Advisory)
    );

    // Simulate git remote failure by making execFile reject
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: object,
      cb: (err: Error | null) => void
    ) => {
      cb(new Error('not a git repository'));
    }) as typeof execFile);

    const result = await useCase.execute({ repositoryPath: '/repo' });

    // Should gracefully return empty governance findings
    expect(result.governanceFindings).toHaveLength(0);
    // auditRepositoryGovernance should not have been called
    expect(githubService.auditRepositoryGovernance).not.toHaveBeenCalled();
  });
});
