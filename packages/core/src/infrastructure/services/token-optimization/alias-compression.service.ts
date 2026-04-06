/**
 * Alias Compression Service
 *
 * Session dictionary-based alias compression for prompts. Scans text for
 * repeated long strings (3+ occurrences, 20+ characters), assigns short
 * aliases ($A1, $A2, ...), prepends a dictionary header, and replaces
 * all occurrences. A net-positive check ensures the dictionary overhead
 * does not exceed the savings from aliasing.
 */

import type {
  IAliasCompressionService,
  AliasCompressionResult,
} from '@/application/ports/output/services/alias-compression.interface.js';

/** Minimum number of occurrences for a string to qualify for aliasing. */
const MIN_OCCURRENCES = 3;

/** Minimum character length for a string to qualify for aliasing. */
const MIN_LENGTH = 20;

/** Alias prefix format: $A1, $A2, ... */
const ALIAS_PREFIX = '$A';

/**
 * Candidate for aliasing — a repeated string with its occurrence count.
 */
interface AliasCandidate {
  original: string;
  count: number;
}

export class AliasCompressionService implements IAliasCompressionService {
  /**
   * Apply alias compression to a prompt string.
   *
   * Strategy:
   * 1. Find all substrings appearing 3+ times that are 20+ chars
   * 2. Sort by frequency (most frequent first) for optimal alias assignment
   * 3. Compute net savings — skip if dictionary overhead exceeds body savings
   * 4. Build dictionary header and replace occurrences
   */
  compress(text: string): AliasCompressionResult {
    if (text === '') {
      return { compressed: '', dictionaryHeader: '', aliasCount: 0 };
    }

    // Step 1: Find candidate strings
    const candidates = this.findCandidates(text);
    if (candidates.length === 0) {
      return { compressed: text, dictionaryHeader: '', aliasCount: 0 };
    }

    // Step 2: Sort by frequency descending (most repeated first)
    candidates.sort((a, b) => b.count - a.count);

    // Step 3: Assign aliases and compute net savings
    const aliases = candidates.map((candidate, index) => ({
      ...candidate,
      alias: `${ALIAS_PREFIX}${index + 1}`,
    }));

    // Calculate savings
    const dictionaryHeader = this.buildDictionaryHeader(aliases);
    const bodySavings = aliases.reduce(
      (total, { original, alias, count }) => total + count * (original.length - alias.length),
      0
    );
    const netSavings = bodySavings - dictionaryHeader.length;

    if (netSavings <= 0) {
      return { compressed: text, dictionaryHeader: '', aliasCount: 0 };
    }

    // Step 4: Replace occurrences in text
    let body = text;
    for (const { original, alias } of aliases) {
      body = body.replaceAll(original, alias);
    }

    return {
      compressed: dictionaryHeader + body,
      dictionaryHeader,
      aliasCount: aliases.length,
    };
  }

  /**
   * Find all substrings that qualify for aliasing.
   *
   * Uses word-boundary-aware token extraction to find repeated multi-word
   * strings. Scans for non-whitespace tokens of sufficient length, then
   * checks if longer contiguous phrases also repeat enough times.
   */
  private findCandidates(text: string): AliasCandidate[] {
    // Extract all non-whitespace tokens of 20+ chars
    const longTokens = new Map<string, number>();

    // Match sequences of non-whitespace characters that are 20+ chars
    const tokenRegex = /\S{20,}/g;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(text)) !== null) {
      const token = match[0];
      longTokens.set(token, (longTokens.get(token) ?? 0) + 1);
    }

    // Filter to candidates meeting the occurrence threshold
    const candidates: AliasCandidate[] = [];
    for (const [token, count] of longTokens) {
      if (count >= MIN_OCCURRENCES && token.length >= MIN_LENGTH) {
        candidates.push({ original: token, count });
      }
    }

    // Remove candidates that are substrings of other candidates with same or higher count
    return this.removeSubsumedCandidates(candidates);
  }

  /**
   * Remove candidates that are substrings of longer candidates with
   * equal or greater frequency (the longer alias provides more savings).
   */
  private removeSubsumedCandidates(candidates: AliasCandidate[]): AliasCandidate[] {
    // Sort by length descending so longer strings are checked first
    const sorted = [...candidates].sort((a, b) => b.original.length - a.original.length);
    const result: AliasCandidate[] = [];

    for (const candidate of sorted) {
      const isSubsumed = result.some(
        (existing) =>
          existing.original.includes(candidate.original) && existing.count >= candidate.count
      );
      if (!isSubsumed) {
        result.push(candidate);
      }
    }

    return result;
  }

  /**
   * Build the dictionary header string.
   * Format: "## Aliases\n$A1 = "original"\n$A2 = "original"\n\n"
   */
  private buildDictionaryHeader(aliases: { alias: string; original: string }[]): string {
    const lines = aliases.map(({ alias, original }) => `${alias} = "${original}"`);
    return `## Aliases\n${lines.join('\n')}\n\n`;
  }
}
