/**
 * Shared output helpers of the `shep harness` commands (spec 119): turn lines,
 * results, usage, permission prompts and error handling.
 */
import { select, input } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { GrantScope, HarnessTaskOutcome, type HarnessSession } from '@/domain/generated/output.js';
import type { ExecuteHarnessTaskResult } from '@/application/services/harness/harness-task-service.js';
import type { ProgressEvent } from '@/application/services/harness/turn-context.js';
import type { HarnessUsageSummary } from '@/application/use-cases/harness/harness-metrics.js';
import {
  ListHarnessPermissionsUseCase,
  type HarnessPermissionItem,
} from '@/application/use-cases/harness/list-harness-permissions.use-case.js';
import { ResolveHarnessPermissionUseCase } from '@/application/use-cases/harness/resolve-harness-permission.use-case.js';
import { colors, messages } from '../../ui/index.js';

/** How often an interactive run checks for permission requests to answer. */
const PERMISSION_POLL_MS = 500;

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function fail(error: unknown, what: string): void {
  const err = error instanceof Error ? error : new Error(String(error));
  messages.error(`${what}: ${err.message}`);
  process.exitCode = 1;
}

const PROGRESS_ICON: Record<ProgressEvent['kind'], string> = {
  turn: '›',
  plan: '◦',
  tool: '•',
  permission: '!',
  result: '✓',
};

export function renderProgress(event: ProgressEvent): void {
  const line = `  ${PROGRESS_ICON[event.kind]} ${event.message}`;
  console.log(
    event.kind === 'permission'
      ? colors.warning(line)
      : event.kind === 'plan'
        ? colors.muted(line)
        : line
  );
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function formatCost(cost: number | undefined): string {
  return cost === undefined ? 'n/a' : `$${cost.toFixed(4)}`;
}

export function renderUsage(
  usage: Pick<HarnessUsageSummary, 'turns' | 'inputTokens' | 'outputTokens' | 'costUsd'>
): string {
  return `${usage.turns} turns · ${formatTokens(usage.inputTokens)} in / ${formatTokens(usage.outputTokens)} out · ${formatCost(usage.costUsd)}`;
}

export function renderResult(run: ExecuteHarnessTaskResult): void {
  const ok = run.result.status === HarnessTaskOutcome.Success;
  messages.newline();
  const head = `${run.result.status.toUpperCase()} — ${run.result.summary}`;
  if (ok) messages.success(head);
  else messages.warning(head);
  for (const e of run.result.evidence) {
    console.log(
      `  ${colors.muted('evidence')} ${e.resource}${e.startLine ? `:${e.startLine}${e.endLine ? `-${e.endLine}` : ''}` : ''}`
    );
  }
  console.log(`  ${colors.muted('usage')} ${renderUsage(run.usage)}`);
  console.log(`  ${colors.muted('session')} ${run.session.id}`);
}

export function renderStandaloneNextSteps(session: HarnessSession): void {
  console.log(colors.muted('\n  Next:'));
  console.log(
    colors.muted(
      `    shep harness apply ${session.id} --branch <name>   commit the change to a branch`
    )
  );
  console.log(
    colors.muted(`    shep harness promote ${session.id}                 continue it as a feature`)
  );
  console.log(
    colors.muted(`    shep harness discard ${session.id}                 remove the worktree`)
  );
}

const SCOPE_LABEL: Record<GrantScope, string> = {
  [GrantScope.Once]: 'Allow once',
  [GrantScope.Task]: 'Allow for this phase',
  [GrantScope.Session]: 'Allow for this session',
};

export function describePermission(item: HarnessPermissionItem): string {
  const d = item.decision;
  const lines = [
    `${colors.warning('Permission needed')} ${d.action.summary}`,
    ...(d.action.intent ? [`  Agent's reason: ${d.action.intent}`] : []),
    '  This action will:',
    ...(d.effects.length
      ? d.effects.map((e) => `    • ${e.description}`)
      : ['    • (no predicted effects)']),
    `  Rules: ${d.matchedRuleIds.join(', ') || d.reasonCode}`,
  ];
  return lines.join('\n');
}

/** Ask the person at the terminal and record the answer. */
export async function promptForPermission(item: HarnessPermissionItem): Promise<void> {
  console.log(`\n${describePermission(item)}`);
  const resolver = container.resolve(ResolveHarnessPermissionUseCase);
  if (!item.approvable) {
    messages.warning('This action is denied by a hard rule and cannot be approved.');
    return;
  }
  const choice = await select<string>({
    message: 'Allow this action?',
    choices: [
      ...item.scopes.map((s) => ({ name: SCOPE_LABEL[s], value: s })),
      { name: 'Deny', value: 'deny' },
    ],
  });
  const note = await input({ message: 'Note to the agent (optional):' });
  await resolver.execute({
    id: item.decision.id,
    allow: choice !== 'deny',
    ...(choice !== 'deny' && { scope: choice as GrantScope }),
    ...(note.trim() && { note }),
    resolvedBy: 'cli',
  });
}

/** Poll for this session's permission requests and prompt for each one. */
export function watchPermissions(sessionId: string): { stop: () => void } {
  const list = container.resolve(ListHarnessPermissionsUseCase);
  const seen = new Set<string>();
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void list
      .execute({ sessionId })
      .then(async (pending) => {
        for (const item of pending) {
          if (seen.has(item.decision.id)) continue;
          seen.add(item.decision.id);
          await promptForPermission(item);
        }
      })
      .catch((error: unknown) => fail(error, 'Could not answer a permission request'))
      .finally(() => {
        busy = false;
      });
  }, PERMISSION_POLL_MS);
  return { stop: () => clearInterval(timer) };
}
