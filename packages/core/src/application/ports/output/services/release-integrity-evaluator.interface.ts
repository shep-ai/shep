/**
 * Release Integrity Evaluator Port Interface (Output Port)
 *
 * Evaluates release integrity signals (CI-only publishing, provenance,
 * workflow integrity) for a repository against release rules.
 */
import type { ReleaseIntegrityResult, ReleaseRules } from '../../../../domain/generated/output.js';

export interface IReleaseIntegrityEvaluator {
  evaluate(repositoryPath: string, rules: ReleaseRules): ReleaseIntegrityResult;
}
