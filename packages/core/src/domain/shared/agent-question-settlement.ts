/**
 * Wording for an answer or cancel that lost the race to settle a question.
 *
 * Answer and Cancel settle a pending question with one conditional write; the
 * loser writes nothing and learns the status the winner recorded. Every
 * surface (CLI, web) reports that the same way, so a user whose answer was not
 * recorded is never told it was.
 */

import type { AgentQuestionStatus } from '../generated/output';

export function questionAlreadySettledMessage(
  questionId: string,
  settledAs: AgentQuestionStatus
): string {
  return `Question ${questionId} was already ${settledAs}; nothing was recorded`;
}
