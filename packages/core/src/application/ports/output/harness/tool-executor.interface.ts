/**
 * Tool execution ports (spec 119, docs/05).
 *
 * A capability says what can be done; a ToolImplementation says how. Tool
 * sources (builtin today, MCP and plugins in V1) supply both plus executors.
 */
import type {
  Capability,
  ChunkKind,
  ToolImplementation,
} from '../../../../domain/generated/output.js';

export interface ToolExecutionContext {
  /** Working directory (the feature worktree or the standalone worktree). */
  cwd: string;
  /** Repository root the session is confined to. */
  repoRoot: string;
  abortSignal?: AbortSignal;
  timeoutMs: number;
  /** Test command from .shep/harness/config.yaml, when configured. */
  testCommand?: string;
}

export interface ToolExecutionOutput {
  ok: boolean;
  /** Raw output persisted as a chunk before any rendering. */
  output: string;
  kind: ChunkKind;
  label: string;
  /** Repository-relative path for file-shaped output. */
  path?: string;
  /** One line for UIs and the turn log. */
  summary: string;
  exitCode?: number;
  /** Paths the tool modified (apply_patch). */
  changedPaths?: string[];
  /** Raw output was capped; the cap is recorded, never silent. */
  truncated?: boolean;
}

export interface IToolExecutor {
  readonly implementation: ToolImplementation;
  execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionOutput>;
}

export interface ToolCatalog {
  capabilities: Capability[];
  executors: IToolExecutor[];
}

export interface IToolSource {
  readonly id: string;
  discover(): Promise<ToolCatalog>;
}

export interface ArgumentValidationResult {
  valid: boolean;
  errors: string[];
}

export interface IToolArgumentValidator {
  validate(schema: Record<string, unknown>, args: unknown): ArgumentValidationResult;
}
