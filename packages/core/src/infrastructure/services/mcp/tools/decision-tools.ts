/**
 * MCP Decision Tools (spec 134, part 2)
 *
 * `ask_decision` lets a headless agent that is genuinely blocked ask the user,
 * always with one recommended option. The question goes to the unified inbox
 * and notifications; the call returns the person's answer, or — when nobody
 * answers before the deadline — the recommended option.
 *
 * The run and feature come from the process environment the worker set
 * (agent-run-environment), never from the model, so a call cannot file a
 * question against another feature. Thin adapter: all rules live in
 * AskAgentDecisionUseCase.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { z } from 'zod';
import {
  AskAgentDecisionUseCase,
  type AskAgentDecisionOutcome,
  type AskAgentDecisionResult,
} from '../../../../application/use-cases/agents/ask-agent-decision.use-case.js';
import {
  readAgentRunEnvironment,
  type EnvironmentVariables,
} from '../../../../domain/shared/agent-run-environment.js';
import {
  ASK_DECISION_TOOL_NAME,
  MAX_DECISION_TIMEOUT_MINUTES,
} from '../../../../domain/shared/decision-deadline.js';
import { withErrorHandling } from './with-error-handling.js';

export const ASK_DECISION_TOOL = ASK_DECISION_TOOL_NAME;

const MAX_OPTIONS = 9;

const OUTCOME_GUIDANCE: Record<AskAgentDecisionOutcome, (answer: string) => string> = {
  answered: (answer) => `The user answered: ${answer}. Act on this answer.`,
  defaulted: (answer) =>
    `Nobody answered before the deadline. Proceed with your recommended option: ${answer}.`,
  cancelled: (answer) =>
    `The question was cancelled. Proceed with your recommended option: ${answer}.`,
  disabled: (answer) =>
    `Questions are turned off for this workspace. Proceed with your recommended option: ${answer}.`,
};

function describeResult(result: AskAgentDecisionResult): string {
  return JSON.stringify(
    {
      outcome: result.outcome,
      answer: result.answer,
      ...(result.answeredBy ? { answeredBy: result.answeredBy } : {}),
      instruction: OUTCOME_GUIDANCE[result.outcome](result.answer),
    },
    null,
    2
  );
}

export function registerDecisionTools(
  server: McpServer,
  container: DependencyContainer,
  env: EnvironmentVariables
): void {
  server.registerTool(
    ASK_DECISION_TOOL,
    {
      description:
        'Ask the user a question ONLY when you are genuinely blocked on a decision you cannot ' +
        'make yourself (an irreversible or product-level choice). Always offer 2-9 options and mark ' +
        'exactly one as recommended — the one you would pick. The call waits for the answer; if ' +
        'nobody answers before the deadline, it returns your recommended option and you proceed ' +
        'with it. Do not use it for questions you can answer by reading the code.',
      inputSchema: {
        question: z
          .string()
          .min(1)
          .describe('The full question, with the context needed to answer it'),
        header: z.string().optional().describe('A short label, e.g. "Migration"'),
        options: z
          .array(
            z.object({
              label: z.string().min(1).describe('Short option label'),
              description: z.string().optional().describe('One line on the trade-off'),
              preview: z.string().optional().describe('Optional code or text preview'),
              recommended: z.boolean().optional().describe('true for the option you recommend'),
            })
          )
          .min(2)
          .max(MAX_OPTIONS),
        multiSelect: z.boolean().optional(),
        timeoutMinutes: z
          .number()
          .int()
          .positive()
          .max(MAX_DECISION_TIMEOUT_MINUTES)
          .optional()
          .describe(
            'Minutes to wait before proceeding with the recommendation (default from settings)'
          ),
      },
    },
    async (args) =>
      withErrorHandling(async () => {
        const run = readAgentRunEnvironment(env);
        if (!run?.featureId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `${ASK_DECISION_TOOL} is only available inside a Shep feature run.`,
              },
            ],
            isError: true,
          };
        }
        const result = await container.resolve(AskAgentDecisionUseCase).execute({
          featureId: run.featureId,
          agentRunId: run.runId,
          question: args.question,
          header: args.header,
          options: args.options,
          multiSelect: args.multiSelect,
          timeoutMinutes: args.timeoutMinutes,
        });
        return { content: [{ type: 'text' as const, text: describeResult(result) }] };
      })
  );
}
