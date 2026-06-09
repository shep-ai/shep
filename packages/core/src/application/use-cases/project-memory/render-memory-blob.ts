/**
 * Pure renderer for the project-memory blob.
 *
 * Turns a flat list of ProjectMemory entries into a compact, category-sectioned
 * Markdown blob suitable for injection into agent prompts. Categories render in
 * a fixed order (see CATEGORY_SECTIONS); each is capped to bound prompt size.
 * Returns an empty string when there is nothing to render so callers can omit
 * the memory section entirely for fresh repositories.
 */

import type { ProjectMemory } from '../../../domain/generated/output.js';
import { CATEGORY_SECTIONS, MAX_ENTRIES_PER_CATEGORY } from './project-memory.constants.js';

/**
 * Render the given entries as a category-sectioned Markdown blob.
 *
 * @param entries - Memory entries (any order; grouped + ordered internally)
 * @returns A Markdown blob, or '' when there are no renderable entries
 */
export function renderMemoryBlob(entries: ProjectMemory[]): string {
  if (entries.length === 0) return '';

  const sections: string[] = [];

  for (const { category, label } of CATEGORY_SECTIONS) {
    const inCategory = entries
      .filter((e) => e.category === category && e.content.trim().length > 0)
      .slice(0, MAX_ENTRIES_PER_CATEGORY);

    if (inCategory.length === 0) continue;

    const bullets = inCategory.map((e) => `- ${e.content.trim()}`).join('\n');
    sections.push(`### ${label}\n${bullets}`);
  }

  return sections.join('\n\n');
}
