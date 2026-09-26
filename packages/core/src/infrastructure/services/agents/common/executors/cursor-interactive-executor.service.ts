/**
 * Cursor Interactive Executor
 *
 * Chat sessions for the Cursor agent, served by `cursor-agent acp` — the Agent
 * Client Protocol server built into the Cursor CLI. The protocol handling is
 * the agent-agnostic {@link AcpInteractiveExecutor}; this file holds only what
 * is true of Cursor:
 *
 * - how to launch it (a `.cmd` shim on Windows needs a shell to run),
 * - how Shep model ids translate to Cursor's (shared with the one-shot executor),
 * - how Cursor asks the user a question (`cursor/ask_question`), which is
 *   routed to the same `agentQuestionBridge` / `onUserQuestion` path the Claude
 *   executor uses for AskUserQuestion.
 *
 * The one-shot executor (`cursor-executor.service.ts`) is unchanged: graph
 * nodes still run `cursor-agent --print` per call.
 */

import type {
  ClientApp,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import type { InteractiveAgentOptions } from '../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type { SpawnFunction } from '../types.js';
import { IS_WINDOWS } from '../../../../platform.js';
import { AcpInteractiveExecutor, type AcpAgentProfile } from './acp/acp-interactive-executor.js';
import {
  CURSOR_AGENT_NAME,
  CURSOR_BINARY,
  CURSOR_NOT_FOUND_MESSAGE,
  toCursorModelName,
} from './cursor-cli.js';
import {
  CURSOR_ASK_QUESTION_METHOD,
  cursorAskQuestionRequestSchema,
  toCursorAskQuestionResponse,
  toUserInteraction,
  type CursorAskQuestionRequest,
  type CursorAskQuestionResponse,
} from './cursor-ask-question.js';

/** Subcommand that starts the Cursor CLI's ACP server. */
const ACP_SUBCOMMAND = 'acp';

/** Shell that runs a `.cmd` shim and hands it our stdio unchanged. */
const WINDOWS_SHELL = 'cmd.exe';

/** `/d`: skip AutoRun commands; `/c`: run the command, then exit. */
const WINDOWS_SHELL_ARGS = ['/d', '/c'];

const CANCELLED: CursorAskQuestionResponse = { outcome: { outcome: 'cancelled' } };

/**
 * Option id Cursor adds to the permission prompts it falls back to when
 * `cursor/ask_question` fails — one prompt per question, one option per answer.
 */
const ASK_QUESTION_SKIP_OPTION_ID = '__ask_question_skip__';

/**
 * Skip Cursor's fallback question prompts. Approving one "once" would select
 * the first answer on the user's behalf; skipping lets the agent carry on and
 * ask again in prose.
 */
function skipFallbackQuestion(
  request: RequestPermissionRequest
): RequestPermissionResponse | undefined {
  const skip = request.options.find((option) => option.optionId === ASK_QUESTION_SKIP_OPTION_ID);
  return skip ? { outcome: { outcome: 'selected', optionId: skip.optionId } } : undefined;
}

/**
 * Ask the user Cursor's questions through the chat's question UI.
 *
 * A failure here becomes a `cancelled` reply rather than a JSON-RPC error: on an
 * error Cursor falls back to one permission prompt per single-select question,
 * which drops multi-select questions and free-text answers
 * ({@link skipFallbackQuestion} keeps those prompts from being auto-answered).
 */
async function askUser(
  request: CursorAskQuestionRequest,
  options: InteractiveAgentOptions
): Promise<CursorAskQuestionResponse> {
  const interaction = toUserInteraction(request);
  try {
    let answers = options.agentQuestionBridge
      ? await options.agentQuestionBridge.ask(interaction)
      : null;
    if (answers === null) {
      if (!options.onUserQuestion) return CANCELLED;
      answers = await options.onUserQuestion(interaction);
    }
    return toCursorAskQuestionResponse(request, answers);
  } catch {
    return CANCELLED;
  }
}

/** Everything Cursor-specific the ACP executor needs. */
export const CURSOR_ACP_PROFILE: AcpAgentProfile = {
  agentName: CURSOR_AGENT_NAME,
  notFoundMessage: CURSOR_NOT_FOUND_MESSAGE,
  loginHint:
    'Cursor is not logged in. Run `cursor-agent login` (or set CURSOR_API_KEY), then start the chat again.',
  handshakeFailureHint:
    'Chat needs a Cursor CLI that includes the `acp` command — run `cursor-agent update`.',
  // The command line is constant: prompts travel as JSON over stdin, so no
  // user text ever reaches the Windows shell.
  launchCommand: () =>
    IS_WINDOWS
      ? { command: WINDOWS_SHELL, args: [...WINDOWS_SHELL_ARGS, CURSOR_BINARY, ACP_SUBCOMMAND] }
      : { command: CURSOR_BINARY, args: [ACP_SUBCOMMAND] },
  toAgentModel: toCursorModelName,
  resolvePermission: skipFallbackQuestion,
  registerExtensions: (app: ClientApp, options: InteractiveAgentOptions) => {
    app.onRequest(CURSOR_ASK_QUESTION_METHOD, cursorAskQuestionRequestSchema, ({ params }) =>
      askUser(params, options)
    );
  },
};

export class CursorInteractiveExecutor extends AcpInteractiveExecutor {
  constructor(spawn: SpawnFunction) {
    super(spawn, CURSOR_ACP_PROFILE);
  }
}
