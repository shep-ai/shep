/**
 * Plan Phase Prompt
 *
 * Instructs the agent to create an implementation plan (plan.yaml) and
 * a task breakdown (tasks.yaml) from the spec and research.
 * The plan covers architecture decisions and rationale.
 * The tasks cover concrete TDD work items.
 */

import yaml from 'js-yaml';
import { readSpecFile, buildCommitPushBlock } from '../node-helpers.js';
import { buildProjectMemorySection } from './project-memory-section.js';
import type { FeatureAgentState } from '../../state.js';

export function buildPlanPrompt(state: FeatureAgentState): string {
  const specContent = readSpecFile(state.specDir, 'spec.yaml');
  const researchContent = readSpecFile(state.specDir, 'research.yaml');

  // Extract plan-specific rejection feedback from spec.yaml
  let rejectionFeedbackSection = '';
  try {
    const specData = yaml.load(specContent) as Record<string, unknown> | null;
    const rejectionFeedback = specData?.rejectionFeedback as
      | { iteration: number; message: string; phase?: string; timestamp: string }[]
      | undefined;
    if (rejectionFeedback && rejectionFeedback.length > 0) {
      // Filter to plan-phase rejections only
      const planRejections = rejectionFeedback.filter((e) => e.phase === 'plan');
      if (planRejections.length > 0) {
        const latest = planRejections[planRejections.length - 1];
        const older = planRejections.slice(0, -1);
        const olderSection =
          older.length > 0
            ? `\n### Earlier feedback (for context only)\n${older.map((e) => `- Iteration ${e.iteration}: ${e.message}`).join('\n')}\n`
            : '';
        rejectionFeedbackSection = `
## ⚠️ CRITICAL — User Rejection Feedback (MUST ADDRESS)

**YOUR PRIMARY TASK: The user rejected the previous result and gave this feedback. You MUST act on it:**

> ${latest.message}

(Iteration ${latest.iteration}, ${latest.timestamp})

Do NOT just record this feedback — you must actually make the changes the user requested.
${olderSection}
`;
      }
    }
  } catch {
    // If YAML parsing fails, continue without rejection feedback
  }

  return `You are a software architect performing the PLANNING phase of feature development.
${rejectionFeedbackSection}

${buildProjectMemorySection(state)}## Your Task

1. Read the feature spec (with requirements) and research findings
2. Create a high-level implementation plan with architecture decisions, phases, and rationale
3. Break the work into ordered tasks with TDD cycles (RED-GREEN-REFACTOR)
4. Write the plan to plan.yaml AND the task breakdown to tasks.yaml
5. plan.yaml covers strategy and architecture — tasks.yaml covers the concrete work items (no duplication)

## Feature Spec

${specContent}

## Research Findings

${researchContent}

## What to Produce

### Implementation Plan (plan.yaml) — Strategy & Architecture Only
- Architecture overview and how the feature fits the existing codebase
- Key design decisions with rationale (reference research where applicable)
- Implementation phases — high-level names and descriptions (NO individual task lists)
- Files to create and files to modify
- Risk mitigation strategies
- Do NOT include task breakdowns — those belong exclusively in tasks.yaml

### Task Breakdown (tasks.yaml)
- Concrete, ordered tasks that implement the plan
- Each task with TDD cycle: what test to write first (RED), minimal implementation (GREEN), cleanup (REFACTOR)
- Dependencies between tasks
- Acceptance criteria for each task
- Effort estimates

## Output Instructions

You MUST write TWO files:

### File 1: ${state.specDir}/plan.yaml

  name: (feature name)
  summary: >
    (Summary of the implementation approach and key decisions)

  relatedFeatures: []
  technologies:
    - (technologies needed)
  relatedLinks:
    - title: '(Human-readable title for the resource)'
      url: '(URL to external documentation or reference)'

  phases:
    - id: phase-1
      name: '(Phase Name — e.g., "Foundation & Domain Setup")'
      description: '(What this phase accomplishes and why it comes first)'
      parallel: false
    - id: phase-2
      name: '(Next Phase)'
      description: '(What this phase accomplishes)'
      parallel: false

  filesToCreate:
    - (path/to/new/file.ts)

  filesToModify:
    - (path/to/existing/file.ts)

  openQuestions: []

  content: |
    ## Architecture Overview

    (How the implementation fits the existing architecture.
    Reference specific patterns from the codebase.)

    ## Key Design Decisions

    (For each decision, explain what was chosen, what alternatives were considered,
    and why this approach is best. Reference research findings.)

    ## Implementation Strategy

    (High-level approach: phase ordering rationale, what comes first and why)

    ## Risk Mitigation

    | Risk | Mitigation |
    | ---- | ---------- |
    | (risk) | (how to handle it) |

### File 2: ${state.specDir}/tasks.yaml

  name: (feature name)
  summary: >
    (Summary: N tasks across M phases)

  relatedFeatures: []
  technologies: []
  relatedLinks:
    - title: '(Human-readable title for the resource)'
      url: '(URL to external documentation or reference)'

  tasks:
    - id: task-1
      phaseId: phase-1
      title: '(Task Title)'
      description: '(What this task accomplishes and why)'
      state: Todo
      dependencies: []
      acceptanceCriteria:
        - '(Specific, testable criterion)'
        - '(Another criterion)'
      tdd:
        red:
          - '(Write test that asserts X behavior)'
        green:
          - '(Implement minimal code to pass the test)'
        refactor:
          - '(Clean up: extract helpers, improve naming, etc.)'
      estimatedEffort: '(time estimate, e.g., 1h, 30min)'

    - id: task-2
      phaseId: phase-1
      title: '(Next Task)'
      description: '...'
      state: Todo
      dependencies:
        - task-1
      acceptanceCriteria:
        - '...'
      tdd:
        red:
          - '...'
        green:
          - '...'
        refactor:
          - '...'
      estimatedEffort: '...'

  totalEstimate: '(total estimated hours)'
  openQuestions: []

  content: |
    ## Summary

    (Brief narrative: what gets built, in what order, and why.
    Do NOT list individual tasks — the structured tasks array above is the source of truth.
    Instead, summarize the overall flow: "First we set up X, then wire Y, finally integrate Z.")

## YAML Output Rules

**CRITICAL:** When writing YAML files, you MUST follow these rules to ensure valid YAML:

1. **Wrap all string values in double quotes** — this prevents YAML parsing errors from special characters
2. **Escape internal double quotes with backslash** — use \\" inside quoted strings
3. **Use block scalars (\`|\`) for multi-line text** — this avoids escaping complexity

**Example (incorrect → correct):**
- ❌ \`description: it's a critical task\` → ✅ \`description: "it's a critical task"\` or \`description: |\\n  it's a critical task\`
- ❌ \`title: Add "strict" validation\` → ✅ \`title: "Add \\"strict\\" validation"\`
- ❌ \`red: Write test that checks X\\nand Y\` → ✅ \`red: |\\n  Write test that checks X\\n  and Y\`

## Constraints

- Write to BOTH ${state.specDir}/plan.yaml AND ${state.specDir}/tasks.yaml
- Every code task MUST have TDD cycles (red/green/refactor) — non-code tasks (installs, docs) can set tdd: null
- Tasks must be ordered by dependency — no task should depend on a later task
- Each phase should group logically related tasks
- Prefer small, focused tasks over large monolithic ones
- Follow existing codebase conventions for file placement and naming
- Do NOT create any other files
- Do NOT modify any source code
- Do NOT start implementing — planning only

${
  state.commitSpecs
    ? buildCommitPushBlock({
        push: state.push,
        files: [`${state.specDir}/plan.yaml`, `${state.specDir}/tasks.yaml`],
        commitHint: 'docs(specs): create implementation plan and task breakdown',
        skipVerification: true,
      })
    : `## Git Operations\n\nDo NOT commit or push any spec files. Spec files are managed locally only.`
}`;
}
