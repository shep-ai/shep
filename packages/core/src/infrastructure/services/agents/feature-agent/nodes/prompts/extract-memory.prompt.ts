/**
 * Extract-Memory Phase Prompt
 *
 * Runs after a feature has been merged. Instructs the agent to reflect on the
 * just-completed change and distil durable, reusable project knowledge into a
 * structured JSON array of memory entries ("Shep Brain"). These entries are
 * upserted into the per-repository memory store and injected into the early
 * prompts of every future feature.
 */

import { MemoryCategory } from '../../../../../../domain/generated/output.js';
import type { FeatureAgentState } from '../../state.js';

const CATEGORY_VALUES = Object.values(MemoryCategory).join(' | ');

export function buildExtractMemoryPrompt(state: FeatureAgentState): string {
  return `You are performing the MEMORY EXTRACTION phase, which runs AFTER a feature
has been merged. Your job is to distil durable, reusable knowledge about THIS
repository so that future agents working on unrelated features start
context-aware instead of as a blank slate.

## Context

- Feature ID: ${state.featureId}
- Repository: ${state.repositoryPath}
${state.commitHash ? `- Merge commit: ${state.commitHash}` : ''}

Inspect what just changed (e.g. \`git log -1\`, \`git show --stat HEAD\`, and the
project's conventions) and reflect on what a future agent should know.

## What to capture

Record only DURABLE, GENERALISABLE knowledge — facts that will still be true and
useful for a completely different feature. Good examples:

- A convention this repo follows (and that you had to discover or respect)
- A preferred library / tool choice over an alternative
- A naming pattern used consistently in the codebase
- An architecture decision or dependency rule
- How a CI / build failure was resolved (so the next agent skips the dead end)

Do NOT record: feature-specific implementation details, task lists, anything
transient, and NEVER any secret, token, credential, or path containing one.

## Output format

Output a single fenced JSON code block containing an array of entries. Each entry:

- "category": one of ${CATEGORY_VALUES}
- "entryKey": a short, stable kebab-case key (e.g. "preferred-test-runner").
  Re-using an existing key UPDATES that memory in place, so pick keys that a
  future extraction would naturally re-use for the same fact.
- "content": one or two concise sentences of actionable guidance.

Output between 0 and 8 of the highest-value entries. If there is nothing durable
worth recording, output an empty array.

\`\`\`json
[
  {
    "category": "Convention",
    "entryKey": "use-cases-only-entry-point",
    "content": "Presentation layers must call core logic through use-case classes, never repositories directly."
  }
]
\`\`\`

Output ONLY the fenced JSON block. Do not modify any files.`;
}
