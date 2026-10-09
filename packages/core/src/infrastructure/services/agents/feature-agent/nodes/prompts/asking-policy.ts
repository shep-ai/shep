/**
 * What a headless agent is told about asking the user (spec 134, part 2).
 *
 * With the `ask_decision` tool the agent may ask — only when genuinely
 * blocked, always with a recommendation, and it proceeds with the
 * recommendation if nobody answers in time. Without the tool it must not ask.
 */

import { DECISION_MCP_SERVER_NAME } from '../../decision-mcp-config.js';
import { ASK_DECISION_TOOL_NAME as ASK_DECISION_TOOL } from '../../../../../../domain/shared/decision-deadline.js';

const ASK_DECISION_TOOL_REFERENCE = `\`${ASK_DECISION_TOOL}\` (mcp__${DECISION_MCP_SERVER_NAME}__${ASK_DECISION_TOOL})`;

/** The constraint line about asking the user, given whether the run has the tool. */
export function askingPolicyLine(decisionToolAvailable: boolean, withoutTool: string): string {
  if (!decisionToolAvailable) return withoutTool;
  return (
    `- Do NOT use AskUserQuestion. Only when you are genuinely blocked on a decision you cannot ` +
    `make yourself (irreversible, or a product choice the spec does not settle), ask via the ` +
    `${ASK_DECISION_TOOL_REFERENCE} tool: offer 2-9 options and mark exactly one as recommended. ` +
    `If nobody answers before the deadline it returns your recommendation — proceed with it. ` +
    `For everything else, make reasonable decisions and proceed`
  );
}
