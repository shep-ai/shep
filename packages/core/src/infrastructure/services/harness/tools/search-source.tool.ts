/**
 * Builtin harness tool: search_source (spec 119).
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { minimatch } from 'minimatch';
import { ChunkKind, RiskClass, ToolReadWriteMode } from '../../../../domain/generated/output.js';
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolExecutionOutput,
} from '../../../../application/ports/output/harness/index.js';
import {
  MAX_FILE_BYTES,
  MAX_GIT_BUFFER,
  asOptionalNumber,
  asString,
  impl,
  listRepoFiles,
  resolveInsideRepo,
} from './tool-support.js';

const execFileAsync = promisify(execFile);
const DEFAULT_SEARCH_LIMIT = 200;
const DEFAULT_CONTEXT_LINES = 0;

/** An empty search says how the query was matched, so the model can change it instead of repeating it. */
function noMatches(query: string, regex: boolean, scope: string): string {
  const where = scope === '.' ? '' : ` in ${scope}`;
  const how = regex
    ? 'regular expression'
    : 'matched as literal text; set regex: true for a regular expression';
  return `0 matches for ${JSON.stringify(query)}${where} (${how})`;
}

export class SearchSourceTool implements IToolExecutor {
  readonly implementation = impl(
    'builtin.search_source',
    'search_source_code',
    'search_source',
    'Search repository source for text or a regular expression; returns path:line matches',
    ToolReadWriteMode.Read,
    RiskClass.Low,
    {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        regex: { type: 'boolean', description: 'Treat query as a regular expression' },
        path: {
          type: 'string',
          description: 'Limit to a directory or a single file (repository-relative)',
        },
        glob: { type: 'string', description: 'Limit to files matching a glob' },
        contextLines: { type: 'integer', minimum: 0, maximum: 10 },
        maxResults: { type: 'integer', minimum: 1, maximum: 2000 },
      },
      required: ['query'],
      additionalProperties: false,
    }
  );

  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<ToolExecutionOutput> {
    const query = asString(args.query, 'query');
    const regex = args.regex === true;
    const limit = asOptionalNumber(args.maxResults) ?? DEFAULT_SEARCH_LIMIT;
    const context = asOptionalNumber(args.contextLines) ?? DEFAULT_CONTEXT_LINES;
    const scope =
      typeof args.path === 'string' && args.path
        ? resolveInsideRepo(ctx.repoRoot, ctx.cwd, args.path).rel
        : '.';
    const glob = typeof args.glob === 'string' && args.glob ? args.glob : undefined;
    let lines: string[];
    try {
      lines = await this.ripgrep(ctx.repoRoot, query, regex, scope, glob, context, limit);
    } catch {
      lines = await this.scan(ctx.repoRoot, query, regex, scope, glob, limit);
    }
    const hits = lines.filter((l) => /^[^:]+:\d+:/.test(l)).length;
    return {
      ok: true,
      output: lines.join('\n'),
      kind: ChunkKind.SearchResult,
      label: `search ${JSON.stringify(query)}`,
      summary:
        hits > 0 ? `${hits} matches for ${JSON.stringify(query)}` : noMatches(query, regex, scope),
      truncated: hits >= limit,
    };
  }

  private async ripgrep(
    root: string,
    query: string,
    regex: boolean,
    scope: string,
    glob: string | undefined,
    context: number,
    limit: number
  ): Promise<string[]> {
    // --with-filename: rg drops the path when the scope is a single file, and every hit must be path:line.
    const argv = [
      '--with-filename',
      '--line-number',
      '--no-heading',
      '--color',
      'never',
      '--max-columns',
      '400',
    ];
    if (!regex) argv.push('--fixed-strings');
    if (context > 0) argv.push('-C', String(context));
    if (glob) argv.push('--glob', glob);
    argv.push('-e', query, '--', scope);
    try {
      const { stdout } = await execFileAsync('rg', argv, {
        cwd: root,
        maxBuffer: MAX_GIT_BUFFER,
        encoding: 'utf8',
        windowsHide: true,
      });
      return stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, limit * (1 + 2 * context));
    } catch (error) {
      // rg exits 1 when nothing matched: that is a result, not a failure.
      if ((error as { code?: number }).code === 1) return [];
      throw error;
    }
  }

  private async scan(
    root: string,
    query: string,
    regex: boolean,
    scope: string,
    glob: string | undefined,
    limit: number
  ): Promise<string[]> {
    const pattern = regex ? new RegExp(query) : undefined;
    const out: string[] = [];
    for (const file of await listRepoFiles(root)) {
      if (scope !== '.' && !file.startsWith(`${scope}/`) && file !== scope) continue;
      if (glob && !minimatch(file, glob, { dot: true })) continue;
      let text: string;
      try {
        const buf = await readFile(join(root, file));
        if (buf.length > MAX_FILE_BYTES || buf.includes(0)) continue;
        text = buf.toString('utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern ? pattern.test(lines[i]) : lines[i].includes(query)) {
          out.push(`${file}:${i + 1}:${lines[i].slice(0, 400)}`);
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }
}
