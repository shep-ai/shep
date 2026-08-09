/**
 * Line-anchored TOML table/key scanning — deliberately NOT a TOML parser.
 *
 * `pyproject.toml` and `Cargo.toml` are the only TOML files any detector
 * reads, and the only facts read from them are which table headers are
 * present and which simple keys sit directly beneath one. Pulling a full
 * TOML 1.0.0 parser into a *published* CLI's runtime dependency closure —
 * permanent supply-chain surface for the repo's security gates — to answer
 * that would be a bad trade, and hand-rolling one (multi-line strings, arrays
 * of tables, inline tables, dotted keys, datetimes) would be the most
 * bug-prone module in the feature.
 *
 * The failure mode is bounded in the safe direction: a header must occupy a
 * whole line, a construct that essentially cannot appear inside a string
 * value in a real manifest, and any doubt makes the detector fall through to
 * the next one — which costs exactly one agent call, i.e. today's behaviour.
 */

/** A whole line that is nothing but a table header, e.g. `[tool.poetry]`. */
const TABLE_HEADER = /^\s*\[([^[\]]+)\]\s*(?:#.*)?$/;

/** A simple `key = value` line. Dotted and quoted keys are both accepted. */
const SIMPLE_KEY = /^\s*(?:"([^"]+)"|([A-Za-z0-9_.-]+))\s*=\s*(.*)$/;

/** Strip surrounding quotes and any trailing comment from a scalar value. */
function cleanValue(raw: string): string {
  const trimmed = raw.trim();
  const quoted = /^(?:"([^"]*)"|'([^']*)')/.exec(trimmed);
  if (quoted) return quoted[1] ?? quoted[2] ?? '';
  return trimmed.replace(/\s+#.*$/, '').trim();
}

/**
 * True when the document declares the given table as its own header line.
 *
 * @param contents - CRLF-normalised manifest contents.
 * @param table - Dotted table name without brackets, e.g. `tool.poetry`.
 */
export function hasTomlTable(contents: string, table: string): boolean {
  for (const line of contents.split('\n')) {
    const match = TABLE_HEADER.exec(line);
    if (match?.[1].trim() === table) return true;
  }
  return false;
}

/**
 * Collect the simple `key = value` pairs declared directly under a table.
 *
 * Keys belonging to any other table are ignored, so `[tool.poetry.scripts]`
 * and `[project.scripts]` never bleed into each other.
 *
 * @param contents - CRLF-normalised manifest contents.
 * @param table - Dotted table name without brackets.
 * @returns Key → cleaned scalar value. Empty when the table is absent.
 */
export function tomlTableKeys(contents: string, table: string): Record<string, string> {
  const keys: Record<string, string> = {};
  let inTable = false;

  for (const line of contents.split('\n')) {
    const header = TABLE_HEADER.exec(line);
    if (header) {
      inTable = header[1].trim() === table;
      continue;
    }
    if (!inTable) continue;

    const key = SIMPLE_KEY.exec(line);
    if (!key) continue;
    const name = key[1] ?? key[2];
    keys[name] = cleanValue(key[3]);
  }

  return keys;
}
