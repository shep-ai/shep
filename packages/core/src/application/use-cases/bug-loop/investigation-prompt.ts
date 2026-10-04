/**
 * What an investigating agent is asked and what it must return (spec 123).
 */

import type { WorkItem } from '../../../domain/generated/output.js';
import { MAX_HYPOTHESES } from '../../../domain/shared/investigation.js';
import { workItemKey } from '../../../domain/shared/work-item-key.js';

/**
 * Built-in tools an investigating agent may use: reading and searching only.
 * Agents that take a tool list (Claude Code `--tools`) are held to it; for
 * the rest, the throwaway checkout is the containment.
 */
export const INVESTIGATION_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob'];

/** Turns are spent on reads; a large codebase needs many. */
export const INVESTIGATION_MAX_TURNS = 60;

/** Longest description sent to the agent. */
const MAX_DESCRIPTION_CHARS = 8_000;

const STRING = { type: 'string' } as const;

/** JSON schema of RawInvestigationResult. */
export const INVESTIGATION_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    summary: STRING,
    hypotheses: {
      type: 'array',
      maxItems: MAX_HYPOTHESES,
      items: {
        type: 'object',
        properties: {
          title: STRING,
          rootCause: STRING,
          confidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: { file: STRING, line: { type: 'integer' }, note: STRING },
              required: ['file', 'note'],
              additionalProperties: false,
            },
          },
          testPlan: STRING,
          fixPlan: STRING,
        },
        required: ['title', 'rootCause', 'confidence', 'evidence', 'testPlan', 'fixPlan'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'hypotheses'],
  additionalProperties: false,
} as const;

/** The work item description, cut to a length an agent prompt can carry. */
export function boundedDescription(item: WorkItem): string {
  const description = item.description?.trim() ?? '';
  if (description === '') return '(no description)';
  return description.length > MAX_DESCRIPTION_CHARS
    ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}\n…(truncated)`
    : description;
}

export function buildInvestigationPrompt(item: WorkItem): string {
  return `You are investigating a bug report against the repository in your current directory.
Read and search the code to find what causes it. Do not change, create or delete files, and do
not run commands: this is an investigation, not a fix.

## Bug report

Key: ${workItemKey(item)}
Title: ${item.title}
Priority: ${item.priority}

${boundedDescription(item)}

## What to return

- summary: two to four sentences on what the report describes and where in the code that
  behaviour lives.
- hypotheses: 1 to ${MAX_HYPOTHESES} candidate root causes, most likely first. For each:
  - title: a short name for the cause.
  - rootCause: what goes wrong and why, in terms of the code.
  - confidence: High when the code you read shows the defect directly, Medium when it is
    consistent with the report but unconfirmed, Low when it is possible but the evidence is thin.
  - evidence: places you read that support it, as paths relative to the repository root, with
    1-based line numbers where a line matters and what each shows. Cite only code you read.
  - testPlan: the automated test that would fail today because of this cause, and where it
    belongs (an existing test file when there is one).
  - fixPlan: the smallest change that fixes it.

If the report does not match this repository, return no hypotheses and say why in the summary.`;
}
