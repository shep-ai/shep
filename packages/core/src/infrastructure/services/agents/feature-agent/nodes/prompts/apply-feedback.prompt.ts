/**
 * Apply-Feedback Prompt Builder
 *
 * Builds a context summary for the apply-feedback node. This is used
 * internally by the graph to prepare context for the next
 * prototype-generate iteration — it does NOT call the executor.
 *
 * The prompt text produced here serves as a structured summary of
 * the current feedback and iteration context that the apply-feedback
 * node stores in state for the next prototype-generate node to consume.
 */

import type { FeatureAgentState } from '../../state.js';

/**
 * Build a context summary for the apply-feedback state transformation.
 *
 * Includes:
 * 1. Current feedback text
 * 2. Iteration count
 * 3. Summary of prior feedback history
 *
 * This is stored in graph state, not sent to an executor.
 */
export function buildApplyFeedbackContext(
  state: FeatureAgentState,
  currentFeedback: string
): string {
  const iterationCount = state.iterationCount ?? 0;
  const feedbackHistory = state.feedbackHistory ?? [];

  const sections: string[] = [];

  sections.push(`## Feedback Applied — Iteration ${iterationCount + 1}`);
  sections.push(`**Current feedback:** ${currentFeedback}`);

  if (feedbackHistory.length > 0) {
    sections.push(`**Prior feedback rounds:** ${feedbackHistory.length}`);
    const recentPrior = feedbackHistory.slice(-3);
    const startIdx = feedbackHistory.length - recentPrior.length;
    recentPrior.forEach((fb, i) => {
      const summary = fb.length > 80 ? `${fb.slice(0, 80)}...` : fb;
      sections.push(`- Iteration ${startIdx + i + 1}: ${summary}`);
    });
  }

  return sections.join('\n');
}
