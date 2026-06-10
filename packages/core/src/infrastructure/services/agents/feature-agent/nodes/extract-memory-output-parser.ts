/**
 * Extract-Memory Output Parser
 *
 * Extracts structured project-memory entries from the free-form text output of
 * the post-merge extraction agent. Looks for a fenced JSON code block containing
 * an array of { category, entryKey, content } objects, validates each against
 * the MemoryCategory enum, and returns a clean list. Returns an empty array
 * gracefully on any parsing failure — extraction is best-effort.
 */

import { MemoryCategory } from '../../../../../domain/generated/output.js';
import type { ProjectMemoryEntryInput } from '../../../../../application/use-cases/project-memory/record-project-memory.use-case.js';

// Matches a fenced JSON code block: ```json ... ```
const JSON_BLOCK_RE = /```json\s*\n([\s\S]*?)\n\s*```/;

const VALID_CATEGORIES = new Set<string>(Object.values(MemoryCategory));

function isValidEntry(record: unknown): record is ProjectMemoryEntryInput {
  if (record === null || typeof record !== 'object') return false;
  const r = record as Record<string, unknown>;
  if (typeof r.category !== 'string' || !VALID_CATEGORIES.has(r.category)) return false;
  if (typeof r.entryKey !== 'string' || r.entryKey.trim().length === 0) return false;
  if (typeof r.content !== 'string' || r.content.trim().length === 0) return false;
  return true;
}

/**
 * Parse project-memory entries from agent text output.
 *
 * @param output - Raw agent output that should contain a fenced JSON array
 * @returns Valid entries, or [] when no block is found / JSON is malformed
 */
export function parseMemoryEntries(output: string): ProjectMemoryEntryInput[] {
  const match = output.match(JSON_BLOCK_RE);
  if (!match) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isValidEntry).map((e) => ({
    category: e.category,
    entryKey: e.entryKey.trim(),
    content: e.content.trim(),
  }));
}
