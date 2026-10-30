/**
 * Graph State Transition Test Helpers
 *
 * Utility functions shared across all test files in this suite.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { Command } from '@langchain/langgraph';

/* ------------------------------------------------------------------ */
/*  Interrupt Helpers                                                  */
/* ------------------------------------------------------------------ */

export interface InterruptPayload {
  value: Record<string, unknown>;
}

/** Extract interrupt payloads from a graph invoke result. */
export function getInterrupts(result: Record<string, unknown>): InterruptPayload[] {
  return (result.__interrupt__ as InterruptPayload[]) ?? [];
}

/** Assert a result has exactly one interrupt at the named node. */
export function expectInterruptAt(result: Record<string, unknown>, nodeName: string): void {
  const interrupts = getInterrupts(result);
  if (interrupts.length !== 1) {
    throw new Error(`Expected 1 interrupt, got ${interrupts.length}`);
  }
  if (interrupts[0].value.node !== nodeName) {
    throw new Error(`Expected interrupt at "${nodeName}", got "${interrupts[0].value.node}"`);
  }
}

/** Assert a result has no interrupts (graph ran to completion). */
export function expectNoInterrupts(result: Record<string, unknown>): void {
  const interrupts = getInterrupts(result);
  if (interrupts.length !== 0) {
    throw new Error(
      `Expected no interrupts, got ${interrupts.length} at "${interrupts[0].value.node}"`
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Resume Commands                                                   */
/* ------------------------------------------------------------------ */

/** Create a LangGraph Command to approve and continue. */

export function approveCommand(): any {
  return new Command({
    resume: { approved: true },
    update: { _approvalAction: 'approved', _rejectionFeedback: null },
  });
}

/** Create a LangGraph Command to reject with feedback. */

export function rejectCommand(feedback: string): any {
  return new Command({
    resume: { rejected: true, feedback },
    update: { _approvalAction: 'rejected', _rejectionFeedback: feedback },
  });
}

/* ------------------------------------------------------------------ */
/*  feature.yaml Helpers                                              */
/* ------------------------------------------------------------------ */

/** Read completedPhases from feature.yaml on disk. */
export function readCompletedPhases(specDir: string): string[] {
  try {
    const content = readFileSync(join(specDir, 'feature.yaml'), 'utf-8');
    const data = yaml.load(content) as Record<string, unknown>;
    const status = (data?.status ?? {}) as Record<string, unknown>;
    return Array.isArray(status.completedPhases) ? status.completedPhases : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  spec.yaml Helpers                                                 */
/* ------------------------------------------------------------------ */

/** Read and parse spec.yaml from the spec directory. */
export function readSpecYaml(specDir: string): Record<string, unknown> {
  const content = readFileSync(join(specDir, 'spec.yaml'), 'utf-8');
  return yaml.load(content) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Default Approval Gates                                            */
/* ------------------------------------------------------------------ */

/** All gates disabled — interrupts at every interruptible node. */
export const ALL_GATES_DISABLED = { allowPrd: false, allowPlan: false, allowMerge: false } as const;

/** All gates enabled — fully autonomous, no interrupts. */
export const ALL_GATES_ENABLED = { allowPrd: true, allowPlan: true, allowMerge: true } as const;

/** PRD auto-approved, plan and merge gated. */
export const PRD_ALLOWED = { allowPrd: true, allowPlan: false, allowMerge: false } as const;

/** PRD and plan auto-approved, merge gated. */
export const PRD_PLAN_ALLOWED = { allowPrd: true, allowPlan: true, allowMerge: false } as const;

/* ------------------------------------------------------------------ */
/*  Executed-node Helpers                                              */
/* ------------------------------------------------------------------ */

/** Each producer node's prompt carries one of these phase markers. */
export const PROMPT_NODE_MARKERS: readonly (readonly [string, string])[] = [
  ['analyze', 'ANALYSIS phase'],
  ['requirements', 'REQUIREMENTS phase'],
  ['research', 'RESEARCH phase'],
  ['plan', 'PLANNING phase'],
  ['implement', 'autonomous implementation'],
  ['merge', 'Write a conventional commit message'],
];

/**
 * Which producer nodes ran, in graph order, judged from the executor's
 * prompts. Reset the recorded prompts between invocations to see only the
 * current one — result.messages accumulates across checkpointed state.
 */
export function getExecutedNodes(prompts: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const prompt of prompts) {
    for (const [nodeName, marker] of PROMPT_NODE_MARKERS) {
      if (prompt.includes(marker)) seen.add(nodeName);
    }
  }
  return PROMPT_NODE_MARKERS.map(([name]) => name).filter((n) => seen.has(n));
}
