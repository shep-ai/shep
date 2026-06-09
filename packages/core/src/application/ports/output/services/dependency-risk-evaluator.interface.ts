/**
 * Dependency Risk Evaluator Port Interface (Output Port)
 *
 * Evaluates repository-local dependency risk signals (lockfile consistency,
 * lifecycle scripts, non-registry sources, version-range strictness).
 */
import type { DependencyFinding, DependencyRules } from '../../../../domain/generated/output.js';

export interface IDependencyRiskEvaluator {
  evaluate(repositoryPath: string, rules: DependencyRules): DependencyFinding[];
}
