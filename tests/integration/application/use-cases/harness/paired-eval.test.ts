/**
 * Paired eval runner (spec 119, task 33): the builtin `smoke` suite on
 * baseline and query-aware with a scripted agent that does the same work in
 * both modes, in throwaway repositories, scored by each case's check command.
 * Writes the comparison to SHEP_EVAL_REPORT_DIR (paired-smoke.json) when set.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessEvalRunStatus, HarnessMode } from '@/domain/generated/output.js';
import type { HarnessModelRequest } from '@/application/ports/output/harness/index.js';
import { HarnessTaskService } from '@/application/services/harness/harness-task-service.js';
import { RunHarnessEvalUseCase } from '@/application/use-cases/harness/run-harness-eval.use-case.js';
import {
  GetHarnessEvalReportUseCase,
  type HarnessEvalReport,
} from '@/application/use-cases/harness/harness-eval-report.use-cases.js';
import { EvalScore } from '@/application/use-cases/harness/harness-eval-scoring.js';
import { YamlHarnessEvalSuiteSource } from '@/infrastructure/services/harness/evals/yaml-eval-suite-source.js';
import { TempGitEvalWorkspaceFactory } from '@/infrastructure/services/harness/evals/temp-git-eval-workspace.js';
import {
  ScriptedHarnessModelProvider,
  type ScriptedTurn,
} from '@/infrastructure/services/harness/model/scripted-harness-model-provider.js';
import { isolateGitEnv } from '../../../../helpers/harness/temp-git-repo.js';
import {
  createRuntimeHarness,
  type RuntimeHarness,
} from '../../../../helpers/harness/runtime-harness.js';

interface Step {
  capability: string;
  tool: string;
  args: Record<string, unknown>;
}

/** The same sequence of actions per case, whatever the mode. */
const PLANS: Record<string, { match: string; steps: Step[]; evidence: string[] }> = {
  'trim-token': {
    match: 'trim surrounding whitespace',
    steps: [
      { capability: 'search_source_code', tool: 'search_source', args: { query: 'refresh' } },
      { capability: 'read_file', tool: 'read_file', args: { path: 'src/refresh.js' } },
      {
        capability: 'apply_patch',
        tool: 'apply_patch',
        args: {
          edits: [
            { path: 'src/refresh.js', oldText: 'return token;', newText: 'return token.trim();' },
          ],
        },
      },
    ],
    evidence: ['src/refresh.js'],
  },
  'fix-sum': {
    match: 'test/sum.test.js fail',
    steps: [
      { capability: 'read_file', tool: 'read_file', args: { path: 'test/sum.test.js' } },
      { capability: 'read_file', tool: 'read_file', args: { path: 'src/sum.js' } },
      {
        capability: 'apply_patch',
        tool: 'apply_patch',
        args: { edits: [{ path: 'src/sum.js', oldText: 'let i = 1;', newText: 'let i = 0;' }] },
      },
      { capability: 'run_tests', tool: 'run_tests', args: {} },
    ],
    evidence: ['src/sum.js', 'test/sum.test.js'],
  },
  'add-greet': {
    match: 'Add src/greet.js',
    steps: [
      { capability: 'read_file', tool: 'read_file', args: { path: 'src/farewell.js' } },
      {
        capability: 'apply_patch',
        tool: 'apply_patch',
        args: {
          files: [
            {
              path: 'src/greet.js',
              content:
                'function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nmodule.exports = { greet };\n',
            },
          ],
        },
      },
    ],
    evidence: ['src/farewell.js'],
  },
  'build-log': {
    match: 'build log',
    steps: [
      { capability: 'read_file', tool: 'read_file', args: { path: 'logs/build.log' } },
      { capability: 'search_source_code', tool: 'search_source', args: { query: 'timeoutMs' } },
      { capability: 'read_file', tool: 'read_file', args: { path: 'config/build.json' } },
      {
        capability: 'apply_patch',
        tool: 'apply_patch',
        args: {
          edits: [
            {
              path: 'config/build.json',
              oldText: '"timeoutMs": 10',
              newText: '"timeoutMs": 60000',
            },
          ],
        },
      },
      { capability: 'run_tests', tool: 'run_tests', args: {} },
      { capability: 'run_tests', tool: 'run_tests', args: {} },
    ],
    evidence: ['logs/build.log', 'config/build.json'],
  },
};

/** A long task: a large log read early stays in a transcript for every later turn. */
function longOutputSuite(dir: string): string {
  const log = Array.from({ length: 2500 }, (_, i) =>
    i === 2203
      ? 'ERROR step "bundle" exceeded timeoutMs=10 (config/build.json)'
      : `INFO step ${i % 40} ok in ${(i * 7) % 900}ms — cache hit for module-${i}`
  ).join('\n');
  const suite = {
    id: 'long-output',
    cases: [
      {
        id: 'build-log',
        task: 'The CI build log in logs/build.log shows a failure. Find the cause and fix the build configuration.',
        files: {
          'logs/build.log': `${log}\n`,
          'config/build.json': '{\n  "timeoutMs": 10\n}\n',
          'test/config.test.js':
            "const c = require('../config/build.json');\nif (c.timeoutMs < 1000) { console.error('timeout too low'); process.exit(1); }\nconsole.log('1 passed');\n",
        },
        testCommand: 'node test/config.test.js',
        check: 'node test/config.test.js',
        requiredEvidence: ['config/build.json'],
      },
    ],
  };
  const file = join(dir, 'long-output.yaml');
  writeFileSync(file, JSON.stringify(suite));
  return file;
}

/** A scripted agent: load-and-call on a tool's first use, direct calls after. */
function scriptedAgent() {
  let plan: (typeof PLANS)[string] | undefined;
  let step = 0;
  return (request: HarnessModelRequest): ScriptedTurn => {
    const text = JSON.stringify(request.messages) + request.system;
    plan ??= Object.values(PLANS).find((p) => text.includes(p.match));
    if (!plan) throw new Error('unknown eval case');
    const next = plan.steps[step];
    if (!next) {
      return {
        toolCalls: [
          {
            name: 'complete_task',
            args: {
              status: 'success',
              summary: 'Done.',
              evidence: plan.evidence.map((resource) => ({ resource })),
            },
          },
        ],
      };
    }
    step += 1;
    if (!request.tools.some((t) => t.name === next.tool)) {
      // First use: load and call in one turn.
      return {
        toolCalls: [
          {
            name: 'use_capability',
            args: { capabilityId: next.capability, intent: next.tool, args: next.args },
          },
        ],
      };
    }
    return { toolCalls: [{ name: next.tool, args: next.args }] };
  };
}

function runnerFor(h: RuntimeHarness): RunHarnessEvalUseCase {
  const settings = {
    load: async () => ({}),
    initialize: async () => undefined,
    update: async () => undefined,
  } as never;
  const service = new HarnessTaskService(h.runtime, h.store.sessions, h.store.events, settings, {
    create: () => new ScriptedHarnessModelProvider(scriptedAgent()),
  });
  return new RunHarnessEvalUseCase(
    service,
    new YamlHarnessEvalSuiteSource(),
    new TempGitEvalWorkspaceFactory(),
    h.store.evals,
    h.store.execution,
    h.store.context,
    process.pid
  );
}

function writeReport(name: string, report: HarnessEvalReport): void {
  const dir = process.env.SHEP_EVAL_REPORT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const results = report.results.map((r) => ({
    caseId: r.caseId,
    variant: r.variant,
    success: r.success,
    scores: r.scores,
  }));
  writeFileSync(
    join(dir, `${name}.json`),
    `${JSON.stringify({ variants: report.variants, comparison: report.comparison, results }, null, 2)}\n`
  );
}

describe('paired harness eval', () => {
  let restoreEnv: () => void;
  let h: RuntimeHarness;

  beforeAll(() => {
    restoreEnv = isolateGitEnv();
  });
  afterAll(() => restoreEnv());
  beforeEach(async () => {
    h = await createRuntimeHarness(process.cwd());
  });
  afterEach(() => h.store.close());

  it('runs the smoke suite on both variants and reports the comparison', async () => {
    const runner = runnerFor(h);
    const run = await runner.execute({ suite: 'smoke', repeats: 1, timeoutMs: 60_000 });
    expect(run.status).toBe(HarnessEvalRunStatus.Completed);

    const report = await new GetHarnessEvalReportUseCase(h.store.evals).execute({ runId: run.id });
    expect(report.results).toHaveLength(6);
    for (const r of report.results) {
      expect(r.error).toBeUndefined();
      expect(r.success, `${r.caseId}/${r.variant}`).toBe(true);
      expect(r.scores[EvalScore.EvidenceRecall]).toBe(1);
      expect(r.scores[EvalScore.RepeatedReads]).toBe(0);
    }
    const byVariant = Object.fromEntries(report.variants.map((v) => [v.variant, v]));
    expect(byVariant[HarnessMode.Baseline].means[EvalScore.Success]).toBe(1);
    expect(byVariant[HarnessMode.QueryAware].means[EvalScore.Success]).toBe(1);
    const input = report.comparison.find((c) => c.score === EvalScore.InputTokens)!;
    expect(input.baseline).toBeGreaterThan(0);
    expect(input.queryAware).toBeGreaterThan(0);

    writeReport('paired-smoke', report);
  });

  it('keeps a large early tool output out of later turns on a long task', async () => {
    const runner = runnerFor(h);
    const tmp = mkdtempSync(join(tmpdir(), 'shep-long-suite-'));
    try {
      const run = await runner.execute({ suite: longOutputSuite(tmp), timeoutMs: 60_000 });
      const report = await new GetHarnessEvalReportUseCase(h.store.evals).execute({
        runId: run.id,
      });
      for (const r of report.results)
        expect(r.success, `${r.variant}: ${r.error ?? ''}`).toBe(true);
      const input = report.comparison.find((c) => c.score === EvalScore.InputTokens)!;
      // Baseline replays the 2,500-line log on every later turn; query-aware shows a view.
      expect(input.queryAware!).toBeLessThan(input.baseline! * 0.5);
      writeReport('paired-long-output', report);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
