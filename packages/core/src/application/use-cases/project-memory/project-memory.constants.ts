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

/**
 * Which memory categories matter most for each SDLC phase/agent prompt. Used by
 * the relevance scorer to boost on-topic categories per prompt (e.g. the CI-fix
 * agent cares about past CI fixes; the implement agent cares about conventions
 * and naming). A phase not listed here treats all categories as neutral.
 */
export const PHASE_CATEGORY_AFFINITY: Readonly<Record<string, readonly MemoryCategory[]>> = {
  analyze: [
    MemoryCategory.ArchitectureDecision,
    MemoryCategory.Convention,
    MemoryCategory.Library,
    MemoryCategory.NamingPattern,
  ],
  requirements: [MemoryCategory.Convention, MemoryCategory.ArchitectureDecision],
  research: [
    MemoryCategory.ArchitectureDecision,
    MemoryCategory.Library,
    MemoryCategory.Convention,
  ],
  plan: [MemoryCategory.ArchitectureDecision, MemoryCategory.Convention, MemoryCategory.Library],
  implement: [
    MemoryCategory.Convention,
    MemoryCategory.NamingPattern,
    MemoryCategory.Library,
    MemoryCategory.ArchitectureDecision,
  ],
  'fast-implement': [
    MemoryCategory.Convention,
    MemoryCategory.NamingPattern,
    MemoryCategory.Library,
  ],
  merge: [MemoryCategory.Convention, MemoryCategory.CiFixResolution],
  'ci-fix': [MemoryCategory.CiFixResolution, MemoryCategory.Convention, MemoryCategory.Library],
  interactive: [
    MemoryCategory.Convention,
    MemoryCategory.ArchitectureDecision,
    MemoryCategory.Library,
    MemoryCategory.NamingPattern,
    MemoryCategory.CiFixResolution,
  ],
};

/** Relevance scoring weights (deterministic lexical scorer). Must sum to ~1. */
export const RELEVANCE_WEIGHTS = {
  /** Lexical overlap between the entry and the task text. */
  lexical: 0.6,
  /** Category affinity for the consuming phase. */
  category: 0.3,
  /** Recency (more-recently-updated entries score slightly higher). */
  recency: 0.1,
} as const;

/** Category-affinity score for an on-topic vs off-topic category. */
export const CATEGORY_AFFINITY_ON = 1;
export const CATEGORY_AFFINITY_OFF = 0.25;

/**
 * Approximate token budget for the injected memory section per prompt. Selection
 * greedily includes the highest-scored entries until this budget is reached, so
 * prompt size stays bounded no matter how large the store grows. Approximated as
 * characters at ~4 chars/token.
 */
export const MEMORY_TOKEN_BUDGET = 1500;
export const CHARS_PER_TOKEN = 4;

/**
 * Common English + code stopwords ignored when computing lexical overlap so that
 * ranking keys on meaningful terms, not filler.
 */
export const RELEVANCE_STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'into',
  'use',
  'used',
  'using',
  'should',
  'must',
  'not',
  'are',
  'was',
  'were',
  'will',
  'can',
  'via',
  'per',
  'all',
  'any',
  'when',
  'then',
  'than',
  'but',
  'its',
  'has',
  'have',
  'add',
  'set',
  'get',
  'new',
  'run',
]);
