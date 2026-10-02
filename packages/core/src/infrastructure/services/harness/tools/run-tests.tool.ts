/**
 * Builtin harness tool: run_tests (spec 119).
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { ChunkKind, RiskClass, ToolReadWriteMode } from '../../../../domain/generated/output.js';
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolExecutionOutput,
} from '../../../../application/ports/output/harness/index.js';
import { ToolInputError, impl, runShell } from './tool-support.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort test command when the repository did not configure one. */
export async function detectTestCommand(repoRoot: string): Promise<string | undefined> {
  if (await exists(join(repoRoot, 'package.json'))) {
    const pm = (await exists(join(repoRoot, 'pnpm-lock.yaml')))
      ? 'pnpm'
      : (await exists(join(repoRoot, 'yarn.lock')))
        ? 'yarn'
        : 'npm';
    return `${pm} test`;
  }
  if (
    (await exists(join(repoRoot, 'pyproject.toml'))) ||
    (await exists(join(repoRoot, 'pytest.ini')))
  ) {
    return 'pytest -q';
  }
  if (await exists(join(repoRoot, 'go.mod'))) return 'go test ./...';
  if (await exists(join(repoRoot, 'Cargo.toml'))) return 'cargo test';
  return undefined;
}

export class RunTestsTool implements IToolExecutor {
  readonly implementation = impl(
    'builtin.run_tests',
    'run_tests',
    'run_tests',
    "Run the repository's test command, optionally filtered",
    ToolReadWriteMode.SideEffect,
    RiskClass.Medium,
    {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Test name or file filter appended to the test command',
        },
      },
      additionalProperties: false,
    }
  );

  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<ToolExecutionOutput> {
    const base = ctx.testCommand ?? (await detectTestCommand(ctx.repoRoot));
    if (!base)
      throw new ToolInputError('No test command configured or detected for this repository');
    const filter = typeof args.filter === 'string' && args.filter ? ` ${args.filter}` : '';
    const command = `${base}${filter}`;
    const res = await runShell(command, {
      cwd: ctx.cwd,
      timeoutMs: ctx.timeoutMs,
      abortSignal: ctx.abortSignal,
    });
    return {
      ok: res.exitCode === 0 && !res.timedOut,
      output: res.output,
      kind: ChunkKind.TestResult,
      label: `$ ${command}`,
      summary: `${command} (${res.timedOut ? 'timed out' : res.exitCode === 0 ? 'passed' : `failed, exit ${res.exitCode}`})`,
      ...(res.exitCode !== null && { exitCode: res.exitCode }),
      truncated: res.truncated,
    };
  }
}
