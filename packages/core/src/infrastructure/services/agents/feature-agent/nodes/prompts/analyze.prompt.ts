/**
 * Analyze Phase Prompt
 *
 * Instructs the agent to analyze the repository and user query,
 * then write findings to spec.yaml with complexity estimate and affected areas.
 */

import { readSpecFile, buildCommitPushBlock } from '../node-helpers.js';
import { buildProjectMemorySection } from './project-memory-section.js';
import type { FeatureAgentState } from '../../state.js';

export function buildAnalyzePrompt(state: FeatureAgentState): string {
  const existingSpec = readSpecFile(state.specDir, 'spec.yaml');

  return `You are a senior software architect performing the ANALYSIS phase of feature development.

${buildProjectMemorySection(state)}## Your Task

1. Read and understand the feature request from the spec below
2. Explore this repository thoroughly — understand the project structure, architecture, key technologies, patterns, and conventions
3. Assess complexity and identify which areas of the codebase are affected
4. Write your complete analysis to the spec YAML file

## Feature Request (from spec.yaml)

${existingSpec || `Feature ID: ${state.featureId}`}

## What to Analyze

- **Project structure**: directories, modules, layers, organization patterns
- **Architecture**: design patterns, dependency flow, separation of concerns
- **Technologies**: languages, frameworks, libraries, build tools
- **Conventions**: naming, file organization, testing patterns, code style
- **Affected areas**: which parts of the codebase this feature will touch and why
- **Dependencies**: existing code/libraries this feature depends on
- **Complexity**: estimate effort as S (hours), M (days), L (week+), XL (multi-week)

## Output Instructions

Write your analysis to: ${state.specDir}/spec.yaml

You MUST write the COMPLETE file (not a partial update). Preserve the existing name/number/branch fields and update everything else. Use this YAML structure:

  name: (keep existing — string)
  number: (keep existing — MUST be a bare integer, e.g. 2, NOT "002" or "2")
  branch: (keep existing — string)
  oneLiner: (concise one-line description of the feature)
  summary: >
    (2-3 sentence summary of what this feature involves based on your analysis)
  phase: Analysis
  sizeEstimate: (S | M | L | XL)

  relatedFeatures: []

  technologies:
    - (list each technology relevant to implementing this feature)

  relatedLinks:
    - title: '(Human-readable title for the resource)'
      url: '(URL to external documentation or reference)'

  openQuestions: []

  content: |
    ## Problem Statement

    (What problem does this feature solve? Reference specific current limitations.)

    ## Codebase Analysis

    ### Project Structure
    (Key directories, their purposes, and how they relate)

    ### Architecture Patterns
    (Design patterns, dependency rules, layering)

    ### Relevant Technologies
    (Frameworks and libraries in use that are relevant to this feature)

    ## Affected Areas

    | Area | Impact | Reasoning |
    | ---- | ------ | --------- |
    | (path/module) | (High/Medium/Low) | (why this area is affected) |

    ## Dependencies

    (What existing code, libraries, or infrastructure does this feature depend on?)

    ## Size Estimate

    **(S/M/L/XL)** — (justify your estimate with specific reasoning)

## YAML Output Rules

**CRITICAL:** When writing YAML files, you MUST follow these rules to ensure valid YAML:

1. **Wrap all string values in double quotes** — this prevents YAML parsing errors from special characters
2. **Escape internal double quotes with backslash** — use \\" inside quoted strings
3. **Use block scalars (\`|\`) for multi-line text** — this avoids escaping complexity

**Example (incorrect → correct):**
- ❌ \`text: it's broken\` → ✅ \`text: "it's broken"\` or \`text: |\\n  it's broken\`
- ❌ \`message: say "hello"\` → ✅ \`message: "say \\"hello\\""\`
- ❌ \`description: line1\\nline2\` → ✅ \`description: |\\n  line1\\n  line2\`

## Constraints

- Write ONLY to ${state.specDir}/spec.yaml
- Do NOT create any other files
- Do NOT modify any source code
- Do NOT start implementing the feature
- Keep your analysis thorough but concise

${
  state.commitSpecs
    ? buildCommitPushBlock({
        push: state.push,
        files: [`${state.specDir}/spec.yaml`],
        commitHint: 'docs(specs): analyze repository and define spec',
        skipVerification: true,
      })
    : `## Git Operations\n\nDo NOT commit or push any spec files. Spec files are managed locally only.`
}`;
}
