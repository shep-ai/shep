/**
 * Agent Show Command
 *
 * Display details of a specific agent run including execution status,
 * PID, current node, heartbeat, and output.
 *
 * Usage:
 *   shep agent show <id>
 */

import { Command } from 'commander';
import { colors, messages, symbols, renderDetailView } from '../../ui/index.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { resolveAgentRun } from './resolve-run.js';
import { container } from '@/infrastructure/di/container.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { computeWorktreePath } from '@/infrastructure/services/ide-launchers/compute-worktree-path.js';
import { getCliI18n } from '../../i18n.js';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.agent.show.description'))
    .argument('<id>', t('cli:commands.agent.show.idArgument'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep agent show <id>       Show details for an agent run
  $ shep agent show a1b2c3d4   Inspect a run by short ID`
    )
    .action(async (id: string) => {
      try {
        const resolved = await resolveAgentRun(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const agentRun = resolved.run;

        const pidAlive =
          agentRun.pid && (agentRun.status === 'running' || agentRun.status === 'pending')
            ? isProcessAlive(agentRun.pid)
            : null;

        const currentNode =
          agentRun.status === 'running' && agentRun.result?.startsWith('node:')
            ? agentRun.result.slice(5)
            : null;

        const stuckStatus = getStuckStatus(agentRun);

        // Resolve worktree path from associated feature
        let worktreePath: string | null = null;
        let specPath: string | null = null;
        if (agentRun.featureId) {
          try {
            const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
            const feature = await featureRepo.findById(agentRun.featureId);
            if (feature) {
              worktreePath = computeWorktreePath(feature.repositoryPath, feature.branch);
              specPath = feature.specPath ?? null;
            }
          } catch {
            // Feature lookup failed
          }
        }

        // Text blocks for prompt/result/error
        const textBlocks = [];
        if (agentRun.prompt) {
          textBlocks.push({ title: 'Prompt', content: agentRun.prompt });
        }
        if (agentRun.result && !agentRun.result.startsWith('node:')) {
          textBlocks.push({ title: 'Result', content: agentRun.result });
        }
        if (agentRun.error) {
          textBlocks.push({
            title: 'Error',
            content: agentRun.error,
            color: colors.error,
          });
        }

        renderDetailView({
          title: t('cli:commands.agent.show.title'),
          sections: [
            {
              fields: [
                { label: 'ID', value: agentRun.id },
                { label: 'Agent', value: agentRun.agentName },
                { label: 'Type', value: agentRun.agentType },
                { label: 'Status', value: formatStatus(agentRun, pidAlive) },
                { label: 'Node', value: currentNode ? colors.info(currentNode) : null },
                { label: 'PID', value: formatPid(agentRun, pidAlive) },
                { label: 'Thread', value: agentRun.threadId },
              ],
            },
            {
              title: t('cli:commands.agent.show.pathsTitle'),
              fields: [
                { label: 'Worktree', value: worktreePath },
                { label: 'Spec Dir', value: specPath },
              ],
            },
            {
              title: t('cli:commands.agent.show.timingTitle'),
              fields: [
                { label: 'Started', value: formatDate(agentRun.startedAt) },
                { label: 'Completed', value: formatDate(agentRun.completedAt) },
                { label: 'Duration', value: getDurationString(agentRun) },
                { label: 'Heartbeat', value: formatDate(agentRun.lastHeartbeat) },
                { label: 'Created', value: formatDate(agentRun.createdAt) },
                { label: 'Updated', value: formatDate(agentRun.updatedAt) },
                { label: 'Warning', value: stuckStatus },
              ],
            },
          ],
          textBlocks,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.agent.show.failedToShow'), err);
        process.exitCode = 1;
      }
    });
}

function formatStatus(agentRun: AgentRun, pidAlive: boolean | null): string {
  const isActive = agentRun.status === 'running' || agentRun.status === 'pending';
  if (isActive && pidAlive === false) {
    return `${colors.error(symbols.error)} ${colors.error('crashed')}`;
  }

  const map: Record<string, string> = {
    pending: `${colors.muted(symbols.dotEmpty)} ${colors.muted('pending')}`,
    running: `${colors.info(symbols.dot)} ${colors.info('running')}`,
    completed: `${colors.success(symbols.success)} ${colors.success('completed')}`,
    failed: `${colors.error(symbols.error)} ${colors.error('failed')}`,
    interrupted: `${colors.error(symbols.error)} ${colors.error('interrupted')}`,
    cancelled: `${colors.muted(symbols.dotEmpty)} ${colors.muted('cancelled')}`,
  };
  return map[agentRun.status] || colors.muted(agentRun.status);
}

function formatPid(agentRun: AgentRun, pidAlive: boolean | null): string {
  if (!agentRun.pid) return colors.muted('-');
  const pidStr = String(agentRun.pid);
  if (pidAlive === true) return `${pidStr} ${colors.success('(alive)')}`;
  if (pidAlive === false) return `${pidStr} ${colors.error('(dead)')}`;
  return pidStr;
}

function formatDate(date?: string): string | null {
  if (!date) return null;
  try {
    return new Date(date).toLocaleString();
  } catch {
    return date;
  }
}

function getDurationString(agentRun: AgentRun): string {
  if (agentRun.status === 'pending') {
    const ms = Date.now() - new Date(agentRun.createdAt).getTime();
    return `${formatDuration(ms)} ${colors.error('(stuck in pending)')}`;
  }
  if (agentRun.startedAt && agentRun.completedAt) {
    return formatDuration(
      new Date(agentRun.completedAt).getTime() - new Date(agentRun.startedAt).getTime()
    );
  }
  if (agentRun.startedAt) {
    const ms = Date.now() - new Date(agentRun.startedAt).getTime();
    return `${formatDuration(ms)} ${colors.info('(running)')}`;
  }
  return '-';
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function getStuckStatus(agentRun: AgentRun): string | null {
  if (agentRun.status === 'pending' && !agentRun.startedAt) {
    const hours = (Date.now() - new Date(agentRun.createdAt).getTime()) / (1000 * 60 * 60);
    if (hours > 24)
      return colors.error(`STUCK: Pending for ${Math.floor(hours)} hours. Check agent logs.`);
    if (hours > 1) return colors.error(`WARNING: Pending for ${Math.floor(hours)} hour(s).`);
  }
  if (agentRun.status === 'running' && agentRun.startedAt) {
    const hours = (Date.now() - new Date(agentRun.startedAt).getTime()) / (1000 * 60 * 60);
    if (hours > 24)
      return colors.error(
        `STUCK: Running for ${Math.floor(hours)} hours. Process may have crashed.`
      );
  }
  return null;
}
