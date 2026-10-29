/**
 * The experience (reflection) mission (spec 150): what each edit did, and at
 * most one lesson that transfers.
 *
 * Adapted from Harness² `core/prompts.py` `experience` (© 2026 Google LLC,
 * Apache-2.0) — see NOTICE.md.
 */

import type { ImproverStageSpec } from '../../../../application/ports/output/services/harness-improver.interface.js';
import { ANSWER_FREE, EVIDENCE_BOUNDARY, WORK, tidy } from './shared-blocks.js';

export function experienceMission(spec: ImproverStageSpec): string {
  return tidy([
    'You are reading the complete record of one improvement round: a base harness, the edits proposed against it, the evidence behind them, and the harness that was composed. Write two things for a library that future refinements in this repository read before they make their own edits.',
    WORK,
    `# WHAT YOU HAVE

    context/base_harness/      the harness before this round
    context/harness/           the composed candidate
    context/pool/<label>/      every candidate and, when probed, its execution
    context/decisions.md       each stage's notes
    context/adoption.md        why the composed candidate was produced (or chosen)
    context/run/, context/trajectories/, context/task.md   the run's evidence`,
    `# THE COMPOSED CANDIDATE IS NOT THE ONLY EVIDENCE

Treat every candidate as evidence. An edit that appeared only in a dropped candidate may be the one
that changed behaviour, and an edit inside the composed candidate may have contributed nothing.
Read the executions, not the verdict.`,
    `# WHAT EACH EDIT DID

Diff every candidate against \`context/base_harness/\`. For each component any candidate changed,
write one row: the component, what the edit changed, the execution difference it produced, and a
verdict: \`helped\`, \`hurt\`, \`no observed effect\`, \`confounded\` or \`untested\`.
${
  spec.untested
    ? 'IN THIS ROUND NO EDITED HARNESS WAS EXECUTED: every row is `untested`; `observed` names the moment in the run that motivated the edit.'
    : 'Prefer `confounded` whenever a candidate changed several components at once and no execution isolates one of them, or a single execution is all that stands behind the difference. An invented attribution poisons the library.'
}`,
    `# THE ONE LESSON THAT TRANSFERS

Write at most one durable entry, and only if the rows support it. The \`cue\` is the SHAPE OF
SITUATION it applies to, so it can fire on a different feature — not this feature's facts. The
\`lesson\` is the operation to perform on a harness, naming the component. Too generic is useless
("be thorough"); too specific never fires again. The \`evidence\` field cites the rows. A lesson
resting only on \`confounded\` or \`untested\` rows is a hypothesis: say so in \`confidence\`. If
nothing reusable is shown, write the single line NO_ENTRY in place of the <experience> block.`,
    ANSWER_FREE,
    EVIDENCE_BOUNDARY,
    `# OUTPUT FORMAT

<edits>
component: <path as it appears in the harness tree>
candidates: <the labels that carried this edit>
change: <what the edit did>
observed: <the execution difference, and where you saw it>
verdict: <helped|hurt|no observed effect|confounded|untested>
(repeat these five lines for each changed component)
</edits>

<experience>
cue: <the shape of situation this applies to>
lesson: <the transferable operation, naming the component>
evidence: <the rows this rests on>
confidence: <high|medium|low, and why>
</experience>`,
  ]);
}
