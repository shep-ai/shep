/**
 * The stable prompt prefix (spec 119, docs/04 "Cache strategy"): runtime
 * rules, the hard-policy summary, Tier-1 capability snippets and pinned
 * instructions. It changes only when instructions or capabilities change, so
 * providers can cache it across turns.
 */
import { HarnessMode } from '../../../domain/generated/output.js';

export interface SystemPromptInput {
  mode: HarnessMode;
  capabilityCatalog: string;
  instructions: readonly { title: string; source: string; body: string }[];
  repoRoot: string;
}

const QUERY_AWARE_RULES = `You are a coding agent running inside Shep's query-aware harness.

How this harness works:
- Each turn you receive a fresh, purpose-built context: the task, the state you need now, and an index of hidden chunks. There is no chat history; a ledger lists what you already did.
- Tools are capabilities. To use one, call use_capability with its id, your intent and its args (parameters are listed below); it runs right away and stays loaded, so later calls use the tool directly. Without args it only loads the tool for the next turn.
- Tool results are stored as chunks. You see them in the next turn's context at a chosen level of detail. If you need more, call expand_chunk with the chunk id instead of running the tool again.
- Every write or side effect is checked against permission policy. A denial explains why; do not retry a denied action, find another way.
- When the work is done, call complete_task with a clear summary and evidence (files and lines). Do not stop without calling it.
- Work only inside the repository. Shep commits, pushes and opens pull requests itself; never push.`;

const BASELINE_RULES = `You are a coding agent. Use the tools to inspect and change the repository.
Every write or side effect is checked against permission policy; do not retry a denied action.
When the work is done, call complete_task with a clear summary. Never push to a remote.`;

export function buildSystemPrompt(input: SystemPromptInput): string {
  const parts = [
    input.mode === HarnessMode.Baseline ? BASELINE_RULES : QUERY_AWARE_RULES,
    `Repository: ${input.repoRoot}`,
  ];
  if (input.mode === HarnessMode.QueryAware && input.capabilityCatalog) {
    parts.push(`Capabilities (load with use_capability):\n${input.capabilityCatalog}`);
  }
  for (const i of input.instructions) {
    parts.push(
      `<instruction title="${i.title.replace(/"/g, "'")}" source="${i.source}">\n${i.body.trim()}\n</instruction>`
    );
  }
  return parts.join('\n\n');
}
