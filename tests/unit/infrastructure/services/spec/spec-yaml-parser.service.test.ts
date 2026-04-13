/**
 * Spec YAML Parser Service Tests — Real Data Validation
 *
 * Reads actual YAML files from specs/032-example-specs/ and validates
 * that the parser service returns objects matching TypeSpec-generated types.
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
  FeatureStatus,
} from '@/domain/generated/output.js';
import { SdlcLifecycle, TaskState } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Setup: Read real YAML content from specs/032-example-specs/
// ---------------------------------------------------------------------------

const SPECS_DIR = join(process.cwd(), 'specs/032-example-specs');

function readSpec(filename: string): string {
  return readFileSync(join(SPECS_DIR, filename), 'utf-8');
}

const specContent = readSpec('spec.yaml');
const researchContent = readSpec('research.yaml');
const planContent = readSpec('plan.yaml');
const tasksContent = readSpec('tasks.yaml');
const featureContent = readSpec('feature.yaml');

// ===========================================================================
// 1. spec.yaml → FeatureArtifact
// ===========================================================================
describe('parseSpecYaml (specs/032-example-specs/spec.yaml)', () => {
  const parser = new SpecYamlParserService();

  it('should parse without throwing', () => {
    expect(() => parser.parseSpecYaml(specContent)).not.toThrow();
  });

  it('should return a valid FeatureArtifact', () => {
    const result: FeatureArtifact = parser.parseSpecYaml(specContent);
    expect(result).toBeDefined();
  });

  it('should extract name', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(result.name).toBe('artifact-schemas');
  });

  it('should extract number as a number', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(result.number).toBe(32);
    expect(typeof result.number).toBe('number');
  });

  it('should extract branch', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(result.branch).toBe('feat/artifacts-schemas');
  });

  it('should extract oneLiner', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(result.oneLiner).toContain('TypeSpec artifact schemas');
  });

  it('should map phase to SdlcLifecycle enum value', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(result.phase).toBe(SdlcLifecycle.Implementation);
  });

  it('should extract sizeEstimate', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(result.sizeEstimate).toBe('S');
  });

  it('should extract technologies as string[]', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(Array.isArray(result.technologies)).toBe(true);
    expect(result.technologies.length).toBeGreaterThan(0);
    expect(result.technologies).toContain('TypeSpec');
  });

  it('should extract summary as non-empty string', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('should extract content as string containing markdown', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(typeof result.content).toBe('string');
    expect(result.content).toContain('Problem Statement');
    expect(result.content).toContain('Success Criteria');
  });

  it('should extract relatedFeatures as string[]', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(Array.isArray(result.relatedFeatures)).toBe(true);
  });

  it('should extract relatedLinks as string[]', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(Array.isArray(result.relatedLinks)).toBe(true);
  });

  describe('openQuestions', () => {
    it('should extract open questions', () => {
      const result = parser.parseSpecYaml(specContent);
      expect(Array.isArray(result.openQuestions)).toBe(true);
      expect(result.openQuestions).toHaveLength(1);
    });

    it('should have resolved flag on each question', () => {
      const result = parser.parseSpecYaml(specContent);
      for (const q of result.openQuestions) {
        expect(typeof q.resolved).toBe('boolean');
        expect(q.resolved).toBe(true);
      }
    });

    it('should have options array with correct structure', () => {
      const result = parser.parseSpecYaml(specContent);
      const first = result.openQuestions[0];
      expect(Array.isArray(first.options)).toBe(true);
      expect(first.options!).toHaveLength(2);

      const option = first.options![0];
      expect(typeof option.option).toBe('string');
      expect(typeof option.description).toBe('string');
      expect(typeof option.selected).toBe('boolean');
    });

    it('should have selectionRationale on resolved questions with options', () => {
      const result = parser.parseSpecYaml(specContent);
      const first = result.openQuestions[0];
      expect(typeof first.selectionRationale).toBe('string');
      expect(first.selectionRationale!.length).toBeGreaterThan(0);
    });

    it('should have exactly one selected option per question', () => {
      const result = parser.parseSpecYaml(specContent);
      for (const q of result.openQuestions) {
        const selectedCount = q.options!.filter((o) => o.selected).length;
        expect(selectedCount).toBe(1);
      }
    });
  });

  it('should have BaseEntity fields (id, createdAt, updatedAt)', () => {
    const result = parser.parseSpecYaml(specContent);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });
});

// ===========================================================================
// 2. research.yaml → ResearchArtifact
// ===========================================================================
describe('parseResearchYaml (specs/032-example-specs/research.yaml)', () => {
  const parser = new SpecYamlParserService();

  it('should parse without throwing', () => {
    expect(() => parser.parseResearchYaml(researchContent)).not.toThrow();
  });

  it('should return a valid ResearchArtifact', () => {
    const result: ResearchArtifact = parser.parseResearchYaml(researchContent);
    expect(result).toBeDefined();
  });

  it('should extract name', () => {
    const result = parser.parseResearchYaml(researchContent);
    expect(result.name).toBe('artifact-schemas');
  });

  it('should extract summary as non-empty string', () => {
    const result = parser.parseResearchYaml(researchContent);
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('should extract decisions as TechDecision[]', () => {
    const result = parser.parseResearchYaml(researchContent);
    expect(Array.isArray(result.decisions)).toBe(true);
    expect(result.decisions).toHaveLength(2);
  });

  it('should have correctly structured decisions', () => {
    const result = parser.parseResearchYaml(researchContent);
    const decision = result.decisions[0];
    expect(typeof decision.title).toBe('string');
    expect(typeof decision.chosen).toBe('string');
    expect(Array.isArray(decision.rejected)).toBe(true);
    expect(decision.rejected.length).toBeGreaterThan(0);
    expect(typeof decision.rejected[0]).toBe('string');
    expect(typeof decision.rationale).toBe('string');
  });

  it('should extract technologies', () => {
    const result = parser.parseResearchYaml(researchContent);
    expect(Array.isArray(result.technologies)).toBe(true);
    expect(result.technologies.length).toBeGreaterThan(0);
  });

  it('should extract relatedFeatures', () => {
    const result = parser.parseResearchYaml(researchContent);
    expect(Array.isArray(result.relatedFeatures)).toBe(true);
  });

  it('should extract openQuestions', () => {
    const result = parser.parseResearchYaml(researchContent);
    expect(Array.isArray(result.openQuestions)).toBe(true);
    expect(result.openQuestions).toHaveLength(0);
  });

  it('should extract content as string', () => {
    const result = parser.parseResearchYaml(researchContent);
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('should have BaseEntity fields', () => {
    const result = parser.parseResearchYaml(researchContent);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });
});

// ===========================================================================
// 3. plan.yaml → TechnicalPlanArtifact
// ===========================================================================
describe('parsePlanYaml (specs/032-example-specs/plan.yaml)', () => {
  const parser = new SpecYamlParserService();

  it('should parse without throwing', () => {
    expect(() => parser.parsePlanYaml(planContent)).not.toThrow();
  });

  it('should return a valid TechnicalPlanArtifact', () => {
    const result: TechnicalPlanArtifact = parser.parsePlanYaml(planContent);
    expect(result).toBeDefined();
  });

  it('should extract name', () => {
    const result = parser.parsePlanYaml(planContent);
    expect(result.name).toBe('artifact-schemas');
  });

  it('should extract summary as non-empty string', () => {
    const result = parser.parsePlanYaml(planContent);
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('should extract 3 phases as PlanPhase[]', () => {
    const result = parser.parsePlanYaml(planContent);
    expect(Array.isArray(result.phases)).toBe(true);
    expect(result.phases).toHaveLength(3);
  });

  it('should have correctly structured phases', () => {
    const result = parser.parsePlanYaml(planContent);
    const phase = result.phases[0];
    expect(phase.id).toBe('phase-1');
    expect(typeof phase.name).toBe('string');
    expect(typeof phase.description).toBe('string');
    expect(typeof phase.parallel).toBe('boolean');
    expect(phase.parallel).toBe(false);
  });

  it('should return undefined for taskIds when absent in YAML', () => {
    const result = parser.parsePlanYaml(planContent);
    // plan.yaml phases do not contain taskIds — parser returns undefined
    for (const phase of result.phases) {
      expect(phase.taskIds).toBeUndefined();
    }
  });

  it('should extract filesToCreate as string[]', () => {
    const result = parser.parsePlanYaml(planContent);
    expect(Array.isArray(result.filesToCreate)).toBe(true);
  });

  it('should extract filesToModify as string[]', () => {
    const result = parser.parsePlanYaml(planContent);
    expect(Array.isArray(result.filesToModify)).toBe(true);
    expect(result.filesToModify).toHaveLength(5);
  });

  it('should extract openQuestions as empty array', () => {
    const result = parser.parsePlanYaml(planContent);
    expect(result.openQuestions).toEqual([]);
  });

  it('should extract content as string containing architecture details', () => {
    const result = parser.parsePlanYaml(planContent);
    expect(typeof result.content).toBe('string');
    expect(result.content).toContain('Architecture Overview');
  });

  it('should have BaseEntity fields', () => {
    const result = parser.parsePlanYaml(planContent);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });
});

// ===========================================================================
// 4. tasks.yaml → TasksArtifact
// ===========================================================================
describe('parseTasksYaml (specs/032-example-specs/tasks.yaml)', () => {
  const parser = new SpecYamlParserService();

  it('should parse without throwing', () => {
    expect(() => parser.parseTasksYaml(tasksContent)).not.toThrow();
  });

  it('should return a valid TasksArtifact', () => {
    const result: TasksArtifact = parser.parseTasksYaml(tasksContent);
    expect(result).toBeDefined();
  });

  it('should extract name', () => {
    const result = parser.parseTasksYaml(tasksContent);
    expect(result.name).toBe('artifact-schemas');
  });

  it('should extract totalEstimate', () => {
    const result = parser.parseTasksYaml(tasksContent);
    expect(result.totalEstimate).toBe('1.5h');
  });

  it('should extract 6 tasks as SpecTask[]', () => {
    const result = parser.parseTasksYaml(tasksContent);
    expect(Array.isArray(result.tasks)).toBe(true);
    expect(result.tasks).toHaveLength(6);
  });

  it('should have correctly structured tasks', () => {
    const result = parser.parseTasksYaml(tasksContent);
    const task = result.tasks[0];
    expect(task.id).toBe('task-1');
    expect(task.phaseId).toBe('phase-1');
    expect(typeof task.title).toBe('string');
    expect(typeof task.description).toBe('string');
    expect(typeof task.estimatedEffort).toBe('string');
  });

  it('should map task state to TaskState enum', () => {
    const result = parser.parseTasksYaml(tasksContent);
    expect(result.tasks[0].state).toBe(TaskState.Done);
  });

  it('should extract dependencies as string[]', () => {
    const result = parser.parseTasksYaml(tasksContent);
    expect(result.tasks[0].dependencies).toEqual([]);
    expect(result.tasks[2].dependencies).toContain('task-1');
  });

  it('should extract acceptanceCriteria as string[]', () => {
    const result = parser.parseTasksYaml(tasksContent);
    const task = result.tasks[0];
    expect(Array.isArray(task.acceptanceCriteria)).toBe(true);
    expect(task.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(typeof task.acceptanceCriteria[0]).toBe('string');
  });

  describe('TDD cycles', () => {
    it('should extract tdd when present', () => {
      const result = parser.parseTasksYaml(tasksContent);
      const task = result.tasks[0]; // task-1 has tdd
      expect(task.tdd).toBeDefined();
    });

    it('should have red, green, refactor arrays in tdd', () => {
      const result = parser.parseTasksYaml(tasksContent);
      const tdd = result.tasks[0].tdd!;
      expect(Array.isArray(tdd.red)).toBe(true);
      expect(Array.isArray(tdd.green)).toBe(true);
      expect(Array.isArray(tdd.refactor)).toBe(true);
      expect(tdd.red.length).toBeGreaterThan(0);
      expect(tdd.green.length).toBeGreaterThan(0);
      expect(tdd.refactor.length).toBeGreaterThan(0);
    });

    it('should have string items in tdd arrays', () => {
      const result = parser.parseTasksYaml(tasksContent);
      const tdd = result.tasks[0].tdd!;
      expect(typeof tdd.red[0]).toBe('string');
      expect(typeof tdd.green[0]).toBe('string');
      expect(typeof tdd.refactor[0]).toBe('string');
    });
  });

  it('should have BaseEntity fields', () => {
    const result = parser.parseTasksYaml(tasksContent);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });
});

// ===========================================================================
// 5. feature.yaml → FeatureStatus
// ===========================================================================
describe('parseFeatureStatusYaml (specs/032-example-specs/feature.yaml)', () => {
  const parser = new SpecYamlParserService();

  it('should parse without throwing', () => {
    expect(() => parser.parseFeatureStatusYaml(featureContent)).not.toThrow();
  });

  it('should return a valid FeatureStatus', () => {
    const result: FeatureStatus = parser.parseFeatureStatusYaml(featureContent);
    expect(result).toBeDefined();
  });

  describe('feature identity', () => {
    it('should extract feature.id', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.feature.id).toBe('031-repo-node-actions');
    });

    it('should extract feature.name', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.feature.name).toBe('repo-node-actions');
    });

    it('should extract feature.number as number', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.feature.number).toBe(31);
      expect(typeof result.feature.number).toBe('number');
    });

    it('should extract feature.branch', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.feature.branch).toBe('feat/031-repo-node-actions');
    });

    it('should extract feature.lifecycle', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.feature.lifecycle).toBe('research');
    });

    it('should extract feature.createdAt', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.feature.createdAt).toBe('2026-02-18T16:29:30Z');
    });
  });

  describe('status info', () => {
    it('should extract status.phase', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.status.phase).toBe('implementation-complete');
    });

    it('should extract status.lastUpdatedBy', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.status.lastUpdatedBy).toBe('feature-agent:implement');
    });

    it('should extract status.lastUpdated as string', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(typeof result.status.lastUpdated).toBe('string');
    });

    it('should extract completedPhases as string[]', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(Array.isArray(result.status.completedPhases)).toBe(true);
      expect(result.status.completedPhases!).toHaveLength(8);
      expect(result.status.completedPhases).toContain('analyze');
      expect(result.status.completedPhases).toContain('phase-4');
    });

    it('should extract progress counters', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.status.progress.completed).toBe(12);
      expect(result.status.progress.total).toBe(12);
      expect(result.status.progress.percentage).toBe(100);
    });
  });

  describe('null → undefined conversion', () => {
    it('should convert status.currentTask null to undefined', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.status.currentTask).toBeUndefined();
    });

    it('should convert validation.lastRun null to undefined', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.validation.lastRun).toBeUndefined();
    });

    it('should convert tasks.current null to undefined', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.tasks.current).toBeUndefined();
    });

    it('should convert errors.current null to undefined', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(result.errors.current).toBeUndefined();
    });
  });

  describe('validation section', () => {
    it('should extract gatesPassed as string[]', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(Array.isArray(result.validation.gatesPassed)).toBe(true);
    });

    it('should extract autoFixesApplied as string[]', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(Array.isArray(result.validation.autoFixesApplied)).toBe(true);
    });
  });

  describe('task tracking section', () => {
    it('should extract blocked as string[]', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(Array.isArray(result.tasks.blocked)).toBe(true);
    });

    it('should extract failed as string[]', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(Array.isArray(result.tasks.failed)).toBe(true);
    });
  });

  describe('checkpoints', () => {
    it('should extract checkpoints as array', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(Array.isArray(result.checkpoints)).toBe(true);
      expect(result.checkpoints).toHaveLength(1);
    });

    it('should have correctly structured checkpoint', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      const cp = result.checkpoints[0];
      expect(cp.phase).toBe('feature-created');
      expect(cp.completedAt).toBe('2026-02-18T16:29:30Z');
      expect(cp.completedBy).toBe('feature-agent');
    });
  });

  describe('errors section', () => {
    it('should extract errors.history as string[]', () => {
      const result = parser.parseFeatureStatusYaml(featureContent);
      expect(Array.isArray(result.errors.history)).toBe(true);
    });
  });

  it('should have BaseEntity fields (id, createdAt, updatedAt)', () => {
    const result = parser.parseFeatureStatusYaml(featureContent);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });
});
