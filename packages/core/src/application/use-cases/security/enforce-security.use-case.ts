/**
 * Enforce Security Use Case
 *
 * Orchestrates the full security enforcement flow:
 * 1. Evaluate effective policy
 * 2. Run dependency-risk checks
 * 3. Run release-integrity checks
 * 4. Persist findings as security events
 * 5. Return structured enforcement result
 *
 * Supports Advisory (always pass) and Enforce (fail on violations) modes.
 * Disabled mode returns empty pass result.
 */

import { injectable, inject } from 'tsyringe';
import { SecurityMode, SecurityActionCategory } from '../../../domain/generated/output.js';
import type {
  EffectivePolicySnapshot,
  DependencyFinding,
  ReleaseIntegrityResult,
  SecurityEvent,
  DependencyRules,
  ReleaseRules,
} from '../../../domain/generated/output.js';
import type { ISecurityPolicyService } from '../../ports/output/services/security-policy-service.interface.js';
import type { ISecurityEventRepository } from '../../ports/output/repositories/security-event.repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type {
  IGitHubRepositoryService,
  GovernanceFinding,
} from '../../ports/output/services/github-repository-service.interface.js';
import type { IDependencyRiskEvaluator } from '../../ports/output/services/dependency-risk-evaluator.interface.js';
import type { IReleaseIntegrityEvaluator } from '../../ports/output/services/release-integrity-evaluator.interface.js';
import { randomUUID } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

/**
 * Input for the enforce security use case.
 */
export interface EnforceSecurityInput {
  /** Absolute path to the repository to evaluate */
  repositoryPath: string;
}

/**
 * Result of the enforcement flow.
 */
export interface EnforceSecurityResult {
  /** Whether all checks passed (Advisory always passes, Enforce fails on violations) */
  passed: boolean;
  /** Effective security mode used for evaluation */
  mode: SecurityMode;
  /** Effective policy snapshot */
  policy: EffectivePolicySnapshot;
  /** Dependency risk findings */
  dependencyFindings: DependencyFinding[];
  /** Release integrity result */
  releaseIntegrity: ReleaseIntegrityResult;
  /** GitHub governance audit findings (audit-only, do not affect pass/fail) */
  governanceFindings: GovernanceFinding[];
  /** Total number of findings (excludes governance — governance is audit-only) */
  totalFindings: number;
}

/**
 * Default dependency rules when no policy file defines them.
 */
const DEFAULT_DEPENDENCY_RULES: DependencyRules = {
  checkLockfileConsistency: true,
  checkLifecycleScripts: true,
  checkNonRegistrySource: true,
  enforceStrictVersionRanges: false,
  allowlist: [],
  denylist: [],
};

/**
 * Default release rules when no policy file defines them.
 */
const DEFAULT_RELEASE_RULES: ReleaseRules = {
  requireCiOnlyPublishing: true,
  requireProvenance: true,
  checkWorkflowIntegrity: true,
};

@injectable()
export class EnforceSecurityUseCase {
  constructor(
    @inject('ISecurityPolicyService')
    private readonly policyService: ISecurityPolicyService,
    @inject('ISecurityEventRepository')
    private readonly eventRepository: ISecurityEventRepository,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('IDependencyRiskEvaluator')
    private readonly dependencyEvaluator: IDependencyRiskEvaluator,
    @inject('IReleaseIntegrityEvaluator')
    private readonly releaseEvaluator: IReleaseIntegrityEvaluator,
    @inject('IGitHubRepositoryService')
    private readonly githubService: IGitHubRepositoryService
  ) {}

  async execute(input: EnforceSecurityInput): Promise<EnforceSecurityResult> {
    // Evaluate effective policy
    const policy = await this.policyService.evaluatePolicy(input.repositoryPath);

    // Disabled mode — return empty pass result
    if (policy.mode === SecurityMode.Disabled) {
      return {
        passed: true,
        mode: SecurityMode.Disabled,
        policy,
        dependencyFindings: [],
        releaseIntegrity: { checks: [], passed: true },
        governanceFindings: [],
        totalFindings: 0,
      };
    }

    // Run dependency-risk checks
    const dependencyFindings = this.dependencyEvaluator.evaluate(
      input.repositoryPath,
      DEFAULT_DEPENDENCY_RULES
    );

    // Run release-integrity checks
    const releaseIntegrity = this.releaseEvaluator.evaluate(
      input.repositoryPath,
      DEFAULT_RELEASE_RULES
    );

    // Run governance audit (audit-only — does not affect pass/fail)
    const governanceFindings = await this.runGovernanceAudit(input.repositoryPath);

    // Count total findings (governance excluded — audit-only per FR-15)
    const failedReleaseChecks = releaseIntegrity.checks.filter((c) => !c.passed);
    const totalFindings = dependencyFindings.length + failedReleaseChecks.length;

    // Persist findings as security events
    await this.persistFindings(
      input.repositoryPath,
      dependencyFindings,
      releaseIntegrity,
      governanceFindings
    );

    // Update settings with evaluation timestamp
    await this.updateEvaluationTimestamp(policy.source);

    // Determine pass/fail based on mode (governance is always advisory)
    const hasFailures = totalFindings > 0;
    const passed = policy.mode === SecurityMode.Advisory ? true : !hasFailures;

    return {
      passed,
      mode: policy.mode,
      policy,
      dependencyFindings,
      releaseIntegrity,
      governanceFindings,
      totalFindings,
    };
  }

  /**
   * Resolve GitHub owner/repo from the repository's git remote and run governance audit.
   * Returns empty array if the remote cannot be resolved (not a GitHub repo, no remote, etc.).
   */
  private async runGovernanceAudit(repositoryPath: string): Promise<GovernanceFinding[]> {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: repositoryPath,
      });
      const remoteUrl = stdout.trim();
      if (!remoteUrl) return [];

      const parsed = this.githubService.parseGitHubUrl(remoteUrl);
      return await this.githubService.auditRepositoryGovernance(parsed.owner, parsed.repo);
    } catch {
      // Not a GitHub repository, no remote configured, or parse failure — skip governance audit
      return [];
    }
  }

  /**
   * Persist dependency findings, failed release checks, and governance findings as security events.
   */
  private async persistFindings(
    repositoryPath: string,
    depFindings: DependencyFinding[],
    releaseResult: ReleaseIntegrityResult,
    govFindings: GovernanceFinding[]
  ): Promise<void> {
    const now = new Date().toISOString();

    for (const finding of depFindings) {
      const event: SecurityEvent = {
        id: randomUUID(),
        repositoryPath,
        severity: finding.severity,
        category: SecurityActionCategory.DependencyInstall,
        disposition: 'Denied' as SecurityEvent['disposition'],
        message: finding.message,
        remediationSummary: finding.remediation,
        createdAt: now,
        updatedAt: now,
      };
      await this.eventRepository.save(event);
    }

    for (const check of releaseResult.checks) {
      if (!check.passed) {
        const event: SecurityEvent = {
          id: randomUUID(),
          repositoryPath,
          severity: check.severity,
          category: SecurityActionCategory.PublishRelease,
          disposition: 'Denied' as SecurityEvent['disposition'],
          message: check.message,
          createdAt: now,
          updatedAt: now,
        };
        await this.eventRepository.save(event);
      }
    }

    // Persist governance findings as advisory events
    for (const finding of govFindings) {
      // Map governance severity to SecuritySeverity (Unknown → Low for persistence)
      const severity =
        finding.severity === 'Unknown'
          ? ('Low' as SecurityEvent['severity'])
          : (finding.severity as SecurityEvent['severity']);
      const event: SecurityEvent = {
        id: randomUUID(),
        repositoryPath,
        severity,
        category: SecurityActionCategory.CiWorkflowModify,
        disposition: 'Allowed' as SecurityEvent['disposition'],
        message: `[Governance Audit] ${finding.message}`,
        remediationSummary: finding.remediation,
        createdAt: now,
        updatedAt: now,
      };
      await this.eventRepository.save(event);
    }
  }

  /**
   * Update settings with the latest evaluation timestamp and policy source.
   */
  private async updateEvaluationTimestamp(policySource: string): Promise<void> {
    try {
      const settings = await this.settingsRepository.load();
      if (settings) {
        settings.security = {
          ...settings.security,
          mode: settings.security?.mode ?? SecurityMode.Advisory,
          lastEvaluationAt: new Date().toISOString(),
          policySource,
        };
        await this.settingsRepository.update(settings);
      }
    } catch {
      // Non-fatal — evaluation results are still returned even if settings update fails
    }
  }
}
