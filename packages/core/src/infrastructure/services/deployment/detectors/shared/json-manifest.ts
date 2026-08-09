/**
 * Bounded, never-throwing JSON (and JSONC) manifest reads.
 *
 * `deno.jsonc` and hand-authored config files legitimately carry comments, so
 * `JSON.parse` alone would reject documents a user considers valid. The
 * stripper below removes `//` and block comments and trailing commas while
 * respecting string literals — a comment marker inside `"https://x"` must not
 * truncate the document.
 *
 * Anything it cannot turn into a plain object returns `null`, which every
 * detector reads as "nothing declared here" and falls through (NFR-4).
 */

import { readManifest } from './manifest-read.js';

/**
 * Remove JSONC comments and trailing commas.
 *
 * A single left-to-right pass with a tiny string/comment state machine —
 * enough for real config files and incapable of throwing on garbage.
 */
export function stripJsonComments(input: string): string {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (char === '\\') {
        // Escaped character — copy it verbatim so `\"` does not close the string.
        if (next !== undefined) out += next;
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    out += char;
  }

  // Trailing commas before a closing brace/bracket.
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Read a JSON/JSONC manifest as a plain object.
 *
 * @param filePath - Absolute path to the manifest.
 * @returns The parsed object, or `null` when the file is missing, unreadable,
 *          over the size cap, unparseable, or not a JSON object.
 */
export function readJsonManifest(filePath: string): Record<string, unknown> | null {
  const raw = readManifest(filePath);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(raw));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}
