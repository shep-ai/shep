/**
 * MCP Chat Block Tools (spec 137)
 *
 * `post_chat_block` lets any MCP client post a rich block — a spec to review,
 * an HTML preview, a plan card — into a Shep chat conversation. It is a thin
 * adapter over PostChatBlockUseCase, the same use case `shep chat block` uses.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { z } from 'zod';
import { PostChatBlockUseCase } from '../../../../application/use-cases/interactive/post-chat-block.use-case.js';
import { ChatBlockType } from '../../../../domain/generated/output.js';
import { withErrorHandling } from './with-error-handling.js';

export const POST_CHAT_BLOCK_TOOL = 'post_chat_block';

const BLOCK_TYPES = Object.values(ChatBlockType) as [ChatBlockType, ...ChatBlockType[]];

export function registerChatBlockTools(server: McpServer, container: DependencyContainer): void {
  server.registerTool(
    POST_CHAT_BLOCK_TOOL,
    {
      description:
        'Show a rich block inline in a Shep chat conversation. spec_review: a spec or PRD ' +
        '(markdown) the user approves or sends back with changes. plan_card: a plan (markdown) ' +
        'the user implements or asks to refine. html_preview: a self-contained HTML page (html) ' +
        'shown in a sandboxed frame with no network access — inline all CSS and scripts. ' +
        "The user's answer arrives as their next chat message.",
      inputSchema: {
        scope: z
          .string()
          .min(1)
          .describe(
            'Conversation: "global", "repo-<repository id>", "app-<application id>" or a feature id'
          ),
        type: z.enum(BLOCK_TYPES).describe('Kind of block'),
        title: z.string().min(1).describe('Short title shown in the block header'),
        markdown: z.string().optional().describe('Body for spec_review and plan_card'),
        html: z.string().optional().describe('Self-contained HTML document for html_preview'),
      },
    },
    async (args) =>
      withErrorHandling(async () => {
        const { block } = await container.resolve(PostChatBlockUseCase).execute(args);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ blockId: block.id, posted: true }) },
          ],
        };
      })
  );
}
