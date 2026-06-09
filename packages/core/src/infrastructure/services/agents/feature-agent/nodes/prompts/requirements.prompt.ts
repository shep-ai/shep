/**
 * Requirements Phase Prompt
 *
 * Instructs the agent to build comprehensive requirements from the analysis,
 * including product questions with structured QuestionOption[] arrays
 * and AI-recommended default answers.
 * Writes back to spec.yaml with full requirements.
 */

import yaml from 'js-yaml';
import { readSpecFile, buildCommitPushBlock } from '../node-helpers.js';
import { buildProjectMemorySection } from './project-memory-section.js';
import type { FeatureAgentState } from '../../state.js';

export function buildRequirementsPrompt(state: FeatureAgentState): string {
  const specContent = readSpecFile(state.specDir, 'spec.yaml');

  // Extract rejection feedback if present
  let rejectionFeedbackSection = '';
  try {
    const specData = yaml.load(specContent) as Record<string, unknown> | null;
    const rejectionFeedback = specData?.rejectionFeedback as
      | {
          iteration: number;
          message: string;
          phase?: string;
          timestamp: string;
        }[]
      | undefined;
    if (rejectionFeedback && rejectionFeedback.length > 0) {
      // Filter to requirements-phase rejections (or legacy entries without phase)
      const reqRejections = rejectionFeedback.filter((e) => !e.phase || e.phase === 'requirements');
      if (reqRejections.length > 0) {
        const latest = reqRejections[reqRejections.length - 1];
        const older = reqRejections.slice(0, -1);
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

  return `You are a product analyst performing the REQUIREMENTS phase of feature development.
${rejectionFeedbackSection}
${buildProjectMemorySection(state)}## Your Task

1. Read the current spec with codebase analysis below
2. Build a complete set of functional and non-functional requirements
3. Define clear, measurable success criteria
4. Identify product decisions that need input — for EACH one, provide your AI-recommended default answer with rationale
5. Update the spec YAML file with the full requirements

## Current Spec (with analysis)

${specContent}

## What to Produce

### Requirements
- **Functional requirements (FR-N)**: what the system must DO
- **Non-functional requirements (NFR-N)**: performance, security, UX, maintainability constraints
- **Success criteria**: measurable checkboxes that define "done"

### Product Questions with Structured Options
For every ambiguous product decision, create an openQuestion entry with:
- A clear question
- resolved: true (your recommendation is the default)
- Structured options array with EXACTLY ONE option marked selected: true
- A selectionRationale explaining the recommendation
- An answer field containing the text of the selected option (for backward compatibility)

Each option MUST have:
- \`option\`: Short label for the approach (2-5 words)
- \`description\`: Explanation of this option's trade-offs and benefits
- \`selected\`: boolean — exactly ONE option per question must be true

The user can later review and override these defaults via interactive TUI.

## Output Instructions

Update the file at: ${state.specDir}/spec.yaml

Write the COMPLETE file. Preserve name/number/branch/technologies from analysis and update:

  name: (keep — string)
  number: (keep — MUST be a bare integer, e.g. 2, NOT "002" or "2")
  branch: (keep — string)
  oneLiner: (keep or refine)
  summary: >
    (keep or refine based on requirements)
  phase: Requirements
  sizeEstimate: (keep or update if scope changed)

  relatedFeatures: (keep)

  technologies:
    - (keep from analysis, add any new ones identified)

  relatedLinks: (keep)

  openQuestions:
    - question: 'Should X use approach A, B, or C?'
      resolved: true
      options:
        - option: 'Approach A'
          description: 'Benefits of A, when to use it, trade-offs'
          selected: true
        - option: 'Approach B'
          description: 'Benefits of B, when to use it, trade-offs'
          selected: false
      selectionRationale: 'Approach A is recommended because [detailed reasoning]'
      answer: 'Approach A'
    - question: 'What level of Y is needed?'
      resolved: true
      options:
        - option: 'Basic'
          description: 'Minimal implementation, fast to build'
          selected: false
        - option: 'Advanced'
          description: 'Full-featured, handles edge cases'
          selected: true
      selectionRationale: 'Advanced is recommended because [reasoning]'
      answer: 'Advanced'

  content: |
    ## Problem Statement

    (refined from analysis)

    ## Success Criteria

    - [ ] (measurable criterion 1)
    - [ ] (measurable criterion 2)
    - [ ] (etc.)

    ## Functional Requirements

    - **FR-1**: (requirement description)
    - **FR-2**: (requirement description)

    ## Non-Functional Requirements

    - **NFR-1**: (performance/security/UX requirement)
    - **NFR-2**: (etc.)

    ## Product Questions & AI Recommendations

    | # | Question | AI Recommendation | Rationale |
    | - | -------- | ----------------- | --------- |
    | 1 | (question) | (recommended answer) | (why) |

    ## Affected Areas

    (keep from analysis)

    ## Dependencies

    (keep from analysis, add any new ones)

    ## Size Estimate

    (keep or update with requirements-informed reasoning)

## YAML Output Rules

**CRITICAL:** When writing YAML files, you MUST follow these rules to ensure valid YAML:

1. **Wrap all string values in double quotes** — this prevents YAML parsing errors from special characters
2. **Escape internal double quotes with backslash** — use \\" inside quoted strings
3. **Use block scalars (\`|\`) for multi-line text** — this avoids escaping complexity

**Example (incorrect → correct):**
- ❌ \`description: it's required\` → ✅ \`description: "it's required"\` or \`description: |\\n  it's required\`
- ❌ \`rationale: must be "fast"\` → ✅ \`rationale: "must be \\"fast\\""\`
- ❌ \`content: line1\\nline2\` → ✅ \`content: |\\n  line1\\n  line2\`

## Constraints

- Write ONLY to ${state.specDir}/spec.yaml
- Every open question MUST have structured options with exactly ONE option marked selected: true
- Every open question MUST also have an \`answer\` field matching the selected option text
- Requirements must be specific and testable, not vague
- Do NOT create any other files
- Do NOT modify any source code

${
  state.commitSpecs
    ? buildCommitPushBlock({
        push: state.push,
        files: [`${state.specDir}/spec.yaml`],
        commitHint: 'docs(specs): define requirements and product questions',
        skipVerification: true,
      })
    : `## Git Operations\n\nDo NOT commit or push any spec files. Spec files are managed locally only.`
}`;
}
