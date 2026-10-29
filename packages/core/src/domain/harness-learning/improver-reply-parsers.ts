/**
 * Parsers for improver, selector and reflector replies (spec 150).
 *
 * Every parser fails CLOSED: a reply in any shape it did not expect yields a
 * typed failure, never a default pick (LESSONS.md, "a gate that reads an LLM's
 * words must fail closed"). Reply formats follow Harness² prompts
 * (google-research/harness2, Apache-2.0).
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import { HarnessEditVerdict, LessonConfidence } from '../generated/output';

const NOTES_RE = /<notes>([\s\S]*?)<\/notes>/;
const CHOICE_RE = /```choice\s*\n?\s*([A-Za-z0-9_-]*)\s*\n?\s*```/g;
const WHY_RE = /<why>([\s\S]*?)<\/why>/;
const EDITS_RE = /<edits>([\s\S]*?)<\/edits>/;
const EXPERIENCE_RE = /<experience>([\s\S]*?)<\/experience>/;
const KEEP_BASE = 'KEEP_BASE';
const NO_ENTRY = 'NO_ENTRY';
const MAX_WHY_CHARS = 2000;

export function parseNotes(reply: string): string {
  const m = NOTES_RE.exec(reply);
  return (m ? m[1] : reply).trim();
}

export function isKeepBase(reply: string): boolean {
  return parseNotes(reply).includes(KEEP_BASE);
}

export type ChoiceResult = { ok: true; id: string; why: string } | { ok: false; reason: string };

export function parseChoice(reply: string, ids: readonly string[]): ChoiceResult {
  const picks = [...reply.matchAll(CHOICE_RE)].map((m) => m[1].trim()).filter(Boolean);
  if (picks.length === 0) return { ok: false, reason: 'no ```choice block in the reply' };
  if (new Set(picks).size > 1) {
    return { ok: false, reason: `the reply chose more than one candidate: ${picks.join(', ')}` };
  }
  const id = picks[0];
  if (!ids.includes(id)) {
    return { ok: false, reason: `chose ${id}, which is not one of ${ids.join(', ')}` };
  }
  const why = (WHY_RE.exec(reply)?.[1] ?? '').trim().slice(0, MAX_WHY_CHARS);
  return { ok: true, id, why };
}

export interface ParsedEditRow {
  component: string;
  candidates: string[];
  change: string;
  observed: string;
  verdict: HarnessEditVerdict;
}

const VERDICTS: Readonly<Record<string, HarnessEditVerdict>> = {
  helped: HarnessEditVerdict.Helped,
  hurt: HarnessEditVerdict.Hurt,
  'no observed effect': HarnessEditVerdict.NoObservedEffect,
  confounded: HarnessEditVerdict.Confounded,
  untested: HarnessEditVerdict.Untested,
};

function keyValueLines(block: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    out.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]);
  }
  return out;
}

/** Five-line rows starting at `component:`. An unknown verdict reads as confounded. */
export function parseEditRows(reply: string): ParsedEditRow[] {
  const block = EDITS_RE.exec(reply)?.[1];
  if (!block) return [];
  const rows: ParsedEditRow[] = [];
  let current: Partial<Record<string, string>> | undefined;
  const flush = () => {
    if (current?.component) {
      rows.push({
        component: current.component,
        candidates: (current.candidates ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        change: current.change ?? '',
        observed: current.observed ?? '',
        verdict: VERDICTS[(current.verdict ?? '').toLowerCase()] ?? HarnessEditVerdict.Confounded,
      });
    }
  };
  for (const [key, value] of keyValueLines(block)) {
    if (key === 'component') {
      flush();
      current = {};
    }
    if (current) current[key] = value;
  }
  flush();
  return rows;
}

export interface ParsedExperience {
  cue: string;
  lesson: string;
  evidence: string;
  confidence: LessonConfidence;
}

export type ExperienceResult =
  | { ok: true; experience: ParsedExperience }
  | { ok: false; reason: 'no-entry' | 'missing-block' | 'missing-field' };

const CONFIDENCES: Readonly<Record<string, LessonConfidence>> = {
  high: LessonConfidence.High,
  medium: LessonConfidence.Medium,
  low: LessonConfidence.Low,
};

export function parseExperience(reply: string): ExperienceResult {
  const block = EXPERIENCE_RE.exec(reply)?.[1];
  if (!block) {
    return { ok: false, reason: reply.includes(NO_ENTRY) ? 'no-entry' : 'missing-block' };
  }
  const fields = Object.fromEntries(keyValueLines(block));
  const { cue, lesson, evidence } = fields;
  if (!cue || !lesson || !evidence) return { ok: false, reason: 'missing-field' };
  const level = (fields.confidence ?? '').split(/[\s,(—-]/)[0].toLowerCase();
  return {
    ok: true,
    experience: { cue, lesson, evidence, confidence: CONFIDENCES[level] ?? LessonConfidence.Low },
  };
}

const SUPPORTING: ReadonlySet<HarnessEditVerdict> = new Set([
  HarnessEditVerdict.Helped,
  HarnessEditVerdict.Hurt,
  HarnessEditVerdict.NoObservedEffect,
]);

/**
 * A lesson resting only on untested or confounded rows is a guess: it can
 * never be more than Low confidence, whatever the reflector claimed.
 */
export function capLessonConfidence(
  stated: LessonConfidence,
  verdicts: readonly HarnessEditVerdict[]
): LessonConfidence {
  return verdicts.some((v) => SUPPORTING.has(v)) ? stated : LessonConfidence.Low;
}
