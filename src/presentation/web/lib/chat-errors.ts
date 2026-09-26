/**
 * Client-side handling of a chat message the server refused to send.
 *
 * The chat routes answer an expected failure with `{ error, code }` (see
 * `interactive-error-response.ts`). Keeping both fields lets the UI explain
 * the problem in the server's words and pick the right follow-up action.
 */

import { INTERACTIVE_AGENT_UNSUPPORTED_CODE } from '@shepai/core/domain/errors/interactive-agent-unsupported.error';

/** Where the user changes their default agent. */
export const SETTINGS_PATH = '/settings';

export class ChatSendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ChatSendError';
  }
}

/** Build a `ChatSendError` from a non-2xx chat response. */
export async function chatSendErrorFromResponse(res: Response): Promise<ChatSendError> {
  const fallback = `Failed to send message: ${res.status}`;
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    return new ChatSendError(
      typeof body.error === 'string' ? body.error : fallback,
      res.status,
      typeof body.code === 'string' ? body.code : undefined
    );
  } catch {
    return new ChatSendError(fallback, res.status);
  }
}

/** True when the send failed because the agent cannot run chat sessions. */
export function isInteractiveAgentUnsupported(err: unknown): err is ChatSendError {
  return err instanceof ChatSendError && err.code === INTERACTIVE_AGENT_UNSUPPORTED_CODE;
}
