/**
 * A learned-harness candidate as a Decision (spec 150, kind HarnessChange):
 * Adopt or Reject, with a typed note that rejects with that note as feedback.
 * The candidate's version id travels in the question id, so an answer from
 * any inbox (web, CLI, TUI, MCP) maps back to exactly one version.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import {
  DecisionKind,
  DecisionResponseMode,
  type Decision,
  type DecisionResponse,
} from '../generated/output';
import { alwaysOnText, diffHarness, type HarnessTree } from './harness-tree';

export const HARNESS_QUESTION_PREFIX = 'harness-change:';
export const HARNESS_ADOPT_OPTION_ID = 'adopt';
export const HARNESS_REJECT_OPTION_ID = 'reject';

/** Characters of a component shown in the decision preview. */
const PREVIEW_COMPONENT_CHARS = 1500;
const PREVIEW_MAX_CHARS = 12_000;

export interface HarnessChangeSummary {
  featureName: string;
  added: number;
  modified: number;
  removed: number;
  alwaysOnDelta: number;
  scanFindings: number;
  executable: boolean;
}

export function summarizeHarnessChange(
  before: HarnessTree,
  after: HarnessTree,
  featureName: string,
  scanFindings: number,
  executable: boolean
): HarnessChangeSummary {
  const diff = diffHarness(before, after);
  return {
    featureName,
    added: diff.added.length,
    modified: diff.modified.length,
    removed: diff.removed.length,
    alwaysOnDelta: alwaysOnText(after).length - alwaysOnText(before).length,
    scanFindings,
    executable,
  };
}

export function harnessQuestionText(s: HarnessChangeSummary): string {
  const parts = [
    `Shep learned from "${s.featureName}" and proposes a harness change for this repository:`,
    `${s.added} added, ${s.modified} changed, ${s.removed} removed`,
    `always-on text ${s.alwaysOnDelta >= 0 ? '+' : ''}${s.alwaysOnDelta} characters.`,
  ];
  if (s.executable) parts.push('It includes scripts or hooks that will run in later features.');
  if (s.scanFindings)
    parts.push(`The safety scan flagged ${s.scanFindings} line(s) — review them.`);
  return `${parts.join(' ')} Adopt it, or reject it with feedback?`;
}

/** A readable preview: each changed component with its new content. */
export function renderHarnessDiffText(before: HarnessTree, after: HarnessTree): string {
  const diff = diffHarness(before, after);
  const blocks: string[] = [];
  const clip = (s: string) =>
    s.length > PREVIEW_COMPONENT_CHARS ? `${s.slice(0, PREVIEW_COMPONENT_CHARS)}\n…` : s;
  for (const p of diff.added) blocks.push(`+ ${p}\n${clip(after[p])}`);
  for (const p of diff.modified) blocks.push(`~ ${p}\n${clip(after[p])}`);
  for (const p of diff.removed) blocks.push(`- ${p}`);
  const text = blocks.join('\n\n');
  return text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS)}\n…` : text;
}

export function buildHarnessChangeDecision(
  id: string,
  versionId: string,
  question: string,
  preview: string
): Decision {
  return {
    id,
    kind: DecisionKind.HarnessChange,
    responseMode: DecisionResponseMode.Async,
    title: 'Adopt a learned harness change?',
    questions: [
      {
        id: `${HARNESS_QUESTION_PREFIX}${versionId}`,
        header: 'Harness',
        question,
        multiSelect: false,
        allowCustom: true,
        options: [
          {
            id: HARNESS_ADOPT_OPTION_ID,
            label: 'Adopt',
            description: 'Use it for later features in this repository',
            preview,
          },
          {
            id: HARNESS_REJECT_OPTION_ID,
            label: 'Reject',
            description: 'Discard it; type feedback to steer the next proposal',
          },
        ],
      },
    ],
  };
}

export interface HarnessVerdict {
  versionId: string;
  verdict: 'adopt' | 'reject';
  feedback?: string;
}

/** Read the verdict from responses; undefined when they do not answer a harness change. */
export function harnessVerdictFromResponses(
  responses: readonly DecisionResponse[]
): HarnessVerdict | undefined {
  const response = responses.find((r) => r.questionId.startsWith(HARNESS_QUESTION_PREFIX));
  if (!response) return undefined;
  const versionId = response.questionId.slice(HARNESS_QUESTION_PREFIX.length);
  const feedback = response.customText?.trim() ?? '';
  if (feedback) return { versionId, verdict: 'reject', feedback };
  if (response.optionIds.includes(HARNESS_ADOPT_OPTION_ID)) return { versionId, verdict: 'adopt' };
  if (response.optionIds.includes(HARNESS_REJECT_OPTION_ID)) {
    return { versionId, verdict: 'reject' };
  }
  return undefined;
}

/** `memory.md` bullet lines, the facts adoption records as project memory. */
export function memoryFacts(memoryMarkdown: string | undefined): string[] {
  return (memoryMarkdown ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter((line, i, all) => line.length > 0 && !line.startsWith('#') && all.indexOf(line) === i);
}
