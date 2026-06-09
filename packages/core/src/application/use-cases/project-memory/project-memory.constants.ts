/**
 * Shared constants for the project-memory ("Shep Brain") use cases.
 *
 * Centralised here so the read (blob rendering) and record (upsert) use cases
 * agree on caps and category presentation — no magic values scattered across
 * the codebase.
 */

import { MemoryCategory } from '../../../domain/generated/output.js';

/**
 * Maximum number of entries rendered per category in the injected memory blob.
 * Bounds prompt size as the store grows; the most-recently-updated entries win
 * (the repository returns entries newest-first within each category).
 */
export const MAX_ENTRIES_PER_CATEGORY = 12;

/**
 * Maximum stored length of a single memory entry's content. Longer content is
 * truncated on record to keep individual entries concise and prompt-friendly.
 */
export const MAX_CONTENT_LENGTH = 600;

/**
 * Order in which categories are rendered in the memory blob, paired with the
 * human-readable section heading used for each.
 */
export const CATEGORY_SECTIONS: readonly { category: MemoryCategory; label: string }[] = [
  { category: MemoryCategory.Convention, label: 'Conventions' },
  { category: MemoryCategory.ArchitectureDecision, label: 'Architecture Decisions' },
  { category: MemoryCategory.Library, label: 'Preferred Libraries & Tools' },
  { category: MemoryCategory.NamingPattern, label: 'Naming Patterns' },
  { category: MemoryCategory.CiFixResolution, label: 'Past CI/Build Fixes' },
];
