/**
 * Session Show Command
 *
 * Display details of a specific agent provider CLI session including metadata,
 * tool usage stats, and conversation messages.
 *
 * Usage:
 *   shep session show <id>
 *   shep session show <id> --messages 50
 *   shep session show <id> --claude-code
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetAgentSessionUseCase } from '@/application/use-cases/agents/get-agent-session.use-case.js';
import { SessionNotFoundError } from '@/domain/errors/session-not-found.error.js';
import { colors, messages } from '../../ui/index.js';
import { fmt } from '../../ui/formatters.js';
import type { AgentSession, AgentSessionMessage } from '@/domain/generated/output.js';
import { AgentType } from '@/domain/generated/output.js';
import type { SessionMetadata } from '@shepai/core/infrastructure/services/agents/sessions/claude-code-session.repository.js';
import { formatRelativeTime } from './ls.command.js';
import { getCliI18n } from '../../i18n.js';

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.session.show.description'))
    .argument('<id>', t('cli:commands.session.show.idArgument'))
    .option('--claude-code', t('cli:commands.session.show.claudeCodeOption'))
    .option('--cursor-cli', t('cli:commands.session.show.cursorCliOption'))
    .option('--gemini-cli', t('cli:commands.session.show.geminiCliOption'))
    .option('-m, --messages <n>', t('cli:commands.session.show.messagesOption'), '20')
    .addHelpText(
      'after',
      `
Examples:
  $ shep session show <session-id>
  $ shep session show <session-id> --messages 50
  $ shep session show <session-id> --cursor-cli`
    )
    .action(async (id: string, opts) => {
      try {
        // Validate mutual exclusivity of provider flags
        const providerFlags = [opts.claudeCode, opts.cursorCli, opts.geminiCli].filter(Boolean);
        if (providerFlags.length > 1) {
          messages.error(t('cli:commands.session.show.oneProviderOnly'));
          process.exitCode = 1;
          return;
        }

        const agentType = resolveAgentType(opts);
        const messageLimit = parseInt(opts.messages, 10);

        const useCase = container.resolve(GetAgentSessionUseCase);
        // Fetch all messages so we can show first N + last N
        const session = await useCase.execute({ id, agentType, messageLimit: 0 });

        renderSessionDetail(session, messageLimit);
      } catch (error) {
        if (error instanceof SessionNotFoundError) {
          messages.error(t('cli:commands.session.show.sessionNotFound', { error: error.message }));
          process.exitCode = 1;
          return;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.session.show.failedToShow'), err);
        process.exitCode = 1;
      }
    });
}

function resolveAgentType(opts: {
  claudeCode?: boolean;
  cursorCli?: boolean;
  geminiCli?: boolean;
}): AgentType | undefined {
  if (opts.claudeCode) return AgentType.ClaudeCode;
  if (opts.cursorCli) return AgentType.Cursor;
  if (opts.geminiCli) return AgentType.GeminiCli;
  return undefined;
}

function renderSessionDetail(session: AgentSession, _messageLimit: number): void {
  const t = getCliI18n().t;
  const sessionMessages = session.messages ?? [];
  const totalCount = session.messageCount;
  const meta = (session as AgentSession & { metadata?: SessionMetadata }).metadata;

  const lines: string[] = [];

  lines.push('');
  lines.push(`  ${fmt.heading(t('cli:commands.session.show.title'))}`);
  lines.push('');

  // Row 1: ID + Provider
  lines.push(`  ${field('ID', session.id)}    ${field('Provider', session.agentType)}`);

  // Row 2: Project path (full width — it's long)
  lines.push(`  ${field('Path', session.projectPath)}`);

  // Row 3: Git branch + CLI version + Permission mode
  if (meta) {
    const parts: string[] = [];
    if (meta.gitBranch) parts.push(field('Branch', colors.brand(meta.gitBranch)));
    if (meta.cliVersion) parts.push(field('CLI', `v${meta.cliVersion}`));
    if (meta.permissionMode) parts.push(field('Mode', meta.permissionMode));
    if (parts.length > 0) {
      lines.push(`  ${parts.join('    ')}`);
    }
  }

  // Row 4: Message counts + timing
  const msgParts: string[] = [];
  if (meta) {
    msgParts.push(
      field(
        'Messages',
        `${totalCount} total (${colors.info(String(meta.userMessageCount))} user, ${colors.success(String(meta.assistantMessageCount))} assistant)`
      )
    );
  } else {
    msgParts.push(field('Messages', String(totalCount)));
  }
  lines.push(`  ${msgParts.join('    ')}`);

  // Row 5: Timing
  const timeParts: string[] = [];
  const firstActive = session.firstMessageAt ? formatDate(session.firstMessageAt) : null;
  if (firstActive) timeParts.push(field('First Active', firstActive));
  timeParts.push(
    field('Last Active', formatRelativeTime(session.lastMessageAt ?? session.updatedAt))
  );
  if (firstActive && session.firstMessageAt && session.lastMessageAt) {
    const duration = computeDuration(session.firstMessageAt, session.lastMessageAt);
    if (duration) timeParts.push(field('Duration', duration));
  }
  lines.push(`  ${timeParts.join('    ')}`);

  // Tool usage section
  if (meta && Object.keys(meta.toolUsage).length > 0) {
    lines.push('');
    lines.push(`  ${colors.muted(t('cli:commands.session.show.toolUsage'))}`);

    const sorted = Object.entries(meta.toolUsage).sort((a, b) => b[1] - a[1]);
    const totalTools = sorted.reduce((sum, [, count]) => sum + count, 0);

    // Render tools in 3-column rows
    const toolEntries = sorted.map(([name, count]) => {
      const pct = Math.round((count / totalTools) * 100);
      return `${colors.muted(name)} ${count}${colors.muted(`(${pct}%)`)}`;
    });

    for (let i = 0; i < toolEntries.length; i += 3) {
      const row = toolEntries.slice(i, i + 3);
      lines.push(`  ${row.map((e) => pad(e, 26)).join('')}`);
    }
  }

  lines.push('');
  console.log(lines.join('\n'));

  // Messages
  if (sessionMessages.length === 0) {
    messages.info(t('cli:commands.session.show.noMessages'));
    return;
  }

  // Filter out empty messages for display
  const meaningful = sessionMessages.filter((m) => m.content.trim().length > 0);

  if (meaningful.length === 0) {
    messages.info(t('cli:commands.session.show.noDisplayableMessages'));
    return;
  }

  const half = Math.max(1, Math.floor(_messageLimit / 2));

  if (meaningful.length <= _messageLimit || _messageLimit === 0) {
    // Show all
    messages.info(t('cli:commands.session.show.messageCount', { count: meaningful.length }));
    renderMessages(meaningful);
  } else {
    // Show first half + gap + last half
    const first = meaningful.slice(0, half);
    const last = meaningful.slice(-half);
    const skipped = meaningful.length - first.length - last.length;

    messages.info(
      t('cli:commands.session.show.showingMessages', {
        first: first.length,
        last: last.length,
        total: meaningful.length,
      })
    );
    renderMessages(first);
    console.log(
      `  ${colors.muted(`  ${t('cli:commands.session.show.messagesSkipped', { count: skipped })}`)}\n`
    );
    renderMessages(last);
  }
}

/** Render a label: value pair */
function field(label: string, value: string): string {
  return `${colors.muted(label)}  ${value}`;
}

/** Pad a string (ANSI-aware) to a minimum visible width */
function pad(text: string, width: number): string {
  // eslint-disable-next-line no-control-regex
  const visible = text.replace(/\x1B\[[0-9;]*m/g, '').length;
  if (visible >= width) return text;
  return text + ' '.repeat(width - visible);
}

function computeDuration(start: Date | string, end: Date | string): string | null {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const diffMs = e.getTime() - s.getTime();
  if (isNaN(diffMs) || diffMs < 0) return null;

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  if (diffHours > 0) return `${diffHours}h ${mins}m`;
  if (diffMinutes > 0) return `${diffMinutes}m`;
  return '<1m';
}

function renderMessages(msgs: AgentSessionMessage[]): void {
  const t = getCliI18n().t;
  const lines: string[] = [''];
  for (const msg of msgs) {
    const content = msg.content.trim();
    const timestamp = formatDate(msg.timestamp);
    const timeStr = timestamp ? colors.muted(` (${timestamp})`) : '';

    if (msg.role === 'user') {
      lines.push(`  ${colors.info(t('cli:commands.session.show.userLabel'))}${timeStr}`);
    } else {
      lines.push(`  ${colors.success(t('cli:commands.session.show.assistantLabel'))}${timeStr}`);
    }

    for (const line of content.split('\n')) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }
  console.log(lines.join('\n'));
}

function formatDate(date: Date | string | undefined): string | null {
  if (!date) return null;
  try {
    const d = date instanceof Date ? date : new Date(date as string);
    return d.toLocaleString();
  } catch {
    return String(date);
  }
}
