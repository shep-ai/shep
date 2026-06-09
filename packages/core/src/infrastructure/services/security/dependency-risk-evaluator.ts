/**
 * Dependency Risk Evaluator
 *
 * Evaluates repository-local dependency risk signals without
 * external services. Checks:
 * - Manifest-lockfile consistency (package.json vs lockfile)
 * - Dependency source types (registry vs git vs file)
 * - Risky lifecycle scripts (preinstall, postinstall, prepare)
 * - Allowlist/denylist enforcement
 * - Version-range strictness
 *
 * Returns an array of DependencyFinding objects with severity and remediation.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DependencyRiskType, SecuritySeverity } from '../../../domain/generated/output.js';
import type { DependencyFinding, DependencyRules } from '../../../domain/generated/output.js';

/**
 * Lockfile names in priority order.
 */
const LOCKFILE_NAMES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];

/**
 * Lifecycle script names that execute arbitrary code during install.
 */
const RISKY_LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'];

/**
 * Patterns indicating a non-registry dependency source.
 */
const NON_REGISTRY_PREFIXES = ['git+', 'git:', 'github:', 'file:', 'link:', 'http:', 'https:'];

/**
 * Patterns indicating loose version ranges.
 */
const LOOSE_RANGE_PATTERNS = [/^\*$/, /^\^/, /^~/, /^>=/, /^>(?!=)/];

export class DependencyRiskEvaluator {
  /**
   * Evaluate dependency risk for a repository.
   *
   * @param repositoryPath - Absolute path to the repository root
   * @param rules - Dependency risk policy rules
   * @returns Array of dependency findings
   */
  evaluate(repositoryPath: string, rules: DependencyRules): DependencyFinding[] {
    const packageJsonPath = join(repositoryPath, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return [];
    }

    let packageJson: Record<string, unknown>;
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    } catch {
      return [];
    }

    const findings: DependencyFinding[] = [];

    // Collect all dependencies
    const allDeps = this.collectDependencies(packageJson);

    // Check lockfile consistency
    if (rules.checkLockfileConsistency) {
      findings.push(...this.checkLockfileConsistency(repositoryPath, allDeps));
    }

    // Check non-registry sources
    if (rules.checkNonRegistrySource) {
      findings.push(...this.checkNonRegistrySources(allDeps));
    }

    // Check lifecycle scripts
    if (rules.checkLifecycleScripts) {
      findings.push(...this.checkLifecycleScripts(repositoryPath, allDeps));
    }

    // Check denylist
    if (rules.denylist.length > 0) {
      findings.push(...this.checkDenylist(allDeps, rules.denylist));
    }

    // Check allowlist
    if (rules.allowlist.length > 0) {
      findings.push(...this.checkAllowlist(allDeps, rules.allowlist));
    }

    // Check version-range strictness
    if (rules.enforceStrictVersionRanges) {
      findings.push(...this.checkVersionRangeStrictness(allDeps));
    }

    return findings;
  }

  /**
   * Collect all dependencies from package.json (dependencies + devDependencies).
   */
  private collectDependencies(packageJson: Record<string, unknown>): Map<string, string> {
    const deps = new Map<string, string>();

    const depSections = ['dependencies', 'devDependencies'];
    for (const section of depSections) {
      const sectionDeps = packageJson[section];
      if (sectionDeps && typeof sectionDeps === 'object') {
        for (const [name, version] of Object.entries(sectionDeps as Record<string, string>)) {
          deps.set(name, version);
        }
      }
    }

    return deps;
  }

  /**
   * Check that a lockfile exists when there are dependencies.
   */
  private checkLockfileConsistency(
    repositoryPath: string,
    deps: Map<string, string>
  ): DependencyFinding[] {
    if (deps.size === 0) {
      return [];
    }

    const hasLockfile = LOCKFILE_NAMES.some((name) => existsSync(join(repositoryPath, name)));

    if (!hasLockfile) {
      return [
        {
          packageName: '*',
          severity: SecuritySeverity.High,
          riskType: DependencyRiskType.LockfileInconsistency,
          message: 'No lockfile found. Dependencies are not pinned to specific versions.',
          remediation:
            'Run your package manager install command to generate a lockfile (e.g., pnpm install).',
        },
      ];
    }

    return [];
  }

  /**
   * Check for dependencies installed from non-registry sources.
   */
  private checkNonRegistrySources(deps: Map<string, string>): DependencyFinding[] {
    const findings: DependencyFinding[] = [];

    for (const [name, version] of deps) {
      const isNonRegistry = NON_REGISTRY_PREFIXES.some((prefix) => version.startsWith(prefix));

      if (isNonRegistry) {
        findings.push({
          packageName: name,
          version,
          severity: SecuritySeverity.Medium,
          riskType: DependencyRiskType.NonRegistrySource,
          message: `Package "${name}" is installed from a non-registry source: ${version}`,
          remediation: `Consider using a registry-published version of "${name}" instead of a direct source reference.`,
        });
      }
    }

    return findings;
  }

  /**
   * Check installed packages for risky lifecycle scripts.
   */
  private checkLifecycleScripts(
    repositoryPath: string,
    deps: Map<string, string>
  ): DependencyFinding[] {
    const findings: DependencyFinding[] = [];
    const nodeModules = join(repositoryPath, 'node_modules');

    if (!existsSync(nodeModules)) {
      return [];
    }

    for (const [name] of deps) {
      const pkgJsonPath = join(nodeModules, name, 'package.json');
      if (!existsSync(pkgJsonPath)) {
        continue;
      }

      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        const scripts = pkgJson.scripts;
        if (!scripts || typeof scripts !== 'object') {
          continue;
        }

        const riskyScripts = RISKY_LIFECYCLE_SCRIPTS.filter(
          (s) => typeof scripts[s] === 'string' && scripts[s].length > 0
        );

        if (riskyScripts.length > 0) {
          findings.push({
            packageName: name,
            version: pkgJson.version,
            severity: SecuritySeverity.Medium,
            riskType: DependencyRiskType.LifecycleScript,
            message: `Package "${name}" has lifecycle scripts that execute during install: ${riskyScripts.join(', ')}`,
            remediation: `Review the lifecycle scripts in "${name}" or add it to the allowlist if trusted. Consider using --ignore-scripts during install.`,
          });
        }
      } catch {
        // Skip packages with unreadable package.json
      }
    }

    return findings;
  }

  /**
   * Check dependencies against the denylist.
   */
  private checkDenylist(deps: Map<string, string>, denylist: string[]): DependencyFinding[] {
    const findings: DependencyFinding[] = [];
    const denySet = new Set(denylist);

    for (const [name, version] of deps) {
      if (denySet.has(name)) {
        findings.push({
          packageName: name,
          version,
          severity: SecuritySeverity.Critical,
          riskType: DependencyRiskType.DenylistViolation,
          message: `Package "${name}" is on the denylist and must be removed.`,
          remediation: `Remove "${name}" from your dependencies. It has been explicitly denied by security policy.`,
        });
      }
    }

    return findings;
  }

  /**
   * Check dependencies against the allowlist (non-empty allowlist = only listed packages allowed).
   */
  private checkAllowlist(deps: Map<string, string>, allowlist: string[]): DependencyFinding[] {
    const findings: DependencyFinding[] = [];
    const allowSet = new Set(allowlist);

    for (const [name, version] of deps) {
      if (!allowSet.has(name)) {
        findings.push({
          packageName: name,
          version,
          severity: SecuritySeverity.High,
          riskType: DependencyRiskType.AllowlistViolation,
          message: `Package "${name}" is not on the allowlist.`,
          remediation: `Add "${name}" to the allowlist in shep.security.yaml if it is a trusted dependency, or remove it.`,
        });
      }
    }

    return findings;
  }

  /**
   * Check version ranges for strictness (no ^, ~, *, >= patterns).
   */
  private checkVersionRangeStrictness(deps: Map<string, string>): DependencyFinding[] {
    const findings: DependencyFinding[] = [];

    for (const [name, version] of deps) {
      // Skip non-registry sources (already flagged separately)
      if (NON_REGISTRY_PREFIXES.some((prefix) => version.startsWith(prefix))) {
        continue;
      }

      const isLoose = LOOSE_RANGE_PATTERNS.some((pattern) => pattern.test(version));
      if (isLoose) {
        findings.push({
          packageName: name,
          version,
          severity: SecuritySeverity.Medium,
          riskType: DependencyRiskType.VersionRangePolicy,
          message: `Package "${name}" uses a loose version range "${version}". Strict version pinning is required by policy.`,
          remediation: `Pin "${name}" to an exact version (e.g., "4.17.21" instead of "${version}").`,
        });
      }
    }

    return findings;
  }
}
