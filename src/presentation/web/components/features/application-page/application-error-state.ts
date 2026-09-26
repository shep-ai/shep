/**
 * Which recovery banner an application's chat shows, if any.
 *
 * The server-side `application.status === Error` flag is the authoritative
 * signal that setup crashed; without a banner the user only sees a red
 * "ERROR" pill in the top bar. An agent that cannot run chat sessions takes
 * precedence: "Try again" would re-run setup with the same agent and fail
 * the same way, so that banner explains why and links to Settings instead.
 */

import type { InteractiveAgentSupport } from '@shepai/core/application/use-cases/interactive/get-interactive-agent-support.use-case';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';
import type { ApplicationErrorState } from '@/components/features/chat/error-recovery-banner';
import { SETTINGS_PATH } from '@/lib/chat-errors';

const SETUP_FAILED: ApplicationErrorState = {
  kind: 'Setup failed',
  message:
    'The last setup run errored out before it could finish. Click Try again to re-run the failed step, or open the Smart Deploy activity log from the top bar to see what went wrong.',
  retryable: true,
};

function agentUnsupported(label: string): ApplicationErrorState {
  return {
    kind: `Chat unavailable for ${label}`,
    message: `${label} does not support chat sessions yet, so this app cannot run setup or chat with it. To keep chatting, pick another agent in the message box. New apps use the default agent from Settings.`,
    retryable: false,
    action: { label: 'Open Settings', href: SETTINGS_PATH },
  };
}

export function deriveApplicationErrorState(
  status: ApplicationStatus,
  interactiveAgent: InteractiveAgentSupport | undefined
): ApplicationErrorState | null {
  if (interactiveAgent && !interactiveAgent.supported) {
    return agentUnsupported(interactiveAgent.label ?? interactiveAgent.agentType ?? 'This agent');
  }
  return status === ApplicationStatus.Error ? SETUP_FAILED : null;
}
