/**
 * Builtin harness tool: list_files (spec 119).
 */
import { minimatch } from 'minimatch';
import { ChunkKind, RiskClass, ToolReadWriteMode } from '../../../../domain/generated/output.js';
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolExecutionOutput,
} from '../../../../application/ports/output/harness/index.js';
import { asOptionalNumber, impl, listRepoFiles, resolveInsideRepo } from './tool-support.js';

const DEFAULT_LIST_LIMIT = 500;

export class ListFilesTool implements IToolExecutor {
  readonly implementation = impl(
    'builtin.list_files',
    'list_files',
    'list_files',
    'List repository files, optionally under a directory or matching a glob',
    ToolReadWriteMode.Read,
    RiskClass.Low,
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to list (repository-relative)' },
        pattern: { type: 'string', description: 'Glob such as src/**/*.ts' },
        maxResults: { type: 'integer', minimum: 1, maximum: 5000 },
      },
      additionalProperties: false,
    }
  );

  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<ToolExecutionOutput> {
    const dir =
      typeof args.path === 'string' && args.path
        ? resolveInsideRepo(ctx.repoRoot, ctx.cwd, args.path).rel
        : '.';
    const pattern = typeof args.pattern === 'string' && args.pattern ? args.pattern : undefined;
    const limit = asOptionalNumber(args.maxResults) ?? DEFAULT_LIST_LIMIT;
    const files = (await listRepoFiles(ctx.repoRoot)).filter(
      (f) =>
        (dir === '.' || f === dir || f.startsWith(`${dir}/`)) &&
        (!pattern || minimatch(f, pattern, { dot: true }))
    );
    const shown = files.slice(0, limit);
    const truncated = files.length > shown.length;
    return {
      ok: true,
      output: shown.join('\n') + (truncated ? `\n… ${files.length - shown.length} more` : ''),
      kind: ChunkKind.ToolOutput,
      label: `list_files ${pattern ?? dir}`,
      summary: `${files.length} files${pattern ? ` matching ${pattern}` : ''}`,
      truncated,
    };
  }
}
