/**
 * Builtin harness tool: read_file (spec 119).
 */
import { readFile } from 'node:fs/promises';
import { ChunkKind, RiskClass, ToolReadWriteMode } from '../../../../domain/generated/output.js';
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolExecutionOutput,
} from '../../../../application/ports/output/harness/index.js';
import {
  MAX_FILE_BYTES,
  ToolInputError,
  asOptionalNumber,
  asString,
  impl,
  resolveInsideRepo,
} from './tool-support.js';

export class ReadFileTool implements IToolExecutor {
  readonly implementation = impl(
    'builtin.read_file',
    'read_file',
    'read_file',
    'Read a repository file, optionally a line range',
    ToolReadWriteMode.Read,
    RiskClass.Low,
    {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1 },
        startLine: { type: 'integer', minimum: 1 },
        endLine: { type: 'integer', minimum: 1 },
      },
      required: ['path'],
      additionalProperties: false,
    }
  );

  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<ToolExecutionOutput> {
    const { abs, rel } = resolveInsideRepo(ctx.repoRoot, ctx.cwd, asString(args.path, 'path'));
    let buf: Buffer;
    try {
      buf = await readFile(abs);
    } catch {
      throw new ToolInputError(`File not found: ${rel}`);
    }
    if (buf.includes(0)) throw new ToolInputError(`${rel} is a binary file`);
    let text = buf.toString('utf8');
    const truncated = buf.length > MAX_FILE_BYTES;
    if (truncated) text = text.slice(0, MAX_FILE_BYTES);
    const start = asOptionalNumber(args.startLine);
    const end = asOptionalNumber(args.endLine);
    const ranged = start !== undefined || end !== undefined;
    if (ranged) {
      const lines = text.split('\n');
      text = lines.slice((start ?? 1) - 1, end ?? lines.length).join('\n');
    }
    return {
      ok: true,
      output: text,
      kind: ranged ? ChunkKind.FileExcerpt : ChunkKind.File,
      label: ranged ? `${rel}:${start ?? 1}-${end ?? ''}` : rel,
      path: rel,
      summary: `${rel} (${text.split('\n').length} lines)`,
      truncated,
    };
  }
}
