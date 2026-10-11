/**
 * shep chat — chat conversation tools (spec 137).
 *
 *   shep chat block <spec-review|preview|plan> --title <title> (--file <path> | --content <text>)
 *                   [--scope <conversation>]
 *
 * An agent chatting with the user runs this to show a rich block inline: a
 * spec to approve or send back, an HTML page to look at, or a plan to
 * implement or refine. Every interactive session sets SHEP_CHAT_SCOPE, so an
 * agent never has to know which conversation it is in.
 */

import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ChatBlockType } from '@/domain/generated/output.js';
import { CHAT_SCOPE_ENV_VAR } from '@/domain/shared/chat-scope.js';
import type { ChatBlockInput } from '@/domain/shared/chat-block.js';
import { INVALID_CHAT_BLOCK_CODE } from '@/domain/errors/invalid-chat-block.error.js';
import { PostChatBlockUseCase } from '@/application/use-cases/interactive/post-chat-block.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

const KEY = 'cli:commands.chat';

/** The block kinds as typed on the command line. */
const BLOCK_KINDS: Record<string, ChatBlockType> = {
  'spec-review': ChatBlockType.SpecReview,
  preview: ChatBlockType.HtmlPreview,
  plan: ChatBlockType.PlanCard,
};

/** HTML previews carry `html`; every other block carries Markdown. */
const BODY_FIELD: Record<ChatBlockType, 'markdown' | 'html'> = {
  [ChatBlockType.SpecReview]: 'markdown',
  [ChatBlockType.HtmlPreview]: 'html',
  [ChatBlockType.PlanCard]: 'markdown',
};

function t(key: string, options?: Record<string, unknown>): string {
  return getCliI18n().t(`${KEY}.${key}`, options);
}

interface BlockOptions {
  title: string;
  file?: string;
  content?: string;
  scope?: string;
}

function fail(text: string, error?: Error): void {
  messages.error(text, error);
  process.exitCode = 1;
}

async function readBody(options: BlockOptions): Promise<string | null> {
  if (options.content !== undefined) return options.content;
  try {
    return await readFile(options.file as string, 'utf8');
  } catch {
    fail(t('block.unreadable', { file: options.file }));
    return null;
  }
}

async function postBlock(kind: string, options: BlockOptions): Promise<void> {
  const type = BLOCK_KINDS[kind];
  if (!type) {
    fail(t('block.unknownKind', { kind, kinds: Object.keys(BLOCK_KINDS).join(', ') }));
    return;
  }
  const scope = options.scope ?? process.env[CHAT_SCOPE_ENV_VAR];
  if (!scope) {
    fail(t('block.noScope', { variable: CHAT_SCOPE_ENV_VAR }));
    return;
  }
  if ((options.file === undefined) === (options.content === undefined)) {
    fail(t('block.oneSource'));
    return;
  }
  const body = await readBody(options);
  if (body === null) return;

  const input: ChatBlockInput = { type, title: options.title, [BODY_FIELD[type]]: body };
  try {
    const { block } = await container.resolve(PostChatBlockUseCase).execute({ scope, ...input });
    messages.success(t('block.posted', { title: options.title, id: block.id }));
  } catch (error) {
    if ((error as { code?: string }).code === INVALID_CHAT_BLOCK_CODE) {
      fail((error as Error).message);
      return;
    }
    fail(t('block.failed'), error instanceof Error ? error : new Error(String(error)));
  }
}

export function createChatCommand(): Command {
  return new Command('chat').description(t('description')).addCommand(
    new Command('block')
      .description(t('block.description'))
      .argument('<kind>', t('block.kindArgument', { kinds: Object.keys(BLOCK_KINDS).join(', ') }))
      .requiredOption('--title <title>', t('block.titleOption'))
      .option('--file <path>', t('block.fileOption'))
      .option('--content <text>', t('block.contentOption'))
      .option('--scope <conversation>', t('block.scopeOption', { variable: CHAT_SCOPE_ENV_VAR }))
      .action((kind: string, options: BlockOptions) => postBlock(kind, options))
  );
}
