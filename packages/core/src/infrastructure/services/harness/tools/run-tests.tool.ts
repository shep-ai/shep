/**
 * Builtin harness tool: run_tests (spec 119).
 */
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { ChunkKind, RiskClass, ToolReadWriteMode } from '../../../../domain/generated/output.js';
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolExecutionOutput,
} from '../../../../application/ports/output/harness/index.js';
import { ToolInputError, impl, runShell } from './tool-support.js';

/** Characters allowed in a run_tests filter (no shell metacharacters). */
export const TEST_FILTER_PATTERN = /^[\w./:@=,*[\] -]*$/;
const MAX_FILTER_CHARS = 300;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** `test_command` from `.shep/harness/config.yaml` (written by `shep harness init`). */
export async function configuredTestCommand(repoRoot: string): Promise<string | undefined> {
  const raw = await readFile(join(repoRoot, '.shep', 'harness', 'config.yaml'), 'utf8').catch(
    () => undefined
  );
  if (!raw) return undefined;
  try {
    const value = (yaml.load(raw) as { test_command?: unknown } | null)?.test_command;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** The repository's test command: configured, or a best-effort guess. */
export async function detectTestCommand(repoRoot: string): Promise<string | undefined> {
  const configured = await configuredTestCommand(repoRoot);
  if (configured) return configured;
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
          pattern: TEST_FILTER_PATTERN.source,
          maxLength: MAX_FILTER_CHARS,
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
    const raw = typeof args.filter === 'string' ? args.filter : '';
    // The command runs through a shell: a filter may never add operators,
    // substitutions, redirections or quotes.
    if (raw.length > MAX_FILTER_CHARS || !TEST_FILTER_PATTERN.test(raw)) {
      throw new ToolInputError(
        'filter may contain only letters, digits, spaces and . / _ - : @ = , * [ ]'
      );
    }
    const filter = raw ? ` ${raw}` : '';
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
