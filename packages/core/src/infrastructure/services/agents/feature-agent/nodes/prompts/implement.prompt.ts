/**
 * Implement Phase Prompt
 *
 * Builds per-phase implementation prompts that include full spec/research/plan
 * context plus the specific tasks for the current phase, with TDD guidance
 * and verification instructions.
 */

import { readSpecFile } from '../node-helpers.js';
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

  section += `\n**Acceptance Criteria:**\n`;
  for (const criterion of task.acceptanceCriteria) {
    section += `- ${criterion}\n`;
  }

  if (task.tdd) {
    section += `\n**TDD Guidance:**\n`;
    if (task.tdd.red?.length) section += `- Write tests for: ${task.tdd.red.join('; ')}\n`;
    if (task.tdd.green?.length) section += `- Implement: ${task.tdd.green.join('; ')}\n`;
    if (task.tdd.refactor?.length) section += `- Then consider: ${task.tdd.refactor.join('; ')}\n`;
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

## Feature Specification

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
