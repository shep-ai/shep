/**
 * Spec Artifact Parser Service Interface
 *
 * Output port for parsing raw YAML strings from spec artifact files
 * (spec.yaml, research.yaml, plan.yaml, tasks.yaml, feature.yaml) into
 * their TypeSpec-generated TypeScript types.
 *
 * Implementations validate the parsed content against the JSON Schemas
 * generated from TypeSpec definitions. The interface itself is pure —
 * it has zero dependency on infrastructure details (no filesystem, no
 * Ajv, no js-yaml) so it remains safe to consume from the application
 * layer.
 */

import type {
  FeatureArtifact,
  ResearchArtifact,
  TechnicalPlanArtifact,
  TasksArtifact,
  FeatureStatus,
} from '../../../../domain/generated/output.js';

export interface ISpecArtifactParser {
  /**
   * Parse a spec.yaml string into a FeatureArtifact object.
   */
  parseSpecYaml(content: string): FeatureArtifact;

  /**
   * Parse a research.yaml string into a ResearchArtifact object.
   */
  parseResearchYaml(content: string): ResearchArtifact;

  /**
   * Parse a plan.yaml string into a TechnicalPlanArtifact object.
   */
  parsePlanYaml(content: string): TechnicalPlanArtifact;

  /**
   * Parse a tasks.yaml string into a TasksArtifact object.
   */
  parseTasksYaml(content: string): TasksArtifact;

  /**
   * Parse a feature.yaml string into a FeatureStatus object.
   */
  parseFeatureStatusYaml(content: string): FeatureStatus;
}
