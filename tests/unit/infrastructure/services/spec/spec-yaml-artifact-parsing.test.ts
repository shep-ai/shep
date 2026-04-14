/**
 * Spec YAML Artifact Parsing Tests
 *
 * Validates that each spec YAML file in specs/032-example-specs/ parses
 * into its corresponding TypeSpec-generated artifact type without errors.
 *
 * Each test reads a real YAML file, parses it with js-yaml, and validates
 * the result satisfies the generated TypeScript type with all fields present.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SpecYamlParserService } from '@/infrastructure/services/spec/spec-yaml-parser.service.js';
import type {
  FeatureArtifact,
  ResearchArtifact,
  TechnicalPlanArtifact,
  TasksArtifact,
} from '@/domain/generated/output.js';

const SPECS_DIR = join(process.cwd(), 'specs/032-example-specs');

function readYaml(filename: string): string {
  return readFileSync(join(SPECS_DIR, filename), 'utf-8');
}

describe('Spec YAML 1:1 artifact schema parsing', () => {
  const parser = new SpecYamlParserService();

  it('spec.yaml parses into FeatureArtifact with all required fields', () => {
    const result: FeatureArtifact = parser.parseSpecYaml(readYaml('spec.yaml'));

    // SpecArtifactBase fields
    expect(typeof result.name).toBe('string');
    expect(typeof result.summary).toBe('string');
    expect(typeof result.content).toBe('string');
    expect(Array.isArray(result.technologies)).toBe(true);
    expect(Array.isArray(result.relatedFeatures)).toBe(true);
    expect(Array.isArray(result.relatedLinks)).toBe(true);
    expect(Array.isArray(result.openQuestions)).toBe(true);

    // FeatureArtifact-specific fields
    expect(typeof result.number).toBe('number');
    expect(typeof result.branch).toBe('string');
    expect(typeof result.oneLiner).toBe('string');
    expect(result.phase).toBeDefined();
    expect(typeof result.sizeEstimate).toBe('string');

    // BaseEntity fields (auto-generated)
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it('research.yaml parses into ResearchArtifact with all required fields', () => {
    const result: ResearchArtifact = parser.parseResearchYaml(readYaml('research.yaml'));

    // SpecArtifactBase fields
    expect(typeof result.name).toBe('string');
    expect(typeof result.summary).toBe('string');
    expect(typeof result.content).toBe('string');
    expect(Array.isArray(result.technologies)).toBe(true);
    expect(Array.isArray(result.relatedFeatures)).toBe(true);
    expect(Array.isArray(result.relatedLinks)).toBe(true);
    expect(Array.isArray(result.openQuestions)).toBe(true);

    // ResearchArtifact-specific fields
    expect(Array.isArray(result.decisions)).toBe(true);
    expect(result.decisions.length).toBeGreaterThan(0);
    const decision = result.decisions[0];
    expect(typeof decision.title).toBe('string');
    expect(typeof decision.chosen).toBe('string');
    expect(Array.isArray(decision.rejected)).toBe(true);
    expect(typeof decision.rationale).toBe('string');
  });

  it('plan.yaml parses into TechnicalPlanArtifact with all required fields', () => {
    const result: TechnicalPlanArtifact = parser.parsePlanYaml(readYaml('plan.yaml'));

    // SpecArtifactBase fields
    expect(typeof result.name).toBe('string');
    expect(typeof result.summary).toBe('string');
    expect(typeof result.content).toBe('string');
    expect(Array.isArray(result.technologies)).toBe(true);
    expect(Array.isArray(result.relatedFeatures)).toBe(true);
    expect(Array.isArray(result.relatedLinks)).toBe(true);
    expect(Array.isArray(result.openQuestions)).toBe(true);

    // TechnicalPlanArtifact-specific fields
    expect(Array.isArray(result.phases)).toBe(true);
    expect(result.phases.length).toBeGreaterThan(0);
    const phase = result.phases[0];
    expect(typeof phase.id).toBe('string');
    expect(typeof phase.name).toBe('string');
    expect(typeof phase.parallel).toBe('boolean');
    expect(Array.isArray(result.filesToCreate)).toBe(true);
    expect(Array.isArray(result.filesToModify)).toBe(true);
  });

  it('tasks.yaml parses into TasksArtifact with all required fields', () => {
    const result: TasksArtifact = parser.parseTasksYaml(readYaml('tasks.yaml'));

    // SpecArtifactBase fields
    expect(typeof result.name).toBe('string');
    expect(typeof result.summary).toBe('string');
    expect(typeof result.content).toBe('string');
    expect(Array.isArray(result.technologies)).toBe(true);
    expect(Array.isArray(result.relatedFeatures)).toBe(true);
    expect(Array.isArray(result.relatedLinks)).toBe(true);
    expect(Array.isArray(result.openQuestions)).toBe(true);

    // TasksArtifact-specific fields
    expect(Array.isArray(result.tasks)).toBe(true);
    expect(result.tasks.length).toBeGreaterThan(0);
    const task = result.tasks[0];
    expect(typeof task.id).toBe('string');
    expect(typeof task.phaseId).toBe('string');
    expect(typeof task.title).toBe('string');
    expect(typeof task.description).toBe('string');
    expect(task.state).toBeDefined();
    expect(Array.isArray(task.dependencies)).toBe(true);
    expect(Array.isArray(task.acceptanceCriteria)).toBe(true);
    expect(typeof task.estimatedEffort).toBe('string');
    expect(typeof result.totalEstimate).toBe('string');
  });
});
