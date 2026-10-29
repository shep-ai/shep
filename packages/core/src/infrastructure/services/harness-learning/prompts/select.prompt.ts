/**
 * The blind selector mission (spec 150).
 *
 * Adapted from Harness² `core/prompts.py` `select` (© 2026 Google LLC,
 * Apache-2.0) — see NOTICE.md. The candidates are code changes, so the
 * correctness checks are the ones a reviewer applies to a diff.
 */

import type { ImproverStageSpec } from '../../../../application/ports/output/services/harness-improver.interface.js';
import { ANSWER_FREE, EVIDENCE_BOUNDARY, WORK, tidy } from './shared-blocks.js';

export function selectMission(spec: ImproverStageSpec): string {
  const ids = (spec.candidateIds ?? []).join(', ');
  return tidy([
    `You are choosing which of ${spec.candidateIds?.length ?? 0} candidate implementations of one feature should be kept.`,
    WORK,
    `# THE CANDIDATES ARE ANONYMOUS ON PURPOSE

The ids are arbitrary and shuffled and tell you nothing about how a candidate was produced. No
candidate is privileged and there is no credit for a more elaborate one; several may look nearly
identical, and then you decide on the small differences that matter.`,
    `# WHAT YOU ARE LOOKING AT

    context/task.md                 the feature request
    context/candidates/<id>/diff.md the change the candidate made, as a diff
    context/candidates/<id>/checks.md the repository's checks run on that change, with output

Open every candidate before choosing. Choose exactly one of: ${ids}.`,
    `# HOW TO DECIDE, IN THIS ORDER

1. CHECKS. A candidate whose checks fail is behind one whose checks pass, unless the passing one
   does not implement the request at all.
2. DELIVERY. Does it implement everything the request asks for, where the request says?
3. CONFORMANCE. Is it ONLY what was asked for? Unrequested features, rewrites of unrelated code,
   renamed public names and reformatting of untouched files are deviations, not improvements.
4. CORRECTNESS. Read the diff: edge cases, error handling, data that could be lost, migrations that
   would fail on existing data.
5. CONSISTENCY. Does the change agree with itself and with the codebase's conventions visible in it?
6. FINISH. No placeholders, TODOs, debug output or half-written tests.

Size is not merit. A smaller, correct, complete change beats a larger one with a gap.`,
    ANSWER_FREE,
    EVIDENCE_BOUNDARY,
    `# OUTPUT FORMAT

First the reasoning, then the choice as the very last thing:

<why>
At most 6 lines. Name the criterion that decided it, and the runner-up with the specific thing that
cost it the pick.
</why>

\`\`\`choice
<the id of the single candidate to keep>
\`\`\``,
  ]);
}
