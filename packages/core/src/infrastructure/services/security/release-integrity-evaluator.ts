/**
 * Release Integrity Evaluator
 *
 * Checks release pipeline integrity for a repository:
 * - CI workflow exists and publishes from CI (not local)
 * - NPM_TOKEN and RELEASE_TOKEN referenced as secrets (not hardcoded)
 * - npm provenance flags (--provenance) present in publish steps
 * - Release workflow integrity (semantic-release configured)
 *
 * Returns a ReleaseIntegrityResult with individual check results and overall pass/fail.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ReleaseIntegrityCheckType, SecuritySeverity } from '../../../domain/generated/output.js';
import type {
  ReleaseIntegrityCheck,
  ReleaseIntegrityResult,
  ReleaseRules,
} from '../../../domain/generated/output.js';

/**
 * Token env var names that should use secrets.* references.
 */
const TOKEN_ENV_NAMES = ['GITHUB_TOKEN', 'RELEASE_TOKEN', 'NPM_TOKEN', 'NODE_AUTH_TOKEN'];

/**
 * Pattern for a secrets.* reference in a YAML value.
 */
const SECRETS_REF_PATTERN = /\$\{\{\s*secrets\./;

/**
 * Pattern for detecting npm publish commands.
 */
const NPM_PUBLISH_PATTERN = /npm\s+publish/;

/**
 * Pattern for detecting --provenance flag.
 */
const PROVENANCE_FLAG_PATTERN = /--provenance/;

/**
 * Pattern for detecting semantic-release.
 */
const SEMANTIC_RELEASE_PATTERN = /semantic-release/;

export class ReleaseIntegrityEvaluator {
  /**
   * Evaluate release pipeline integrity.
   *
   * @param repositoryPath - Absolute path to the repository root
   * @param rules - Release integrity policy rules
   * @returns Aggregated result with individual check details
   */
  evaluate(repositoryPath: string, rules: ReleaseRules): ReleaseIntegrityResult {
    const checks: ReleaseIntegrityCheck[] = [];
    const workflowDir = join(repositoryPath, '.github', 'workflows');

    // Read all workflow files
    const workflowContents = this.readWorkflowFiles(workflowDir);

    // Check CI-only publishing
    if (rules.requireCiOnlyPublishing) {
      checks.push(this.checkCiOnlyPublishing(workflowDir, workflowContents));
    }

    // Check secret configuration (no hardcoded tokens)
    if (rules.requireCiOnlyPublishing) {
      checks.push(this.checkSecretConfiguration(workflowContents));
    }

    // Check provenance configuration
    if (rules.requireProvenance) {
      checks.push(...this.checkProvenanceConfiguration(workflowContents));
    }

    // Check workflow integrity
    if (rules.checkWorkflowIntegrity) {
      checks.push(this.checkWorkflowIntegrity(workflowContents));
    }

    return {
      checks,
      passed: checks.length === 0 || checks.every((c) => c.passed),
    };
  }

  /**
   * Read all YAML workflow files from .github/workflows/.
   */
  private readWorkflowFiles(workflowDir: string): string[] {
    if (!existsSync(workflowDir)) {
      return [];
    }

    try {
      const files = readdirSync(workflowDir).filter(
        (f) => f.endsWith('.yml') || f.endsWith('.yaml')
      );

      return files.map((f) => readFileSync(join(workflowDir, f), 'utf-8'));
    } catch {
      return [];
    }
  }

  /**
   * Check that CI workflow files exist (publishing happens in CI, not locally).
   */
  private checkCiOnlyPublishing(
    workflowDir: string,
    workflowContents: string[]
  ): ReleaseIntegrityCheck {
    if (workflowContents.length === 0) {
      return {
        checkType: ReleaseIntegrityCheckType.CiOnlyPublishing,
        passed: false,
        message:
          'No CI workflow files found in .github/workflows/. Publishing must happen in CI, not locally.',
        severity: SecuritySeverity.Critical,
      };
    }

    return {
      checkType: ReleaseIntegrityCheckType.CiOnlyPublishing,
      passed: true,
      message: 'CI workflow files found. Publishing is configured for CI execution.',
      severity: SecuritySeverity.Critical,
    };
  }

  /**
   * Check that tokens are referenced as secrets, not hardcoded.
   * Scans for known token env var names and verifies they use ${{ secrets.* }}.
   */
  private checkSecretConfiguration(workflowContents: string[]): ReleaseIntegrityCheck {
    const allContent = workflowContents.join('\n');
    const lines = allContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      for (const tokenName of TOKEN_ENV_NAMES) {
        // Match lines like "NPM_TOKEN: value" or "NPM_TOKEN: 'value'"
        const pattern = new RegExp(`^${tokenName}\\s*:\\s*(.+)$`);
        const match = pattern.exec(trimmed);
        if (match) {
          const value = match[1].trim();
          // Value must contain a secrets.* reference to be safe
          if (!SECRETS_REF_PATTERN.test(value)) {
            return {
              checkType: ReleaseIntegrityCheckType.SecretConfiguration,
              passed: false,
              message:
                'Hardcoded token detected in workflow files. Tokens must use ${{ secrets.* }} references.',
              severity: SecuritySeverity.Critical,
            };
          }
        }
      }
    }

    return {
      checkType: ReleaseIntegrityCheckType.SecretConfiguration,
      passed: true,
      message: 'Tokens are properly referenced using ${{ secrets.* }} expressions.',
      severity: SecuritySeverity.Critical,
    };
  }

  /**
   * Check that npm publish commands include --provenance flag.
   */
  private checkProvenanceConfiguration(workflowContents: string[]): ReleaseIntegrityCheck[] {
    const allContent = workflowContents.join('\n');

    // If no npm publish commands found, provenance is not applicable
    if (!NPM_PUBLISH_PATTERN.test(allContent)) {
      return [];
    }

    // Check if all npm publish commands have --provenance
    const lines = allContent.split('\n');
    let hasPublishWithoutProvenance = false;

    for (const line of lines) {
      if (NPM_PUBLISH_PATTERN.test(line) && !PROVENANCE_FLAG_PATTERN.test(line)) {
        hasPublishWithoutProvenance = true;
        break;
      }
    }

    if (hasPublishWithoutProvenance) {
      return [
        {
          checkType: ReleaseIntegrityCheckType.ProvenanceConfiguration,
          passed: false,
          message:
            'npm publish command found without --provenance flag. Add --provenance to generate SLSA provenance attestations.',
          severity: SecuritySeverity.Medium,
        },
      ];
    }

    return [
      {
        checkType: ReleaseIntegrityCheckType.ProvenanceConfiguration,
        passed: true,
        message: 'npm publish commands include --provenance flag for SLSA provenance.',
        severity: SecuritySeverity.Medium,
      },
    ];
  }

  /**
   * Check workflow integrity (semantic-release is configured).
   */
  private checkWorkflowIntegrity(workflowContents: string[]): ReleaseIntegrityCheck {
    const allContent = workflowContents.join('\n');

    if (!SEMANTIC_RELEASE_PATTERN.test(allContent)) {
      return {
        checkType: ReleaseIntegrityCheckType.WorkflowIntegrity,
        passed: false,
        message:
          'semantic-release not found in CI workflows. Automated release management is recommended.',
        severity: SecuritySeverity.Medium,
      };
    }

    return {
      checkType: ReleaseIntegrityCheckType.WorkflowIntegrity,
      passed: true,
      message: 'semantic-release is configured in CI workflows.',
      severity: SecuritySeverity.Medium,
    };
  }
}
