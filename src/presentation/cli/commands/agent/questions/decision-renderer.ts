/**
 * CLI renderer for a Decision (spec 134) — the same model the web
 * DecisionPanel renders: questions paged n/N, options numbered with their
 * descriptions, the recommended option marked and preselected, and a typed
 * answer where the question allows one.
 */

import { checkbox, input, select } from '@inquirer/prompts';
import type { Decision, DecisionResponse } from '@/domain/generated/output.js';

/** Choice value that switches a single-select question to a typed answer. */
export const CUSTOM_ANSWER_CHOICE = '__custom__';

interface Choice {
  name: string;
  value: string;
  description?: string;
  checked?: boolean;
}

/** The subset of @inquirer/prompts used here (injectable for tests). */
export interface DecisionPrompts {
  select(config: { message: string; choices: Choice[]; default?: string }): Promise<string>;
  checkbox(config: { message: string; choices: Choice[] }): Promise<string[]>;
  input(config: { message: string }): Promise<string>;
}

const inquirerPrompts: DecisionPrompts = {
  select: (config) => select(config),
  checkbox: (config) => checkbox(config),
  input: (config) => input(config),
};

/** Lines describing a decision, for `ls` and before an interactive answer. */
export function renderDecisionLines(decision: Decision): string[] {
  const lines: string[] = [];
  if (decision.title) lines.push(decision.title);
  const total = decision.questions.length;
  decision.questions.forEach((q, qi) => {
    const many = q.multiSelect ? ' (select one or more)' : '';
    lines.push(`[${qi + 1}/${total}] ${q.header} — ${q.question}${many}`);
    q.options.forEach((o, oi) => {
      const recommended = o.recommended ? ' (recommended)' : '';
      const description = o.description ? ` — ${o.description}` : '';
      lines.push(`  ${oi + 1}. ${o.label}${recommended}${description}`);
    });
    if (q.allowCustom) lines.push('  …or type your own answer');
  });
  return lines;
}

/** One line for a table cell: the title, else the first question. */
export function decisionHeadline(decision: Decision): string {
  return decision.title ?? decision.questions[0]?.question ?? '';
}

/** Ask every question interactively; the recommended options are the defaults. */
export async function promptDecision(
  decision: Decision,
  prompts: DecisionPrompts = inquirerPrompts
): Promise<DecisionResponse[]> {
  const responses: DecisionResponse[] = [];
  for (const q of decision.questions) {
    const choices: Choice[] = q.options.map((o) => ({
      name: o.recommended ? `${o.label} (recommended)` : o.label,
      value: o.id,
      ...(o.description ? { description: o.description } : {}),
      ...(q.multiSelect && o.recommended ? { checked: true } : {}),
    }));
    if (q.multiSelect) {
      const optionIds = await prompts.checkbox({ message: q.question, choices });
      if (optionIds.length === 0 && q.allowCustom) {
        responses.push({
          questionId: q.id,
          optionIds: [],
          customText: await prompts.input({ message: q.question }),
        });
      } else {
        responses.push({ questionId: q.id, optionIds });
      }
      continue;
    }
    if (q.options.length === 0) {
      responses.push({
        questionId: q.id,
        optionIds: [],
        customText: await prompts.input({ message: q.question }),
      });
      continue;
    }
    const picked = await prompts.select({
      message: q.question,
      choices: q.allowCustom
        ? [...choices, { name: 'Type my own answer', value: CUSTOM_ANSWER_CHOICE }]
        : choices,
      default: q.options.find((o) => o.recommended)?.id,
    });
    responses.push(
      picked === CUSTOM_ANSWER_CHOICE
        ? {
            questionId: q.id,
            optionIds: [],
            customText: await prompts.input({ message: q.question }),
          }
        : { questionId: q.id, optionIds: [picked] }
    );
  }
  return responses;
}
