/**
 * Builtin harness tool: run_command (spec 119).
 */
import { ChunkKind, RiskClass, ToolReadWriteMode } from '../../../../domain/generated/output.js';
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolExecutionOutput,
} from '../../../../application/ports/output/harness/index.js';
import { asOptionalNumber, asString, impl, runShell } from './tool-support.js';

export class RunCommandTool implements IToolExecutor {
  readonly implementation = impl(
    'builtin.run_command',
    'run_command',
    'run_command',
    'Run a shell command in the worktree; effects are checked against policy first',
    ToolReadWriteMode.SideEffect,
    RiskClass.High,
    {
      type: 'object',
      properties: {
        command: { type: 'string', minLength: 1 },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 3600000 },
      },
      required: ['command'],
      additionalProperties: false,
    }
  );

  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<ToolExecutionOutput> {
    const command = asString(args.command, 'command');
    const res = await runShell(command, {
      cwd: ctx.cwd,
      timeoutMs: Math.min(asOptionalNumber(args.timeoutMs) ?? ctx.timeoutMs, ctx.timeoutMs),
      abortSignal: ctx.abortSignal,
    });
    const status = res.timedOut ? 'timed out' : res.aborted ? 'aborted' : `exit ${res.exitCode}`;
    return {
      ok: res.exitCode === 0 && !res.timedOut,
      output: res.output,
      kind: ChunkKind.CommandOutput,
      label: `$ ${command}`,
      summary: `${command} (${status})`,
      ...(res.exitCode !== null && { exitCode: res.exitCode }),
      truncated: res.truncated,
    };
  }
}
