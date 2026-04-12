/**
 * Parse the persisted content of a tool-event chat message.
 *
 * `persistToolEvent` in the interactive session service writes
 * messages in one of two shapes:
 *
 *   1. `**<Label>** \`<detail>\``    — most tool calls, detail usually JSON
 *   2. `**<Label>**`                  — label-only events (e.g. "Session started")
 *
 * Anything that doesn't match either shape is not a tool event and
 * should fall through to regular markdown rendering.
 */

export type ToolEvent =
  | {
      kind: 'tool';
      /** Tool name, e.g. "Bash", "Read", "Write", "Edit", "Glob", "Grep" */
      name: string;
      /** Raw detail string as persisted (may be JSON). */
      detail: string;
      /** Parsed object if `detail` was valid JSON, otherwise null. */
      parsed: Record<string, unknown> | null;
    }
  | { kind: 'label-only'; name: string };

const TOOL_WITH_DETAIL_RE = /^\*\*(.+?)\*\*\s+`([\s\S]+)`\s*$/;
const LABEL_ONLY_RE = /^\*\*(.+?)\*\*\s*$/;

export function parseToolEvent(text: string): ToolEvent | null {
  const trimmed = text.trim();

  const withDetail = trimmed.match(TOOL_WITH_DETAIL_RE);
  if (withDetail) {
    const [, name, detail] = withDetail;
    let parsed: Record<string, unknown> | null = null;
    try {
      const maybe = JSON.parse(detail) as unknown;
      if (maybe && typeof maybe === 'object' && !Array.isArray(maybe)) {
        parsed = maybe as Record<string, unknown>;
      }
    } catch {
      // Not JSON — leave parsed null, bubble will show the raw string.
    }
    return { kind: 'tool', name: name.trim(), detail, parsed };
  }

  const labelOnly = trimmed.match(LABEL_ONLY_RE);
  if (labelOnly) {
    return { kind: 'label-only', name: labelOnly[1].trim() };
  }

  return null;
}

/** True when the tool is a file mutation (Write / Edit / MultiEdit). */
export function isFileWriteTool(name: string): boolean {
  return /^(Write|Edit|MultiEdit|Update)$/i.test(name);
}

/** Extract the file path from a parsed tool payload, if present. */
export function extractFilePath(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null;
  const candidates = [parsed.file_path, parsed.path, parsed.filePath, parsed.filepath];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

/** Extract the file content from a parsed tool payload, if present. */
export function extractFileContent(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null;
  const candidates = [
    parsed.content,
    parsed.new_string,
    parsed.newString,
    parsed.new_content,
    parsed.text,
  ];
  for (const c of candidates) {
    if (typeof c === 'string') return c;
  }
  return null;
}

/**
 * Build a short one-line summary from a parsed tool payload, e.g. the
 * command for Bash, the file_path for Read, the pattern for Grep.
 * Falls back to a truncated version of the raw detail string.
 */
export function summarizeToolDetail(
  parsed: Record<string, unknown> | null,
  fallback: string,
  maxLen = 80
): string {
  if (parsed) {
    const fields = ['command', 'file_path', 'path', 'pattern', 'query', 'url'];
    for (const field of fields) {
      const v = parsed[field];
      if (typeof v === 'string' && v.length > 0) {
        return truncate(v, maxLen);
      }
    }
  }
  return truncate(fallback.replace(/\s+/g, ' ').trim(), maxLen);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
