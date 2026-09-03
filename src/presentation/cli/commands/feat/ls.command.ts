/**
 * Feature List Command
 *
 * Lists features in a hierarchical tree view: repo → feature → child → child…
 * Repos and features are ordered by creation date descending.
 *
 * Usage: shep feat ls [options]
 *
 * @example
 * $ shep feat ls
 * $ shep feat ls --repo /path/to/project
 */

import path from 'node:path';
import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListFeaturesUseCase } from '@/application/use-cases/features/list-features.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { Feature, AgentRun, PhaseTiming, Repository } from '@/domain/generated/output.js';
import { colors, symbols, messages, fmt } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

interface LsOptions {
  repo?: string;
  includeDeleted?: boolean;
  showArchived?: boolean;
}

/** Map graph node names to human-readable phase labels (active). */
const NODE_TO_PHASE: Record<string, string> = {
  analyze: 'Analyzing',
  requirements: 'Requirements',
  research: 'Researching',
  plan: 'Planning',
  implement: 'Implementing',
  merge: 'Merging',
};

/** Map graph node names to review action labels. */
const NODE_TO_REVIEW: Record<string, string> = {
  analyze: 'Review Analysis',
  requirements: 'Review Requirements',
  research: 'Review Research',
  plan: 'Review Plan',
  implement: 'Review Merge',
  merge: 'Review Merge',
};

/**
 * Derive the display status from the agent run.
 */
function formatStatus(feature: Feature, run: AgentRun | null): string {
  if (feature.lifecycle === 'Archived') {
    return `${colors.muted(symbols.dotEmpty)} ${colors.muted('Archived')}`;
  }

  if (feature.lifecycle === 'Deleting') {
    return `${colors.muted(symbols.spinner[0])} ${colors.muted('Deleting')}`;
  }

  if (feature.lifecycle === 'Blocked') {
    return `${colors.warning(symbols.dotEmpty)} ${colors.warning('Blocked')}`;
  }

  if (feature.lifecycle === 'Pending') {
    return `${colors.muted(symbols.dotEmpty)} ${colors.muted('Pending')}`;
  }

  if (!run) {
    return `${colors.muted(symbols.dotEmpty)} ${colors.muted(feature.lifecycle)}`;
  }

  const isRunning = run.status === 'running' || run.status === 'pending';
  const nodeName = run.result?.startsWith('node:') ? run.result.slice(5) : undefined;
  const phase = nodeName ? (NODE_TO_PHASE[nodeName] ?? nodeName) : feature.lifecycle;

  if (isRunning) {
    if (run.pid && !isProcessAlive(run.pid)) {
      return `${colors.error(symbols.error)} ${colors.error('Crashed')}`;
    }
    return `${colors.info(symbols.spinner[0])} ${colors.info(phase)}`;
  }

  if (run.status === 'completed') {
    return `${colors.success(symbols.success)} ${colors.success('Completed')}`;
  }
  if (run.status === 'failed') {
    return `${colors.error(symbols.error)} ${colors.error('Failed')}`;
  }
  if (run.status === 'waiting_approval') {
    const action = nodeName ? (NODE_TO_REVIEW[nodeName] ?? phase) : phase;
    return `${colors.brand(symbols.pointer)} ${colors.brand(action)}`;
  }
  if (run.status === 'interrupted') {
    return `${colors.error(symbols.error)} ${colors.error('Interrupted')}`;
  }

  return `${colors.muted(symbols.dotEmpty)} ${colors.muted(phase)}`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Truncate a string to maxLen, appending ellipsis if needed. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + symbols.ellipsis;
}

/** Format a duration in ms to a compact human-readable string. */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Compute total elapsed from phase timings (sum of all phases, including live delta). */
function formatElapsed(run: AgentRun | null, phaseTimings: PhaseTiming[]): string {
  if (phaseTimings.length > 0) {
    const now = Date.now();
    const totalMs = phaseTimings.reduce((sum, pt) => {
      if (pt.durationMs != null) return sum + Number(pt.durationMs);
      if (pt.startedAt) return sum + (now - new Date(pt.startedAt).getTime());
      return sum;
    }, 0);

    const isRunning = run?.status === 'running' || run?.status === 'pending';
    return isRunning ? colors.info(formatDuration(totalMs)) : colors.muted(formatDuration(totalMs));
  }

  if (!run?.startedAt) return '';
  const started = new Date(run.startedAt).getTime();
  const isRunning = run.status === 'running' || run.status === 'pending';
  const end = isRunning
    ? Date.now()
    : run.completedAt
      ? new Date(run.completedAt).getTime()
      : Date.now();

  return isRunning
    ? colors.info(formatDuration(end - started))
    : colors.muted(formatDuration(end - started));
}

/** Format when the feature finished (only for completed runs). */
function formatDone(run: AgentRun | null): string {
  if (!run?.completedAt || run.status !== 'completed') return '';

  const completed = new Date(run.completedAt).getTime();
  return colors.muted(`${formatDuration(Date.now() - completed)} ago`);
}

/** Format approval gates and push flag as compact checkboxes: R P M ↑ */
function formatGates(feature: Feature): string {
  const { allowPrd, allowPlan, allowMerge } = feature.approvalGates;
  const gate = (on: boolean) => (on ? colors.success('■') : colors.muted('□'));
  const push = feature.push ? colors.accent('■') : colors.muted('□');
  return `${gate(allowPrd)} ${gate(allowPlan)} ${gate(allowMerge)} ${push}`;
}

/** Convert a date value (any type from domain) to a timestamp for sorting. */
export function toTimestamp(val: unknown): number {
  if (!val) return 0;
  try {
    return new Date(val as string | Date).getTime();
  } catch {
    return 0;
  }
}

/** Strip ANSI escape sequences to get visible character count. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*m/g, '');
}

/** Pad a string that may contain ANSI codes to a given visible width. */
function ansiPad(text: string, width: number): string {
  const visible = stripAnsi(text).length;
  if (visible >= width) return text;
  return text + ' '.repeat(width - visible);
}

// ─── Tree Data Structures ────────────────────────────────────────────────────

interface Entry {
  feature: Feature;
  run: AgentRun | null;
  phases: PhaseTiming[];
}

interface TreeNode {
  entry: Entry;
  children: TreeNode[];
}

interface RepoGroup {
  repoPath: string;
  repoName: string;
  repoCreatedAt: number;
  roots: TreeNode[];
}

interface FlatRow {
  entry: Entry;
  parentIsLast: boolean[];
  isLast: boolean;
}

/**
 * Build a recursive feature tree within a single repo group.
 * Features with a parentId that matches another feature in the group become children.
 * All levels are sorted by createdAt descending.
 */
export function buildTree(entries: Entry[]): TreeNode[] {
  const byId = new Map<string, Entry>();
  for (const e of entries) byId.set(e.feature.id, e);

  const childrenByParent = new Map<string, Entry[]>();
  const rootEntries: Entry[] = [];

  for (const e of entries) {
    const pid = e.feature.parentId;
    if (pid && byId.has(pid)) {
      const list = childrenByParent.get(pid) ?? [];
      list.push(e);
      childrenByParent.set(pid, list);
    } else {
      rootEntries.push(e);
    }
  }

  function sortDesc(arr: Entry[]): Entry[] {
    return [...arr].sort(
      (a, b) => toTimestamp(b.feature.createdAt) - toTimestamp(a.feature.createdAt)
    );
  }

  function buildNodes(arr: Entry[]): TreeNode[] {
    return sortDesc(arr).map((e) => ({
      entry: e,
      children: buildNodes(childrenByParent.get(e.feature.id) ?? []),
    }));
  }

  return buildNodes(rootEntries);
}

/**
 * Group entries by repositoryPath and sort repos by createdAt desc.
 * Uses the Repository entity's createdAt if available; falls back to the
 * newest feature's createdAt in that repo group.
 */
export function groupByRepo(entries: Entry[], repos: Repository[]): RepoGroup[] {
  const repoByPath = new Map<string, Repository>();
  for (const r of repos) {
    repoByPath.set(r.path.replace(/\\/g, '/'), r);
  }

  const groupMap = new Map<string, Entry[]>();
  for (const e of entries) {
    const repoPath = e.feature.repositoryPath.replace(/\\/g, '/');
    const list = groupMap.get(repoPath) ?? [];
    list.push(e);
    groupMap.set(repoPath, list);
  }

  const groups: RepoGroup[] = [];
  for (const [repoPath, groupEntries] of groupMap) {
    const repo = repoByPath.get(repoPath);
    const repoCreatedAt = repo
      ? toTimestamp(repo.createdAt)
      : Math.max(...groupEntries.map((e) => toTimestamp(e.feature.createdAt)));
    groups.push({
      repoPath,
      repoName: path.basename(repoPath),
      repoCreatedAt,
      roots: buildTree(groupEntries),
    });
  }

  groups.sort((a, b) => b.repoCreatedAt - a.repoCreatedAt);
  return groups;
}

/** Flatten a tree into rows with prefix context for rendering. */
export function flattenTree(nodes: TreeNode[], parentIsLast: boolean[]): FlatRow[] {
  const result: FlatRow[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    result.push({ entry: node.entry, parentIsLast, isLast });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, [...parentIsLast, isLast]));
    }
  }
  return result;
}

/** Build the tree-drawing prefix string for a given depth context. */
export function buildTreePrefix(parentIsLast: boolean[], isLast: boolean): string {
  let prefix = '';
  for (const wasLast of parentIsLast) {
    prefix += wasLast ? '   ' : '│  ';
  }
  prefix += isLast ? '└─ ' : '├─ ';
  return prefix;
}

// Column widths for feature rows
const FIRST_COL_WIDTH = 44; // tree prefix + id + 2 spaces + name
const STATUS_WIDTH = 22;
const GATES_WIDTH = 10;
const ELAPSED_WIDTH = 9;

/** Render a single feature row as a formatted string. */
export function renderFeatureRow(entry: Entry, treePrefix: string): string {
  const { feature, run, phases } = entry;
  const shortId = colors.muted(feature.id.slice(0, 8));
  const prefixPlusId = `${treePrefix}${shortId}  `;
  const prefixPlusIdLen = stripAnsi(prefixPlusId).length;
  const nameMax = Math.max(FIRST_COL_WIDTH - prefixPlusIdLen, 8);
  const name = truncate(feature.name, nameMax);
  const firstCol = ansiPad(prefixPlusId + name, FIRST_COL_WIDTH);
  const status = ansiPad(formatStatus(feature, run), STATUS_WIDTH);
  const gates = ansiPad(formatGates(feature), GATES_WIDTH);
  const elapsed = ansiPad(formatElapsed(run, phases), ELAPSED_WIDTH);
  const done = formatDone(run);
  return `  ${firstCol}  ${status}  ${gates}  ${elapsed}  ${done}`;
}

/** Count total features across all repo groups. */
function countFeatures(groups: RepoGroup[]): number {
  let count = 0;
  function countNodes(nodes: TreeNode[]): void {
    for (const n of nodes) {
      count++;
      countNodes(n.children);
    }
  }
  for (const g of groups) countNodes(g.roots);
  return count;
}

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.feat.ls.description'))
    .option('-r, --repo <path>', t('cli:commands.feat.ls.repoOption'))
    .option('--include-deleted', t('cli:commands.feat.ls.includeDeletedOption'))
    .option('--show-archived', t('cli:commands.feat.ls.showArchivedOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat ls
  $ shep feat ls --repo /path/to/project
  $ shep feat ls --show-archived`
    )
    .action(async (options: LsOptions) => {
      try {
        const useCase = container.resolve(ListFeaturesUseCase);
        const runRepo = container.resolve<IAgentRunRepository>('IAgentRunRepository');
        const phaseRepo = container.resolve<IPhaseTimingRepository>('IPhaseTimingRepository');
        const repoRepo = container.resolve<IRepositoryRepository>('IRepositoryRepository');

        const filters = {
          ...(options.repo && { repositoryPath: options.repo }),
          ...(options.includeDeleted && { includeDeleted: true }),
          ...(options.showArchived && { includeArchived: true }),
        };
        const features = await useCase.execute(
          Object.keys(filters).length > 0 ? filters : undefined
        );

        // Load agent runs, phase timings, and repos in parallel
        const [runs, timings, repos] = await Promise.all([
          Promise.all(
            features.map((f) =>
              f.agentRunId ? runRepo.findById(f.agentRunId) : Promise.resolve(null)
            )
          ),
          Promise.all(features.map((f) => phaseRepo.findByFeatureId(f.id))),
          repoRepo.list(),
        ]);

        const entries: Entry[] = features.map((feature, i) => ({
          feature,
          run: runs[i],
          phases: timings[i],
        }));

        const groups = groupByRepo(entries, repos);
        const total = countFeatures(groups);

        if (total === 0) {
          messages.newline();
          messages.info(t('cli:commands.feat.ls.noFeatures'));
          messages.newline();
          return;
        }

        const lines: string[] = [];
        lines.push('');
        lines.push(
          `  ${fmt.heading(t('cli:commands.feat.ls.featuresHeading', { count: String(total) }))}`
        );
        lines.push('');

        // Column headers
        const h1 = colors.muted(t('cli:commands.feat.ls.nameHeader').padEnd(FIRST_COL_WIDTH));
        const h2 = colors.muted(t('cli:commands.feat.ls.statusHeader').padEnd(STATUS_WIDTH));
        const h3 = colors.muted(t('cli:commands.feat.ls.gatesHeader').padEnd(GATES_WIDTH));
        const h4 = colors.muted(t('cli:commands.feat.ls.elapsedHeader').padEnd(ELAPSED_WIDTH));
        const h5 = colors.muted(t('cli:commands.feat.ls.doneHeader'));
        lines.push(`  ${h1}  ${h2}  ${h3}  ${h4}  ${h5}`);

        for (const group of groups) {
          lines.push('');
          lines.push(`  ${fmt.heading(group.repoName)}  ${colors.muted(group.repoPath)}`);

          const flatRows = flattenTree(group.roots, []);
          for (const { entry, parentIsLast, isLast } of flatRows) {
            const treePrefix = buildTreePrefix(parentIsLast, isLast);
            lines.push(renderFeatureRow(entry, treePrefix));
          }
        }

        lines.push('');
        console.log(lines.join('\n'));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.ls.failedToList'), err);
        process.exitCode = 1;
      }
    });
}
