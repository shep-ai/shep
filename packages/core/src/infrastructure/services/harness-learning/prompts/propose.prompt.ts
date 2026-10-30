/**
 * The INV and DOM proposer missions (spec 150).
 *
 * Adapted from Harness² `core/prompts.py` `_INV_TEMPLATE` / `_DOM_TEMPLATE` /
 * `propose` (© 2026 Google LLC, Apache-2.0) — see NOTICE.md.
 */

import { HarnessEditDimension } from '../../../../domain/generated/output.js';
import type { ImproverStageSpec } from '../../../../application/ports/output/services/harness-improver.interface.js';
import {
  ANSWER_FREE,
  CONTEXT_LAYOUT,
  EVIDENCE_BOUNDARY,
  GENERALIZE,
  KEEP_BASE,
  UNTESTED,
  WORK,
  surface,
  tidy,
} from './shared-blocks.js';

const INV = `# YOUR DIMENSION: INV — how the agent WORKS

You own procedure, tool use and completion — not what the code should do. Trace the workflow, find
its earliest observed divergence, and match each failure to the cheapest effective component:

- TOOL ERROR: tell bad input from a timeout, a missing capability, a permission or unread output.
  Give one bounded fallback and a stop condition; never prescribe blind repetition.
- MECHANICAL REPETITION: a \`scripts/<name>\` helper for repeated deterministic work (running the
  right checks, regenerating code, formatting) with clear inputs, outputs and failure behaviour.
- TRIGGERED WORKFLOW: an on-demand skill for a narrow multi-step procedure, named in always-on text.
- IGNORED INVARIANT: only repeated evidence that clear prose is skipped justifies a defensive hook.
  It must not block valid completion.
- ORDINARY SEQUENCING: concise always-on guidance. Do not add code for a one-off mistake.

Define "done": which checks must pass locally before the agent hands work to CI, and reopen or
re-run what a successful write call did not prove.

Do not add domain rules about this codebase's design. A parallel candidate owns them; stay on how
the agent works.`;

const DOM = `# YOUR DIMENSION: DOM — what a PRACTITIONER of this repository knows

You own the practitioner model the agent lacked: the architecture and its layering rules, where
each kind of change belongs, conventions that reviewers or CI enforced, generated files and how to
regenerate them, and the relationships that must stay consistent (a schema and its migration, a
model and its fixtures, a string and its translations).

Turn it into checkable rules:
- CHANGE CONTRACT: for a recognisable kind of change, every place it must touch.
- DECISION RULE: the trigger, the evidence, the conflict to resolve.
- ENCODING: choose the FORM deliberately. A skill is the default home for knowledge with a trigger
  ("when adding a database column…"). \`memory.md\` holds short durable facts that apply to every
  feature. Never store this feature's facts.

Never invent a command, path, convention or API: assert only what the evidence shows.

Do not diagnose retries, reading order, budgeting, scripts or hooks. A parallel candidate owns
procedure; stay on practitioner knowledge.`;

function howToDecide(spec: ImproverStageSpec): string {
  const lines = [
    '# HOW TO DECIDE WHAT TO CHANGE',
    '',
    'Every edit must trace to a moment in the evidence. For each one ask: which call did what, and would',
    'this text have changed it? If you cannot name the moment, the edit is speculation. Prefer, in order:',
    "  1. a person's gate feedback or a CI failure — the work was judged and found wanting;",
    '  2. a repeated concrete failure — the same error or omission more than once;',
    '  3. a risk visible in a trajectory but not yet realised.',
    'Do not fix what the run already got right, and do not restate what the harness already says.',
  ];
  if (spec.k > 1 && !spec.sequential) {
    lines.push(
      '',
      `You are candidate ${spec.index} of ${spec.k} on this dimension, drawn independently.`
    );
  }
  if (spec.sequential) {
    lines.push(
      '',
      `This is round ${spec.index} of ${spec.k}. You edit the checkpoint the previous round produced, and`,
      'the evidence includes every earlier round. KEEP_BASE keeps that checkpoint.'
    );
  }
  lines.push(
    '',
    'Commit to the single most defensible version of your dimension; a later stage compares and merges.'
  );
  return lines.join('\n');
}

export function proposeMission(spec: ImproverStageSpec): string {
  const dimension = spec.dimension === HarnessEditDimension.Dom ? DOM : INV;
  return tidy([
    "You are adapting an autonomous coding agent's harness.",
    WORK,
    dimension,
    GENERALIZE,
    howToDecide(spec),
    KEEP_BASE,
    spec.untested && UNTESTED,
    CONTEXT_LAYOUT,
    ANSWER_FREE,
    EVIDENCE_BOUNDARY,
    surface(spec.alwaysOnCharCap),
  ]);
}
