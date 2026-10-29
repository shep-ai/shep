/**
 * Minimal YAML-frontmatter reader for skill and subagent files (spec 150).
 *
 * Only flat `key: value` lines are read — that is all the surface needs
 * (`name`, `description`, `mode`). Returns undefined when the file does not
 * open with a `---` block.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseFrontmatter(content: string | undefined): Record<string, string> | undefined {
  const m = FRONTMATTER_RE.exec(content ?? '');
  if (!m) return undefined;
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line
      .slice(i + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (key) out[key] = value;
  }
  return out;
}
