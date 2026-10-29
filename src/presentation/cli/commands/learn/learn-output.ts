/**
 * Shared output for `shep learn` (spec 150): words for the learned-harness
 * enums (never a raw enum value in text), short ids, dates, JSON and the
 * repository option every repository-scoped subcommand takes.
 */

import type { Command } from 'commander';
import {
  HarnessComponentKind,
  HarnessEditVerdict,
  HarnessOrigin,
  HarnessRefinementStatus,
  HarnessVersionTrend,
  LearnedHarnessStatus,
  MemoryScope,
} from '@/domain/generated/output.js';
import { colors, messages, OutputFormatter } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { resolveCliPath } from '../../paths.js';

export const LEARN = 'cli:commands.learn';
export const FAILED = `${LEARN}.failed`;
/** Who the CLI acts as when it changes a version. */
export const CLI_ACTOR = 'user:cli';

const SHORT_ID_LENGTH = 8;
const ISO_DAY_LENGTH = 10;
const PERCENT = 100;
const COST_DECIMALS = 2;

const LABELS = `${LEARN}.labels`;

const STATUS: Record<LearnedHarnessStatus, string> = {
  [LearnedHarnessStatus.Candidate]: 'candidate',
  [LearnedHarnessStatus.Adopted]: 'adopted',
  [LearnedHarnessStatus.Rejected]: 'rejected',
  [LearnedHarnessStatus.RolledBack]: 'rolledBack',
  [LearnedHarnessStatus.Superseded]: 'superseded',
};

const ORIGIN: Record<HarnessOrigin, string> = {
  [HarnessOrigin.Base]: 'base',
  [HarnessOrigin.Reflect]: 'reflect',
  [HarnessOrigin.Explore]: 'explore',
  [HarnessOrigin.Manual]: 'manual',
};

const SCOPE: Record<MemoryScope, string> = {
  [MemoryScope.Project]: 'project',
  [MemoryScope.Organization]: 'organization',
  [MemoryScope.Space]: 'space',
  [MemoryScope.ProductLine]: 'productLine',
};

const TREND: Record<HarnessVersionTrend, string> = {
  [HarnessVersionTrend.InsufficientData]: 'insufficientData',
  [HarnessVersionTrend.Improved]: 'improved',
  [HarnessVersionTrend.Unchanged]: 'unchanged',
  [HarnessVersionTrend.Regressed]: 'regressed',
  [HarnessVersionTrend.NoBaseline]: 'noBaseline',
};

const VERDICT: Record<HarnessEditVerdict, string> = {
  [HarnessEditVerdict.Helped]: 'helped',
  [HarnessEditVerdict.Hurt]: 'hurt',
  [HarnessEditVerdict.NoObservedEffect]: 'noObservedEffect',
  [HarnessEditVerdict.Confounded]: 'confounded',
  [HarnessEditVerdict.Untested]: 'untested',
};

const KIND: Record<HarnessComponentKind, string> = {
  [HarnessComponentKind.Instructions]: 'instructions',
  [HarnessComponentKind.Guardrails]: 'guardrails',
  [HarnessComponentKind.Memory]: 'memory',
  [HarnessComponentKind.ToolGuidance]: 'toolGuidance',
  [HarnessComponentKind.Skill]: 'skill',
  [HarnessComponentKind.Script]: 'script',
  [HarnessComponentKind.Subagent]: 'subagent',
  [HarnessComponentKind.Hook]: 'hook',
};

const REFINEMENT: Record<HarnessRefinementStatus, string> = {
  [HarnessRefinementStatus.Running]: 'running',
  [HarnessRefinementStatus.Proposed]: 'proposed',
  [HarnessRefinementStatus.KeptBase]: 'keptBase',
  [HarnessRefinementStatus.FellBack]: 'fellBack',
  [HarnessRefinementStatus.OverBudget]: 'overBudget',
  [HarnessRefinementStatus.Failed]: 'failed',
};

const TREND_COLOR: Record<HarnessVersionTrend, (text: string) => string> = {
  [HarnessVersionTrend.InsufficientData]: colors.muted,
  [HarnessVersionTrend.Improved]: colors.success,
  [HarnessVersionTrend.Unchanged]: colors.muted,
  [HarnessVersionTrend.Regressed]: colors.error,
  [HarnessVersionTrend.NoBaseline]: colors.muted,
};

const label = (group: string, key: string): string => getCliI18n().t(`${LABELS}.${group}.${key}`);

export const labels = {
  status: (value: LearnedHarnessStatus) => label('status', STATUS[value]),
  origin: (value: HarnessOrigin) => label('origin', ORIGIN[value]),
  scope: (value: MemoryScope) => label('scope', SCOPE[value]),
  trend: (value: HarnessVersionTrend) => TREND_COLOR[value](label('trend', TREND[value])),
  verdict: (value: HarnessEditVerdict) => label('verdict', VERDICT[value]),
  kind: (value: HarnessComponentKind) => label('kind', KIND[value]),
  refinement: (value: HarnessRefinementStatus) => label('refinement', REFINEMENT[value]),
};

export const shortId = (id: string): string => id.slice(0, SHORT_ID_LENGTH);

/** `YYYY-MM-DD` of an entity timestamp (stored as a Date or an ISO string). */
export const isoDay = (date: Date | string): string =>
  new Date(date).toISOString().slice(0, ISO_DAY_LENGTH);

export const percent = (ratio: number): string => `${Math.round(ratio * PERCENT)}%`;

export const usd = (amount: number): string => amount.toFixed(COST_DECIMALS);

export function printJson(value: unknown): void {
  messages.log(OutputFormatter.formatAsJSON(value));
}

/** An `Examples:` help block (checked by the CLI help-examples test). */
export function examples(...lines: string[]): string {
  return `\nExamples:\n${lines.map((line) => `  $ ${line}`).join('\n')}`;
}

export interface JsonOption {
  json?: boolean;
}

export interface RepoOption {
  repo?: string;
}

/** Adds `-r, --repo <path>`; read it back with `repositoryPathOf`. */
export function withRepoOption(cmd: Command): Command {
  return cmd.option('-r, --repo <path>', getCliI18n().t(`${LEARN}.repoOption`));
}

/** The repository a command acts on: `--repo`, else the working directory (absolute). */
export const repositoryPathOf = (options: RepoOption): string => resolveCliPath(options.repo);

/** Print an error and set exit code 1. */
export function fail(text: string): void {
  messages.error(text);
  process.exitCode = 1;
}
