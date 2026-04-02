/**
 * Apply-Feedback Node
 *
 * Exploration mode state-transformation node that receives user feedback
 * from the resume payload, appends it to feedbackHistory, and prepares
 * context for the next prototype-generate iteration.
 *
 * This node does NOT call the agent executor — it is a pure state
 * transformation that processes the feedback and returns updated state.
 */

import type { FeatureAgentState } from '../state.js';
import { createNodeLogger } from './node-helpers.js';
import { reportNodeStart } from '../heartbeat.js';
import { buildApplyFeedbackContext } from './prompts/apply-feedback.prompt.js';

/**
 * Factory that creates the apply-feedback node function.
 *
 * @returns A LangGraph node function
 */
export function createApplyFeedbackNode() {
  const log = createNodeLogger('apply-feedback');

  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    log.activate();
    log.info('Processing user feedback');
    reportNodeStart('apply-feedback');

    // Extract feedback from the resume state.
    // The worker sets _rejectionFeedback from the resume payload,
    // or the feedback may come through a dedicated exploration channel.
    const feedback = state._rejectionFeedback ?? '';
    const iterationCount = state.iterationCount ?? 0;

    if (!feedback || feedback.trim().length === 0) {
      log.info('No feedback text provided — proceeding with empty feedback');
    } else {
      log.info(`Feedback received (${feedback.length} chars) for iteration ${iterationCount}`);
    }

    // Build context summary for logging
    const contextSummary = buildApplyFeedbackContext(state, feedback);
    log.info(`Context prepared for next iteration`);

    return {
      currentNode: 'apply-feedback',
      explorationStatus: 'applying-feedback',
      feedbackHistory: [feedback],
      // Clear the rejection feedback after consuming it
      _rejectionFeedback: null,
      _approvalAction: null,
      messages: [
        `[apply-feedback] Feedback applied for iteration ${iterationCount + 1}: "${feedback.slice(0, 100)}${feedback.length > 100 ? '...' : ''}"`,
        `[apply-feedback] Context: ${contextSummary.slice(0, 200)}`,
      ],
    };
  };
}
