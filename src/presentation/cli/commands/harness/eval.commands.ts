/**
 * shep harness eval — paired evals (spec 119, F9): run a suite on baseline
 * and query-aware, list runs, show the comparison, save a session as a case.
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { container } from '@/infrastructure/di/container.js';
import { HarnessMode } from '@/domain/generated/output.js';
import { RunHarnessEvalUseCase } from '@/application/use-cases/harness/run-harness-eval.use-case.js';
import {
  GetHarnessEvalReportUseCase,
  ListHarnessEvalRunsUseCase,
  type HarnessEvalReport,
} from '@/application/use-cases/harness/harness-eval-report.use-cases.js';
import { SaveHarnessEvalCaseUseCase } from '@/application/use-cases/harness/save-harness-eval-case.use-case.js';
import { colors, fmt, messages } from '../../ui/index.js';
import { fail, printJson } from './harness-output.js';

function formatScore(score: string, value: number | undefined): string {
  if (value === undefined) return '–';
  if (score === 'success' || score === 'evidenceRecall' || score === 'toolOutputRatio')
    return `${(value * 100).toFixed(0)}%`;
  if (score === 'costUsd') return `$${value.toFixed(4)}`;
  if (score === 'wallMs') return `${(value / 1000).toFixed(1)}s`;
  return value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
}

export function renderEvalReport(report: HarnessEvalReport): void {
  console.log(
    fmt.heading(`Eval ${report.run.suite} — ${report.run.status} (${report.results.length} runs)`)
  );
  console.log(
    `  ${'score'.padEnd(16)} ${'baseline'.padStart(10)} ${'query-aware'.padStart(12)} ${'change'.padStart(8)}`
  );
  for (const c of report.comparison) {
    const change =
      c.relativeChange === undefined
        ? ''
        : `${c.relativeChange > 0 ? '+' : ''}${(c.relativeChange * 100).toFixed(0)}%`;
    console.log(
      `  ${c.score.padEnd(16)} ${formatScore(c.score, c.baseline).padStart(10)} ${formatScore(c.score, c.queryAware).padStart(12)} ${change.padStart(8)}`
    );
  }
  const failed = report.results.filter((r) => !r.success);
  for (const r of failed)
    console.log(
      colors.warning(`  ✗ ${r.caseId} (${r.variant} #${r.repeat})${r.error ? `: ${r.error}` : ''}`)
    );
}

function runCommand(): Command {
  return new Command('run')
    .description('Run a suite on baseline and query-aware and compare them')
    .argument(
      '<suite>',
      'Suite id (builtin: smoke), a .shep/harness/evals/<id>.yaml suite, or a file path'
    )
    .option('-r, --repo <path>', 'Repository whose .shep/harness/evals to search', process.cwd())
    .option(
      '--variants <list>',
      'Comma-separated variants',
      `${HarnessMode.Baseline},${HarnessMode.QueryAware}`
    )
    .option('--repeats <n>', 'Runs per case and variant', '1')
    .option('--model <id>', 'Backend model id')
    .option('--json', 'Print the report as JSON')
    .action(
      async (
        suite: string,
        opts: { repo: string; variants: string; repeats: string; model?: string; json?: boolean }
      ) => {
        try {
          const variants = opts.variants
            .split(',')
            .map((v) => v.trim())
            .filter((v): v is HarnessMode => (Object.values(HarnessMode) as string[]).includes(v));
          const run = await container.resolve(RunHarnessEvalUseCase).execute({
            suite,
            repoRoot: resolve(opts.repo),
            variants,
            repeats: Number.parseInt(opts.repeats, 10) || 1,
            ...(opts.model && { modelId: opts.model }),
            ...(!opts.json && { onProgress: (m: string) => console.log(colors.muted(`  › ${m}`)) }),
          });
          const report = await container
            .resolve(GetHarnessEvalReportUseCase)
            .execute({ runId: run.id });
          if (opts.json) return printJson(report);
          renderEvalReport(report);
          console.log(colors.muted(`  run ${run.id}`));
          if (run.error) fail(new Error(run.error), 'Eval run failed');
        } catch (error) {
          fail(error, 'Eval run failed');
        }
      }
    );
}

function lsCommand(): Command {
  return new Command('ls')
    .description('Suites and recent eval runs')
    .option('-r, --repo <path>', 'Repository', process.cwd())
    .option('--json', 'Print JSON')
    .action(async (opts: { repo: string; json?: boolean }) => {
      try {
        const r = await container
          .resolve(ListHarnessEvalRunsUseCase)
          .execute({ repoRoot: resolve(opts.repo) });
        if (opts.json) return printJson(r);
        console.log(fmt.heading('Suites'));
        for (const s of r.suites)
          console.log(
            `  ${s.id.padEnd(16)} ${String(s.cases).padStart(3)} cases  ${colors.muted(s.source)}`
          );
        console.log(fmt.heading('Runs'));
        if (r.runs.length === 0) messages.info('No eval runs yet: shep harness eval run smoke');
        for (const run of r.runs)
          console.log(
            `  ${run.id}  ${run.suite.padEnd(16)} ${run.status.padEnd(10)} ${run.variants.join(',')} ×${run.repeats}`
          );
      } catch (error) {
        fail(error, 'Could not list evals');
      }
    });
}

function reportCommand(): Command {
  return new Command('report')
    .description('The comparison report of an eval run')
    .argument('<run-id>', 'Eval run id')
    .option('--json', 'Print JSON')
    .action(async (runId: string, opts: { json?: boolean }) => {
      try {
        const report = await container.resolve(GetHarnessEvalReportUseCase).execute({ runId });
        if (opts.json) return printJson(report);
        renderEvalReport(report);
      } catch (error) {
        fail(error, 'Could not load the report');
      }
    });
}

function saveCommand(): Command {
  return new Command('save')
    .description('Save a standalone session as an eval case in .shep/harness/evals/<suite>.yaml')
    .argument('<session-id>', 'Session id')
    .requiredOption('--suite <id>', 'Suite to add the case to')
    .option('--check <command>', 'Command that exits 0 when the task succeeded')
    .action(async (sessionId: string, opts: { suite: string; check?: string }) => {
      try {
        const r = await container
          .resolve(SaveHarnessEvalCaseUseCase)
          .execute({ sessionId, suite: opts.suite, ...(opts.check && { check: opts.check }) });
        messages.success(`Saved case ${r.evalCase.id} to ${r.file}`);
      } catch (error) {
        fail(error, 'Could not save the eval case');
      }
    });
}

export function createEvalCommand(): Command {
  return new Command('eval')
    .description('Paired evals: baseline vs query-aware on the same tasks')
    .addCommand(runCommand())
    .addCommand(lsCommand())
    .addCommand(reportCommand())
    .addCommand(saveCommand());
}
