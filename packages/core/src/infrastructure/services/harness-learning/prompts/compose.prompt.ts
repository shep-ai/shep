/**
 * The composer missions (spec 150): parallel aggregation and sequential rounds.
 *
 * Adapted from Harness² `core/prompts.py` `aggregate` / `compose_round`
 * (© 2026 Google LLC, Apache-2.0) — see NOTICE.md.
 */

import type { ImproverStageSpec } from '../../../../application/ports/output/services/harness-improver.interface.js';
import {
  ANSWER_FREE,
  CONTEXT_LAYOUT,
  EVIDENCE_BOUNDARY,
  KEEP_BASE,
  UNTESTED,
  WORK,
  surface,
  tidy,
} from './shared-blocks.js';

const POOL_LAYOUT = `  context/pool/<label>/harness/   each candidate harness (inv*, dom*, earlier rounds)
  context/pool/<label>/run.md     its execution, when it was probed (Explore mode)
  context/decisions.md            each candidate's own notes`;

const WEIGH = `# HOW TO WEIGH THE EVIDENCE

- A failure that repeats across the evidence is a real property of the current harness and the
  strongest thing you can act on. A defect seen once is noise; an edit aimed at it overfits.
- Candidates were drawn from the same evidence and share model biases: agreement is support, not
  proof; contradiction is a reason to read the trajectories, not to vote.
- Judge the downside as heavily as the upside. The costliest failure is a run that produces
  nothing or breaks CI; an edit that risks that elsewhere is a bad edit.
- If a probe associated with an edit produced nothing or failed its checks, say so and treat the
  edit as UNSAFE unless the rest of the evidence is overwhelming.`;

const NOTES_FORMAT = `# NOTES FORMAT

In your single \`<notes>\` block, one line per decision, in this shape:

    kept|revised|dropped -> <which edit> -> <the evidence that decided it, with counts where sets are involved>

A decision without evidence attached is a decision the next reader cannot audit.`;

export function composeMission(spec: ImproverStageSpec): string {
  const final = !spec.sequential || spec.index >= spec.k;
  const job = spec.sequential
    ? [
        `# YOUR JOB\n\n${final ? 'Compose THE FINAL harness, from the whole history.' : `Compose checkpoint ${spec.index} of ${spec.k}, which the next round builds on.`}`,
        'All of these are valid: MERGE across rounds (including a candidate rejected earlier, if later',
        'evidence argues for it); REPRODUCE an earlier checkpoint that later rounds drifted from; ADOPT',
        "this round's best candidate; KEEP_BASE (keep the checkpoint in `context/harness/`).",
      ].join('\n')
    : [
        '# YOUR JOB',
        '',
        'Compose ONE harness. All of these are valid, judged only on what the evidence supports:',
        '- MERGE across candidates — expected when an INV edit and a DOM edit each earn their place.',
        '  Resolve overlaps rather than concatenating.',
        '- ADOPT ONE WHOLESALE if a single candidate is simply the best state.',
        '- KEEP_BASE.',
        ...(spec.k > 1
          ? [
              '',
              `You are one of ${spec.k} composers working from this evidence in parallel; commit to the harness you can defend.`,
            ]
          : []),
      ].join('\n');

  return tidy([
    'You are composing the harness that a person will be asked to adopt for this repository. Every rule that bound the candidate proposers binds you — you are the last gate, and merging an edit launders it.',
    WORK,
    WEIGH,
    job,
    KEEP_BASE,
    spec.untested && UNTESTED,
    `${CONTEXT_LAYOUT}\n${POOL_LAYOUT}`,
    ANSWER_FREE,
    EVIDENCE_BOUNDARY,
    surface(spec.alwaysOnCharCap),
    NOTES_FORMAT,
  ]);
}
