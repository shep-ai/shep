/**
 * The feature an approved hypothesis becomes (spec 123): its name and the
 * prompt that makes the agent prove the cause with a failing test first.
 */

import type {
  Hypothesis,
  WorkItem,
  WorkItemInvestigation,
} from '../../../domain/generated/output.js';
import { workItemKey } from '../../../domain/shared/work-item-key.js';
import { boundedDescription } from './investigation-prompt.js';

const MAX_FEATURE_NAME_CHARS = 80;
const SHORT_SHA_LENGTH = 7;

export function fixFeatureName(item: WorkItem, hypothesis: Hypothesis): string {
  const name = `Fix ${workItemKey(item)}: ${hypothesis.title}`;
  return name.length > MAX_FEATURE_NAME_CHARS
    ? `${name.slice(0, MAX_FEATURE_NAME_CHARS - 1)}…`
    : name;
}

function evidenceLines(hypothesis: Hypothesis): string {
  if (hypothesis.evidence.length === 0) return '- (none cited)';
  return hypothesis.evidence
    .map(
      (e) => `- ${e.file}${e.line === undefined ? '' : `:${e.line}`}${e.note ? ` — ${e.note}` : ''}`
    )
    .join('\n');
}

export function buildFixPrompt(
  item: WorkItem,
  investigation: WorkItemInvestigation,
  hypothesis: Hypothesis
): string {
  const commit = investigation.commitSha
    ? ` at commit ${investigation.commitSha.slice(0, SHORT_SHA_LENGTH)}`
    : '';
  return `Fix bug ${workItemKey(item)}: ${item.title}

## Report

${boundedDescription(item)}

## Diagnosed root cause

An investigation of this repository${commit} concluded (${hypothesis.confidence} confidence):

${hypothesis.rootCause}

Evidence:
${evidenceLines(hypothesis)}

## How to fix it

1. Write the failing test first: ${hypothesis.testPlan}
   Run it and confirm it fails for the reason above. If it passes, the diagnosis is wrong: do
   not change production code; report what you found instead.
2. Fix: ${hypothesis.fixPlan}
3. Run the new test and the tests around the change, and confirm they pass.`;
}
