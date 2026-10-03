/**
 * Inspection commands (spec 119, F6): ls, inspect, view, explain.
 */
import { Command, Option } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ChunkVisibility, HarnessSessionOrigin } from '@/domain/generated/output.js';
import { ListHarnessSessionsUseCase } from '@/application/use-cases/harness/list-harness-sessions.use-case.js';
import { GetHarnessSessionUseCase } from '@/application/use-cases/harness/get-harness-session.use-case.js';
import { GetContextPlanUseCase } from '@/application/use-cases/harness/get-context-plan.use-case.js';
import { RenderChunkViewUseCase } from '@/application/use-cases/harness/render-chunk-view.use-case.js';
import { ExplainHarnessDecisionUseCase } from '@/application/use-cases/harness/explain-harness-decision.use-case.js';
import { colors, fmt, messages } from '../../ui/index.js';
import { fail, formatTokens, printJson, renderUsage } from './harness-output.js';

export function createLsCommand(): Command {
  return new Command('ls')
    .description('List harness sessions')
    .addOption(
      new Option('--origin <origin>', 'Only this origin').choices(
        Object.values(HarnessSessionOrigin)
      )
    )
    .option('--feature <id>', 'Only sessions of this feature')
    .option('--json', 'Print JSON')
    .action(async (opts: { origin?: HarnessSessionOrigin; feature?: string; json?: boolean }) => {
      try {
        const items = await container.resolve(ListHarnessSessionsUseCase).execute({
          ...(opts.origin && { origins: [opts.origin] }),
          ...(opts.feature && { featureId: opts.feature }),
        });
        if (opts.json) return printJson(items);
        if (items.length === 0)
          return messages.info(
            'No harness sessions yet. Start one with: shep harness run "<task>"'
          );
        for (const i of items) {
          const pending = i.pendingPermissions
            ? colors.warning(` · ${i.pendingPermissions} awaiting approval`)
            : '';
          console.log(
            `${colors.brand(i.session.id)}  ${i.session.status.padEnd(9)} ${i.session.origin.padEnd(10)} ${i.session.mode.padEnd(11)} ${i.taskCount} task(s)  ${i.session.title}${pending}`
          );
        }
      } catch (error) {
        fail(error, 'Could not list sessions');
      }
    });
}

function inspectSession(): Command {
  return new Command('session')
    .description('A session with its tasks, turns and permission log')
    .argument('<id>', 'Session id or feature AgentRun id')
    .option('--json', 'Print JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const d = await container.resolve(GetHarnessSessionUseCase).execute({ id });
        if (opts.json) return printJson(d);
        console.log(fmt.heading(d.session.title));
        console.log(
          `  ${d.session.id} · ${d.session.origin} · ${d.session.mode} · ${d.session.status}`
        );
        if (d.session.worktreePath)
          console.log(
            colors.muted(`  worktree ${d.session.worktreePath} (${d.session.worktreeBranch})`)
          );
        console.log(
          `  ${renderUsage(d.usage)} · tool output seen ${formatTokens(d.usage.visibleToolTokens)} of ${formatTokens(d.usage.rawToolTokens)} raw`
        );
        for (const t of d.tasks) {
          console.log(
            `\n  ${colors.brand(t.task.id)} ${t.task.phase ? `[${t.task.phase}] ` : ''}${t.task.status} — ${t.task.goal}`
          );
          console.log(colors.muted(`    ${renderUsage(t.usage)}`));
          for (const p of t.plans) {
            const tag = p.shadow ? ' shadow' : p.degraded ? ' degraded' : '';
            console.log(
              colors.muted(
                `    turn ${p.turn}: ${formatTokens(p.estimatedTokens)}/${formatTokens(p.tokenBudget)} tokens, ${p.candidateCount} candidates (plan ${p.id})${tag}`
              )
            );
          }
          for (const c of t.toolCalls)
            console.log(`    • ${c.capabilityId} ${c.status} — ${c.summary ?? ''}`);
          if (t.task.result)
            console.log(`    result: ${t.task.result.status} — ${t.task.result.summary}`);
        }
        if (d.pendingPermissions.length)
          messages.warning(
            `${d.pendingPermissions.length} action(s) awaiting approval: shep harness permissions ls`
          );
      } catch (error) {
        fail(error, 'Could not inspect the session');
      }
    });
}

function inspectContext(): Command {
  return new Command('context')
    .description('What the model saw on one turn (the context plan)')
    .argument('<id>', 'Plan id, or task id (with --turn)')
    .option('--turn <n>', 'Turn number when <id> is a task id')
    .option('--json', 'Print JSON')
    .action(async (id: string, opts: { turn?: string; json?: boolean }) => {
      try {
        const uc = container.resolve(GetContextPlanUseCase);
        const turn = opts.turn ? Number.parseInt(opts.turn, 10) : undefined;
        const detail = await uc
          .execute({ planId: id })
          .catch(() => uc.execute({ taskId: id, ...(turn !== undefined && { turn }) }));
        if (opts.json) return printJson(detail);
        const { plan, summary } = detail;
        console.log(
          fmt.heading(
            `Turn ${plan.turn} — ${formatTokens(plan.estimatedTokens)} of ${formatTokens(plan.tokenBudget)} tokens`
          )
        );
        console.log(
          colors.muted(
            `  ${Object.entries(summary.histogram)
              .map(([v, n]) => `${v} ${n}`)
              .join(' · ')}${plan.degraded ? ' · degraded' : ''}${plan.shadow ? ' · shadow' : ''}`
          )
        );
        for (const c of plan.chunks) {
          const rel = c.relevance === undefined ? '  -  ' : c.relevance.toFixed(2);
          console.log(
            `  ${c.visibility.padEnd(6)} ${String(c.tokens).padStart(6)}/${String(c.rawTokens).padEnd(6)} ${rel}  ${c.source.padEnd(13)} ${c.reasonCode.padEnd(16)} ${c.kind}: ${c.label}  ${colors.muted(c.chunkId)}`
          );
        }
      } catch (error) {
        fail(error, 'Could not inspect the context plan');
      }
    });
}

export function createInspectCommand(): Command {
  return new Command('inspect')
    .description('Inspect sessions and context plans')
    .addCommand(inspectSession())
    .addCommand(inspectContext());
}

export function createViewCommand(): Command {
  return new Command('view')
    .description('Render a chunk at a visibility level (from stored output; nothing re-runs)')
    .argument('<chunk-id>', 'Chunk id')
    .addOption(
      new Option('--level <level>', 'Visibility')
        .choices(Object.values(ChunkVisibility))
        .default(ChunkVisibility.Full)
    )
    .option('--json', 'Print JSON')
    .action(async (chunkId: string, opts: { level: ChunkVisibility; json?: boolean }) => {
      try {
        const view = await container
          .resolve(RenderChunkViewUseCase)
          .execute({ chunkId, visibility: opts.level });
        if (opts.json) return printJson(view);
        if (view.redacted)
          return messages.warning('This chunk is marked secret and is never rendered.');
        console.log(
          colors.muted(
            `${view.chunk.kind} · ${view.chunk.label} · ${view.visibility} · ${view.rendererId}${view.truncated ? ' · truncated' : ''}`
          )
        );
        console.log(view.content);
      } catch (error) {
        fail(error, 'Could not render the chunk');
      }
    });
}

export function createExplainCommand(): Command {
  return new Command('explain')
    .description('Why a decision came out the way it did')
    .argument('<id>', 'Decision id or permission decision id (or a plan id with --chunk)')
    .option('--chunk <id>', 'Explain this chunk row of the plan <id>')
    .option('--json', 'Print JSON')
    .action(async (id: string, opts: { chunk?: string; json?: boolean }) => {
      try {
        const why = await container
          .resolve(ExplainHarnessDecisionUseCase)
          .execute(opts.chunk ? { planId: id, chunkId: opts.chunk } : { decisionId: id });
        if (opts.json) return printJson(why);
        if (why.planned) {
          console.log(fmt.heading(`${why.planned.label} → ${why.planned.visibility}`));
          console.log(
            `  reason ${why.planned.reasonCode} · source ${why.planned.source} · ${why.planned.tokens} of ${why.planned.rawTokens} tokens`
          );
        }
        if (why.score !== undefined) {
          console.log(
            `  relevance ${why.score.toFixed(2)} on bands hidden < ${why.bands.hide} ≤ short < ${why.bands.long} ≤ long < ${why.bands.full} ≤ full`
          );
        }
        if (why.decision) {
          const d = why.decision;
          console.log(
            `  ${d.kind} by ${d.providerId} (${d.providerKind}${d.model ? `, ${d.model}` : ''}) in ${d.latencyMs} ms${d.shadow ? ' · shadow' : ''}${d.degraded ? ` · degraded (${(d.failedProviders ?? []).join(', ')})` : ''}`
          );
          console.log(`  result ${JSON.stringify(d.result).slice(0, 400)}`);
          for (const a of d.alternatives ?? [])
            console.log(colors.muted(`    alt ${JSON.stringify(a)}`));
        }
        if (why.permission) {
          const p = why.permission;
          console.log(fmt.heading(`${p.action.summary} → ${p.result}${p.hard ? ' (hard)' : ''}`));
          for (const r of why.ruleReasons ?? [])
            console.log(`  ${r.ruleId}${r.reason ? ` — ${r.reason}` : ''}`);
          if (p.note) console.log(`  note: ${p.note}`);
        }
        console.log(colors.muted(`  sources ${JSON.stringify(why.sourceIds)}`));
      } catch (error) {
        fail(error, 'Could not explain the decision');
      }
    });
}
