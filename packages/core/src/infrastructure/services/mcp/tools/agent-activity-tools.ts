/**
 * MCP Agent Activity Tools (spec 148)
 *
 * Lets an agent that mounts `shep mcp` follow a feature the way a person does:
 * see whether it is working, blocked on someone, waiting, done or failed and
 * why; wait until it needs someone; then decide its gate or answer its
 * agent's question. Thin adapters over the agent-activity use cases.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { z } from 'zod';
import {
  ActivityWaitOutcome,
  AgentActivityState,
  DecisionSurface,
  FeatureConsoleAction,
  FeatureReplyOutcome,
} from '../../../../domain/generated/output.js';
import { GetAgentActivityUseCase } from '../../../../application/use-cases/agent-activity/get-agent-activity.use-case.js';
import { WaitForAgentActivityUseCase } from '../../../../application/use-cases/agent-activity/wait-for-agent-activity.use-case.js';
import {
  ReplyToFeatureUseCase,
  type ReplyToFeatureInput,
} from '../../../../application/use-cases/agent-activity/reply-to-feature.use-case.js';
import { withErrorHandling, type McpToolResult } from './with-error-handling.js';

/** How replies sent through MCP are attributed. */
const MCP_ANSWERED_BY = 'mcp';
/** Default and maximum wait: MCP clients time tool calls out, so a wait must end. */
const DEFAULT_WAIT_MS = 60_000;
const MAX_WAIT_MS = 600_000;
/** Wait outcomes that mean the call itself was wrong, not that time ran out. */
const WAIT_ERRORS: ReadonlySet<ActivityWaitOutcome> = new Set([
  ActivityWaitOutcome.NotFound,
  ActivityWaitOutcome.Ambiguous,
]);
const GATE_DECISIONS = [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject] as const;

const activityStates = z.nativeEnum(AgentActivityState);
const featureIdSchema = z.string().describe('Feature id or id prefix');

function json(value: unknown, isError = false): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function registerAgentActivityTools(
  server: McpServer,
  container: DependencyContainer
): void {
  server.registerTool(
    'get_agent_activity',
    {
      description:
        "What each feature's agent is doing: working, blocked (an approval gate, an agent question or a review waits on someone), waiting, done or failed — with the reason, the open question and a version (epoch ms of the newest write behind it). Lists active features, or one feature by id.",
      inputSchema: {
        featureId: featureIdSchema.optional(),
        repositoryPath: z.string().optional().describe('Only features of this repository'),
        includeSettled: z.boolean().optional().describe('Include done features in a list'),
      },
    },
    async (input) =>
      withErrorHandling(async () =>
        json(await container.resolve(GetAgentActivityUseCase).execute(input))
      )
  );

  server.registerTool(
    'wait_for_agent_activity',
    {
      description: `Wait until a feature reaches one of the given activity states (default: blocked, done or failed — the moment it needs someone or stops) and return it. Returns at once when it already matches. Times out after timeoutMs (default ${DEFAULT_WAIT_MS}, at most ${MAX_WAIT_MS}).`,
      inputSchema: {
        featureId: featureIdSchema,
        until: z.array(activityStates).optional().describe('States to wait for'),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ featureId, until, timeoutMs }) =>
      withErrorHandling(async () => {
        const result = await container.resolve(WaitForAgentActivityUseCase).execute({
          featureId,
          ...(until ? { until } : {}),
          timeoutMs: Math.min(timeoutMs ?? DEFAULT_WAIT_MS, MAX_WAIT_MS),
        });
        return json(result, WAIT_ERRORS.has(result.outcome));
      })
  );

  server.registerTool(
    'decide_feature_gate',
    {
      description:
        'Approve a feature waiting at an approval gate, or reject it with feedback the agent iterates on.',
      inputSchema: {
        featureId: featureIdSchema,
        decision: z.enum(GATE_DECISIONS),
        feedback: z.string().optional().describe('Required when rejecting'),
      },
    },
    async ({ featureId, decision, feedback }) =>
      reply(container, { featureId, action: decision, ...(feedback ? { feedback } : {}) })
  );

  server.registerTool(
    'answer_agent_question',
    {
      description: "Answer the open question a feature's agent asked (see get_agent_activity).",
      inputSchema: { featureId: featureIdSchema, answer: z.string().min(1) },
    },
    async ({ featureId, answer }) => reply(container, { featureId, answer })
  );
}

function reply(
  container: DependencyContainer,
  input: Omit<ReplyToFeatureInput, 'answeredBy' | 'surface'>
): Promise<McpToolResult> {
  return withErrorHandling(async () => {
    const result = await container.resolve(ReplyToFeatureUseCase).execute({
      ...input,
      answeredBy: MCP_ANSWERED_BY,
      surface: DecisionSurface.Other,
    });
    return json(result, result.outcome !== FeatureReplyOutcome.Applied);
  });
}
