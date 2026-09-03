/**
 * Implement Phase Prompt
 *
 * Builds per-phase implementation prompts that include full spec/research/plan
 * context plus the specific tasks for the current phase, with TDD guidance
 * and verification instructions.
 */

import { readSpecFile } from '../node-helpers.js';
import { normalizeTaskComplexity } from '@/domain/shared/model-tier.js';
import { buildProjectMemorySection } from './project-memory-section.js';
import type { FeatureAgentState } from '../../state.js';
import { COMMIT_CO_AUTHOR } from '../../../../git/pr-branding.js';

export interface PhaseTask {
  id: string;
  phaseId?: string;
  title: string;
  description: string;
  state: string;
  dependencies: string[];
  acceptanceCriteria: string[];
  tdd: { red: string[]; green: string[]; refactor: string[] } | null;
  estimatedEffort: string;
  /**
   * Complexity assigned by the planning agent. Typed loosely because it is read
   * straight out of LLM-authored YAML — `classifyTaskComplexity` normalizes it.
   */
  complexity?: string;
}

export interface PlanPhase {
  id: string;
  name: string;
  description?: string;
  parallel: boolean;
  /** Optional — if absent, tasks are matched via their phaseId field */
  taskIds?: string[];
}

export interface PlanYaml {
  phases: PlanPhase[];
}

export interface TasksYaml {
  tasks: PhaseTask[];
}

function formatTaskSection(task: PhaseTask): string {
  let section = `### Task ${task.id}: ${task.title}\n${task.description}\n`;

  // Surfacing the planner's complexity rating tells the agent how much design
  // latitude the task carries — and it is the same signal that chose the model
  // now running this prompt, so the two stay consistent.
  const complexity = normalizeTaskComplexity(task.complexity);
  if (complexity) {
    section += `\n**Complexity:** ${complexity}\n`;
  }

  section += `\n**Acceptance Criteria:**\n`;
  for (const criterion of task.acceptanceCriteria) {
    section += `- ${criterion}\n`;
  }

  if (task.tdd) {
    section += `\n**TDD Guidance:**\n`;
    const toArr = (v: string | string[] | null | undefined): string[] =>
      Array.isArray(v) ? v : v ? [v] : [];
    const red = toArr(task.tdd.red);
    const green = toArr(task.tdd.green);
    const refactor = toArr(task.tdd.refactor);
    if (red.length) section += `- Write tests for: ${red.join('; ')}\n`;
    if (green.length) section += `- Implement: ${green.join('; ')}\n`;
    if (refactor.length) section += `- Then consider: ${refactor.join('; ')}\n`;
  }

  if (task.dependencies?.length) {
    section += `\nDepends on: ${task.dependencies.join(', ')}\n`;
  }

  return section;
}

/**
 * Build the implementation prompt for a single phase (or a single task
 * within a parallel phase). Includes full project context so each
 * executor session is self-contained.
 */
export function buildImplementPhasePrompt(
  state: FeatureAgentState,
  phase: PlanPhase,
  tasks: PhaseTask[],
  context: { isLastPhase: boolean; phaseIndex: number; totalPhases: number }
): string {
  const specContent = readSpecFile(state.specDir, 'spec.yaml');
  const researchContent = readSpecFile(state.specDir, 'research.yaml');
  const planContent = readSpecFile(state.specDir, 'plan.yaml');
  const cwd = state.worktreePath || state.repositoryPath;

  const taskSections = tasks.map(formatTaskSection).join('\n');

  const verificationBlock = context.isLastPhase
    ? `4. Run full project validation:
   - Run the test suite (all tests must pass)
   - Run the linter (no lint errors)
   - Run the type checker (no type errors)
   - Discover the correct commands by inspecting package.json or the project's build tooling
   - Fix any issues before finishing`
    : `4. Run tests relevant to what you changed:
   - Run targeted tests for the modified files
   - Discover the correct test command by inspecting package.json or the project's build tooling
   - Fix any test failures before moving on`;

  return `You are a senior software engineer performing autonomous implementation.
You are executing phase ${context.phaseIndex + 1} of ${context.totalPhases}: "${phase.name}".

${buildProjectMemorySection(state)}## Feature Specification

\`\`\`yaml
${specContent}
\`\`\`

## Research Decisions

\`\`\`yaml
${researchContent}
\`\`\`

## Implementation Plan

\`\`\`yaml
${planContent}
\`\`\`

## Your Tasks for This Phase: "${phase.name}"

${taskSections}

## Implementation Instructions

1. Work through each task in dependency order
2. For tasks with TDD guidance: write tests alongside implementation following the hints provided — use them as guidance, not rigid steps
3. Follow existing codebase conventions for file placement, naming patterns, and architecture layers
${verificationBlock}
5. Commit your work with descriptive conventional commit messages and include the Shep Bot co-author trailer:
   - e.g. \`git commit -m "feat(scope): description" -m "" -m "${COMMIT_CO_AUTHOR}"\`
   - Do NOT include any other Co-Authored-By trailer (e.g. Claude) — only the Shep Bot trailer above
   - Commit incrementally as you complete logical units of work — do NOT wait until the end
   - Each commit should be a coherent, working unit
   - It is CRITICAL that all implementation code is committed before this phase ends — evidence collection runs next and needs a clean working tree${state.push ? `\n6. Push to remote after committing: \`git push -u origin HEAD\`\n   - Do NOT wait for or watch CI — just push and finish` : ''}

## Working Directory

${cwd}

## Constraints

- Implement ONLY the tasks listed above — do not work ahead to future phases
- Follow existing codebase conventions and architecture patterns
- Do NOT modify any spec YAML files (spec.yaml, research.yaml, plan.yaml, tasks.yaml, feature.yaml)
- Do NOT skip writing tests for tasks that have TDD guidance
- Keep changes focused and minimal — avoid unnecessary refactoring beyond what the tasks specify`;
}

/**
 * Build the prompt used when re-entering `implement` after the user rejected
 * the merge with feedback. All phases are already implemented at this point,
 * so this is a single focused pass to address the feedback rather than a
 * replay of the full per-phase plan.
 */
export function buildImplementRejectionFixPrompt(
  state: FeatureAgentState,
  rejectionSection: string
): string {
  const specContent = readSpecFile(state.specDir, 'spec.yaml');
  const researchContent = readSpecFile(state.specDir, 'research.yaml');
  const planContent = readSpecFile(state.specDir, 'plan.yaml');
  const cwd = state.worktreePath || state.repositoryPath;

  return `You are a senior software engineer performing autonomous implementation.
Implementation of this feature previously completed, but the user rejected it at the merge review stage.
${rejectionSection}
${buildProjectMemorySection(state)}## Feature Specification

\`\`\`yaml
${specContent}
\`\`\`

## Research Decisions

\`\`\`yaml
${researchContent}
\`\`\`

## Implementation Plan

\`\`\`yaml
${planContent}
\`\`\`

## Instructions

1. Address the rejection feedback above by modifying the existing implementation
2. Follow existing codebase conventions for file placement, naming patterns, and architecture layers
3. Run the test suite, linter, and type checker — all must pass
   - Discover the correct commands by inspecting package.json or the project's build tooling
   - Fix any issues before finishing
4. Commit your work with descriptive conventional commit messages and include the Shep Bot co-author trailer:
   - e.g. \`git commit -m "fix(scope): description" -m "" -m "${COMMIT_CO_AUTHOR}"\`
   - Do NOT include any other Co-Authored-By trailer (e.g. Claude) — only the Shep Bot trailer above
   - It is CRITICAL that all changes are committed before this phase ends

## Working Directory

${cwd}

## Constraints

- Address ONLY the rejection feedback above — do not work ahead or make unrelated changes
- Follow existing codebase conventions and architecture patterns
- Do NOT modify any spec YAML files (spec.yaml, research.yaml, plan.yaml, tasks.yaml, feature.yaml)
- Keep changes focused and minimal — avoid unnecessary refactoring beyond what the feedback requires`;
}
