/**
 * Session List Command
 *
 * List agent provider CLI sessions for the configured or specified provider.
 * Sessions are grouped by project path and sorted by last activity within each group.
 *
 * Usage:
 *   shep session ls
 *   shep session ls --claude-code
 *   shep session ls --cursor-cli
 *   shep session ls --gemini-cli
 *   shep session ls --limit 10
 *   shep session ls --flat
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListAgentSessionsUseCase } from '@/application/use-cases/agents/list-agent-sessions.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { fmt } from '../../ui/formatters.js';
import type { AgentSession } from '@/domain/generated/output.js';
import { AgentType } from '@/domain/generated/output.js';
import { getCliI18n } from '../../i18n.js';

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.session.ls.description'))
    .option('--claude-code', t('cli:commands.session.ls.claudeCodeOption'))
    .option('--cursor-cli', t('cli:commands.session.ls.cursorCliOption'))
    .option('--gemini-cli', t('cli:commands.session.ls.geminiCliOption'))
    .option('-n, --limit <n>', t('cli:commands.session.ls.limitOption'), '20')
    .option('--flat', t('cli:commands.session.ls.flatOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep session ls                      Recent sessions from every provider
  $ shep session ls --claude-code -n 50  The last 50 Claude Code sessions
  $ shep session ls --flat -n 0          Every session, ungrouped`
    )
    .action(async (opts) => {
      try {
        // Validate mutual exclusivity of provider flags
        const providerFlags = [opts.claudeCode, opts.cursorCli, opts.geminiCli].filter(Boolean);
        if (providerFlags.length > 1) {
          messages.error(t('cli:commands.session.ls.oneProviderOnly'));
          process.exitCode = 1;
          return;
        }

        const agentType = resolveAgentType(opts);
        const limit = parseInt(opts.limit, 10);

        const useCase = container.resolve(ListAgentSessionsUseCase);
        const sessions = await useCase.execute({ agentType, limit });

        if (sessions.length === 0) {
          messages.newline();
          messages.info(t('cli:commands.session.ls.noSessions'));
          messages.newline();
          return;
        }

        const providerLabel = sessions[0]?.agentType ?? 'agent';

        if (opts.flat) {
          renderFlat(sessions, providerLabel);
        } else {
          renderGrouped(sessions, providerLabel);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.session.ls.failedToList'), err);
        process.exitCode = 1;
      }
    });
}

function renderGrouped(sessions: AgentSession[], provider: string): void {
  const lines: string[] = [];

  lines.push('');
  lines.push(`  ${fmt.heading(`${provider} Sessions (${sessions.length})`)}`);

  // Group by project path
  const groups = new Map<string, AgentSession[]>();
  for (const session of sessions) {
    const key = session.projectPath;
    const group = groups.get(key);
    if (group) {
      group.push(session);
    } else {
      groups.set(key, [session]);
    }
  }

  // Sort groups by most recent session activity
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const aTime = getLatestTime(a[1]);
    const bTime = getLatestTime(b[1]);
    return bTime - aTime;
  });

  for (const [projectPath, groupSessions] of sortedGroups) {
    lines.push('');
    lines.push(`  📂 ${colors.brand(projectPath)}`);

    // Column header
    const header = `    ${pad('ID', 10)}  ${pad('Messages', 10)}  ${pad('Last Active', 14)}  Preview`;
    lines.push(`  ${colors.muted(header.trimStart())}`);

    for (const session of groupSessions) {
      const active = isRecentlyActive(session.lastMessageAt ?? session.updatedAt);
      const id = active ? colors.success(session.id.substring(0, 8)) : session.id.substring(0, 8);
      const indicator = active ? colors.success('●') : ' ';
      const msgCount = String(session.messageCount);
      const lastActive = formatRelativeTime(session.lastMessageAt ?? session.updatedAt);
      const preview = session.preview ? truncate(session.preview, 50) : colors.muted('-');

      lines.push(
        `   ${indicator} ${pad(id, 10)}  ${pad(msgCount, 10)}  ${pad(lastActive, 14)}  ${preview}`
      );
    }
  }

  lines.push('');
  console.log(lines.join('\n'));
}

function renderFlat(sessions: AgentSession[], provider: string): void {
  const lines: string[] = [];

  lines.push('');
  lines.push(`  ${fmt.heading(`${provider} Sessions (${sessions.length})`)}`);
  lines.push('');

  const header = `${pad('ID', 10)}  ${pad('Path', 40)}  ${pad('Msgs', 6)}  ${pad('Last Active', 14)}  Preview`;
  lines.push(`  ${colors.muted(header)}`);

  for (const session of sessions) {
    const active = isRecentlyActive(session.lastMessageAt ?? session.updatedAt);
    const id = active ? colors.success(session.id.substring(0, 8)) : session.id.substring(0, 8);
    const indicator = active ? colors.success('●') : ' ';
    const path = truncate(session.projectPath, 40);
    const msgCount = String(session.messageCount);
    const lastActive = formatRelativeTime(session.lastMessageAt ?? session.updatedAt);
    const preview = session.preview ? truncate(session.preview, 50) : colors.muted('-');

    lines.push(
      `  ${indicator} ${pad(id, 10)}  ${pad(path, 40)}  ${pad(msgCount, 6)}  ${pad(lastActive, 14)}  ${preview}`
    );
  }

  lines.push('');
  console.log(lines.join('\n'));
}

/** Sessions active within the last 2 minutes are considered "probably active" */
function isRecentlyActive(date: Date | string | undefined): boolean {
  const ts = toTimestamp(date);
  if (ts === 0) return false;
  return Date.now() - ts < 2 * 60 * 1000;
}

function getLatestTime(sessions: AgentSession[]): number {
  let latest = 0;
  for (const s of sessions) {
    const t = toTimestamp(s.lastMessageAt ?? s.updatedAt);
    if (t > latest) latest = t;
  }
  return latest;
}

function toTimestamp(date: Date | string | undefined): number {
  if (!date) return 0;
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function pad(text: string, width: number): string {
  // Strip ANSI for measurement
  // eslint-disable-next-line no-control-regex
  const visible = text.replace(/\x1B\[[0-9;]*m/g, '').length;
  if (visible >= width) return text;
  return text + ' '.repeat(width - visible);
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

export function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return colors.muted('-');

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return colors.muted('-');

  const diffMs = Date.now() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return 'just now';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 1)}…`;
}

export type { AgentSession };
