/**
 * Kind-specific chunk renderers (spec 119, docs/04 "Renderers").
 *
 * Visibility is not generic summarisation: a test log's short view is its
 * failing tests and first causal error; a file's short view is its outline.
 * Every non-full view ends with a reference back to the raw chunk, so the
 * model can call `expand_chunk` instead of re-running the tool.
 */
import {
  ChunkKind,
  ChunkVisibility,
  type ContextChunk,
} from '../../../../domain/generated/output.js';
import {
  head,
  lines,
  matchingLineIndexes,
  numbered,
  renderRanges,
  tail,
  windows,
  type RenderedView,
} from './render-support.js';

export interface ChunkRenderer {
  /** `name@version`; part of every view's identity. */
  readonly id: string;
  readonly kinds: readonly ChunkKind[];
  render(
    raw: string,
    visibility: ChunkVisibility.Short | ChunkVisibility.Long,
    query: string
  ): RenderedView;
}

/** Exported declarations, or structural declarations at column 0 (any language). */
const OUTLINE_LINE =
  /^(export\s+(default\s+)?(async\s+)?(function|class|interface|type|enum|const|let|abstract\s+class|namespace)\b|(async\s+)?(function|class|interface|type|enum|abstract\s+class|def|func|fn|pub\s+fn|pub\s+struct|struct|impl|trait|module|namespace)\b|\s{2,4}(async\s+)?def\s)/;
const MAX_OUTLINE = 60;
const FILE_LONG_RADIUS = 8;
const FILE_LONG_WINDOWS = 8;

export const fileRenderer: ChunkRenderer = {
  id: 'file@1',
  kinds: [ChunkKind.File, ChunkKind.FileExcerpt, ChunkKind.Documentation],
  render(raw, visibility, query) {
    const all = lines(raw);
    const declarations = all.flatMap((l, i) => (OUTLINE_LINE.test(l) ? [i] : []));
    const outlineIdx = declarations.slice(0, MAX_OUTLINE);
    const omitted = declarations.length - outlineIdx.length;
    const outline = outlineIdx.length
      ? outlineIdx.map((i) => `${String(i + 1).padStart(5)}│${all[i].trimEnd()}`).join('\n') +
        (omitted > 0 ? `\n… (${omitted} more declarations)` : '')
      : head(raw, 15).content;
    if (visibility === ChunkVisibility.Short) {
      return { content: `${all.length} lines. Outline:\n${outline}`, truncated: true };
    }
    const hits = matchingLineIndexes(all, query);
    if (hits.length === 0 || all.length <= 120) {
      const h = head(numbered(all), 120);
      return { content: h.content, truncated: h.truncated };
    }
    const ranges = windows(hits, FILE_LONG_RADIUS, all.length, FILE_LONG_WINDOWS);
    return {
      content: `${all.length} lines. Outline:\n${outline}\n\nRelevant ranges:\n${renderRanges(all, ranges)}`,
      truncated: true,
    };
  },
};

const HIT = /^([^:\n]+):(\d+)[:-]/;

export const searchRenderer: ChunkRenderer = {
  id: 'search@1',
  kinds: [ChunkKind.SearchResult],
  render(raw, visibility) {
    const all = lines(raw).filter((l) => HIT.test(l));
    const byFile = new Map<string, number>();
    for (const l of all) {
      const file = HIT.exec(l)![1];
      byFile.set(file, (byFile.get(file) ?? 0) + 1);
    }
    const summary = `${all.length} matches in ${byFile.size} files: ${[...byFile]
      .slice(0, 12)
      .map(([f, n]) => `${f} (${n})`)
      .join(', ')}${byFile.size > 12 ? ', …' : ''}`;
    const limit = visibility === ChunkVisibility.Short ? 15 : 60;
    const shown = all.slice(0, limit).map((l) => l.slice(0, 240));
    const more = all.length > limit ? `\n… (${all.length - limit} more matches)` : '';
    return { content: `${summary}\n${shown.join('\n')}${more}`, truncated: all.length > limit };
  },
};

const ERROR_WORDS =
  /(error|\bERR!|\bfail(?:s|ed|ure|ing)?\b|exception|traceback|panic|fatal|cannot|denied|not found|✗|×|✖)/i;
/** File names such as errors.js or failover.ts are not errors. */
const FILE_NAME = /[\w./-]*\.[a-z][a-z0-9]{0,4}\b/gi;

function isErrorLine(line: string): boolean {
  return ERROR_WORDS.test(line.replace(FILE_NAME, ''));
}

export const commandRenderer: ChunkRenderer = {
  id: 'command@1',
  kinds: [ChunkKind.CommandOutput, ChunkKind.ToolOutput, ChunkKind.ToolInput],
  render(raw, visibility) {
    const all = lines(raw);
    const errors = all.flatMap((l, i) => (isErrorLine(l) ? [i] : []));
    if (visibility === ChunkVisibility.Short) {
      const t = tail(raw, 15);
      const firstErrors = errors.slice(0, 5).map((i) => all[i].slice(0, 240));
      return {
        content: `${all.length} lines.${firstErrors.length ? `\nErrors:\n${firstErrors.join('\n')}` : ''}\nLast lines:\n${t.content}`,
        truncated: all.length > 15,
      };
    }
    const ranges = windows(errors, 3, all.length, 10);
    const t = tail(raw, 60);
    return {
      content: `${ranges.length ? `Error context:\n${renderRanges(all, ranges)}\n\n` : ''}Last lines:\n${t.content}`,
      truncated: t.truncated,
    };
  },
};

const FAILING_TEST = /(^\s*(FAIL|✗|×|✖|FAILED)\b|^\s*●|^\s*\d+\)\s|--- FAIL:|^FAILED )/;
const TEST_SUMMARY =
  /(\btests?\b.*\b(passed|failed)\b|\b\d+ (passed|failed|skipped)\b|^Ran \d+ tests|^(ok|FAIL)\s+\S+\s+[\d.]+s)/i;
const CAUSE = /(AssertionError|Error:|expected|received|Expected|Received|assert|Traceback|panic:)/;

export const testRenderer: ChunkRenderer = {
  id: 'test-result@1',
  kinds: [ChunkKind.TestResult],
  render(raw, visibility) {
    const all = lines(raw);
    const failing = [
      ...new Set(all.filter((l) => FAILING_TEST.test(l)).map((l) => l.trim().slice(0, 200))),
    ];
    const summary = all
      .filter((l) => TEST_SUMMARY.test(l))
      .map((l) => l.trim())
      .slice(-4);
    const causes = all.flatMap((l, i) => (CAUSE.test(l) ? [i] : []));
    if (visibility === ChunkVisibility.Short) {
      const firstCause = causes.slice(0, 4).map((i) => all[i].trim().slice(0, 240));
      return {
        content: [
          summary.length ? `Summary: ${summary.join(' | ')}` : `${all.length} lines of test output`,
          failing.length
            ? `Failing (${failing.length}):\n${failing.slice(0, 20).join('\n')}`
            : 'No failing tests reported',
          firstCause.length ? `First errors:\n${firstCause.join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        truncated: true,
      };
    }
    const ranges = windows(causes, 10, all.length, 8);
    return {
      content: [
        summary.length ? `Summary: ${summary.join(' | ')}` : '',
        failing.length ? `Failing (${failing.length}):\n${failing.join('\n')}` : '',
        ranges.length ? `Failure details:\n${renderRanges(all, ranges)}` : tail(raw, 60).content,
      ]
        .filter(Boolean)
        .join('\n\n'),
      truncated: true,
    };
  },
};

export const diffRenderer: ChunkRenderer = {
  id: 'diff@1',
  kinds: [ChunkKind.Diff],
  render(raw, visibility, query) {
    const files = raw.split(/^(?=diff --git )/m).filter((f) => f.startsWith('diff --git '));
    const stats = files.map((f) => {
      const name = /^diff --git a\/(.+?) b\//.exec(f)?.[1] ?? '?';
      const added = (f.match(/^\+(?!\+\+)/gm) ?? []).length;
      const removed = (f.match(/^-(?!--)/gm) ?? []).length;
      return { name, added, removed, body: f };
    });
    const header = `${stats.length} files changed:\n${stats.map((s) => `  ${s.name} +${s.added} -${s.removed}`).join('\n')}`;
    if (visibility === ChunkVisibility.Short) return { content: header, truncated: true };
    const relevant = stats.filter((s) => matchingLineIndexes([s.name, s.body], query).length > 0);
    const chosen = (relevant.length ? relevant : stats).slice(0, 8);
    const body = chosen.map((s) => head(s.body, 80).content).join('\n');
    return { content: `${header}\n\n${body}`, truncated: true };
  },
};

export const instructionRenderer: ChunkRenderer = {
  id: 'instruction@1',
  kinds: [ChunkKind.Instruction],
  render(raw, visibility) {
    const h = head(raw, visibility === ChunkVisibility.Short ? 12 : 200);
    return { content: h.content, truncated: h.truncated };
  },
};

export const textRenderer: ChunkRenderer = {
  id: 'text@1',
  kinds: [
    ChunkKind.PromptSection,
    ChunkKind.UserMessage,
    ChunkKind.AssistantMessage,
    ChunkKind.Plan,
    ChunkKind.Decision,
    ChunkKind.SubagentResult,
    ChunkKind.BackgroundResult,
  ],
  render(raw, visibility) {
    const h = head(raw, visibility === ChunkVisibility.Short ? 25 : 150);
    return { content: h.content, truncated: h.truncated };
  },
};

const RENDERERS: readonly ChunkRenderer[] = [
  fileRenderer,
  searchRenderer,
  commandRenderer,
  testRenderer,
  diffRenderer,
  instructionRenderer,
  textRenderer,
];

export function rendererFor(kind: ChunkKind): ChunkRenderer {
  return RENDERERS.find((r) => r.kinds.includes(kind)) ?? textRenderer;
}

export const RENDERER_VERSIONS: readonly string[] = RENDERERS.map((r) => r.id);

/** Full views are the raw content; this id marks them in plans. */
export const RAW_RENDERER_ID = 'raw@1';

/**
 * Render a chunk at a visibility. Hidden → empty; full → raw (numbered for
 * files). Non-full views carry a footer pointing back to the raw chunk.
 */
export function renderChunkView(
  chunk: Pick<ContextChunk, 'id' | 'kind'>,
  raw: string,
  visibility: ChunkVisibility,
  query: string
): { content: string; truncated: boolean; rendererId: string } {
  if (visibility === ChunkVisibility.Hidden) {
    return { content: '', truncated: false, rendererId: RAW_RENDERER_ID };
  }
  if (visibility === ChunkVisibility.Full) {
    const isFile = chunk.kind === ChunkKind.File || chunk.kind === ChunkKind.FileExcerpt;
    return {
      content: isFile ? numbered(lines(raw)) : raw,
      truncated: false,
      rendererId: RAW_RENDERER_ID,
    };
  }
  const renderer = rendererFor(chunk.kind);
  const view = renderer.render(raw, visibility, query);
  const footer = view.truncated
    ? `\n[${visibility} view of chunk ${chunk.id} — call expand_chunk for more detail]`
    : '';
  return {
    content: `${view.content}${footer}`,
    truncated: view.truncated,
    rendererId: renderer.id,
  };
}
