/**
 * Security Policy Service
 *
 * Central policy engine implementing ISecurityPolicyService.
 * Reads the policy file, validates it, merges with persisted settings defaults
 * using deterministic precedence, and returns an EffectivePolicySnapshot.
 *
 * Precedence: global settings defaults < repository policy file (stricter wins).
 * A lower-precedence layer cannot weaken a stricter higher-precedence rule.
 */

import { injectable, inject } from 'tsyringe';
import {
  SecurityMode,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '../../../domain/generated/output.js';
import type {
  EffectivePolicySnapshot,
  ActionDispositionEntry,
  SupplyChainSecurityPolicy,
} from '../../../domain/generated/output.js';
import type {
  ISecurityPolicyService,
  PolicyValidationResult,
} from '../../../application/ports/output/services/security-policy-service.interface.js';
import type { ISettingsRepository } from '../../../application/ports/output/repositories/settings.repository.interface.js';
import {
  SecurityPolicyFileReader,
  SECURITY_POLICY_FILENAME,
} from './security-policy-file-reader.js';
import { SecurityPolicyValidator } from './security-policy-validator.js';
import { dirname } from 'node:path';

/**
 * Numeric rank for comparing SecurityMode strictness.
 * Higher number = stricter mode.
 */
const MODE_STRICTNESS: Record<string, number> = {
  [SecurityMode.Disabled]: 0,
  [SecurityMode.Advisory]: 1,
  [SecurityMode.Enforce]: 2,
};

/**
 * Numeric rank for comparing disposition strictness.
 * Higher number = more restrictive.
 */
const DISPOSITION_STRICTNESS: Record<string, number> = {
  [SecurityActionDisposition.Allowed]: 0,
  [SecurityActionDisposition.ApprovalRequired]: 1,
  [SecurityActionDisposition.Denied]: 2,
};

/**
 * All action categories for building default dispositions.
 */
const ALL_CATEGORIES = Object.values(SecurityActionCategory);

@injectable()
export class SecurityPolicyService implements ISecurityPolicyService {
  private readonly cache = new Map<string, EffectivePolicySnapshot>();

  constructor(
    @inject('SecurityPolicyFileReader')
    private readonly fileReader: SecurityPolicyFileReader,
    @inject('SecurityPolicyValidator')
    private readonly validator: SecurityPolicyValidator,
    @inject('ISettingsRepository')
    private readonly settingsRepo: ISettingsRepository
  ) {}

  async evaluatePolicy(repositoryPath: string): Promise<EffectivePolicySnapshot> {
    // Load settings defaults
    const settings = await this.settingsRepo.load();
    const settingsMode = settings?.security?.mode ?? SecurityMode.Advisory;

    // Read policy file
    const policyFile = await this.fileReader.read(repositoryPath);

    if (!policyFile) {
      // No policy file — use settings defaults
      const snapshot = this.buildDefaultSnapshot(settingsMode);
      this.cache.set(repositoryPath, snapshot);
      return snapshot;
    }

    // Validate policy file
    const validation = this.validator.validate(policyFile as unknown as Record<string, unknown>);
    if (!validation.valid) {
      throw new Error(
        `Security policy validation failed for ${repositoryPath}:\n${validation.errors.join('\n')}`
      );
    }

    // Merge with precedence: settings defaults < policy file (stricter wins)
    const snapshot = this.mergePolicy(settingsMode, policyFile);
    this.cache.set(repositoryPath, snapshot);
    return snapshot;
  }

  async getEffectivePolicy(repositoryPath: string): Promise<EffectivePolicySnapshot> {
    const cached = this.cache.get(repositoryPath);
    if (cached) {
      return cached;
    }
    return this.evaluatePolicy(repositoryPath);
  }

  async validatePolicyFile(filePath: string): Promise<PolicyValidationResult> {
    // Read the file from the directory containing it
    const dirPath = dirname(filePath);
    const policyFile = await this.fileReader.read(dirPath);

    if (!policyFile) {
      return { valid: true, errors: [] };
    }

    return this.validator.validate(policyFile as unknown as Record<string, unknown>);
  }

  getActionDisposition(
    policy: EffectivePolicySnapshot,
    actionCategory: SecurityActionCategory
  ): SecurityActionDisposition {
    const entry = policy.actionDispositions.find((d) => d.category === actionCategory);
    return entry?.disposition ?? SecurityActionDisposition.Allowed;
  }

  /**
   * Build a default snapshot from settings mode only (no policy file).
   */
  private buildDefaultSnapshot(mode: SecurityMode): EffectivePolicySnapshot {
    return {
      mode,
      source: 'settings-default',
      evaluatedAt: new Date().toISOString(),
      actionDispositions: ALL_CATEGORIES.map((category) => ({
        category,
        disposition: SecurityActionDisposition.Allowed,
      })),
    };
  }

  /**
   * Merge settings defaults with policy file, applying strict-wins precedence.
   */
  private mergePolicy(
    settingsMode: SecurityMode,
    policyFile: Partial<SupplyChainSecurityPolicy>
  ): EffectivePolicySnapshot {
    // Mode: stricter wins
    const fileMode = policyFile.mode ?? SecurityMode.Advisory;
    const effectiveMode = this.stricterMode(settingsMode, fileMode);

    // Action dispositions: merge file entries with defaults, stricter wins
    const dispositionMap = new Map<SecurityActionCategory, SecurityActionDisposition>();

    // Start with defaults (all Allowed)
    for (const category of ALL_CATEGORIES) {
      dispositionMap.set(category, SecurityActionDisposition.Allowed);
    }

    // Apply policy file entries (can only make stricter, not weaker)
    if (policyFile.actionDispositions) {
      for (const entry of policyFile.actionDispositions) {
        const current = dispositionMap.get(entry.category);
        if (current !== undefined) {
          dispositionMap.set(entry.category, this.stricterDisposition(current, entry.disposition));
        }
      }
    }

    const actionDispositions: ActionDispositionEntry[] = [];
    for (const [category, disposition] of dispositionMap) {
      actionDispositions.push({ category, disposition });
    }

    return {
      mode: effectiveMode,
      source: SECURITY_POLICY_FILENAME,
      evaluatedAt: new Date().toISOString(),
      actionDispositions,
    };
  }

  /**
   * Return the stricter of two SecurityMode values.
   */
  private stricterMode(a: SecurityMode, b: SecurityMode): SecurityMode {
    const rankA = MODE_STRICTNESS[a] ?? 0;
    const rankB = MODE_STRICTNESS[b] ?? 0;
    return rankA >= rankB ? a : b;
  }

  /**
   * Return the stricter of two SecurityActionDisposition values.
   */
  private stricterDisposition(
    a: SecurityActionDisposition,
    b: SecurityActionDisposition
  ): SecurityActionDisposition {
    const rankA = DISPOSITION_STRICTNESS[a] ?? 0;
    const rankB = DISPOSITION_STRICTNESS[b] ?? 0;
    return rankA >= rankB ? a : b;
  }
}
