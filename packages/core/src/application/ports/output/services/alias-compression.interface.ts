/**
 * Alias Compression Service Interface
 *
 * Output port for session dictionary-based alias compression. Identifies
 * repeated long strings (3+ occurrences, 20+ chars) in prompts and
 * replaces them with short aliases ($A1, $A2, etc.) with a dictionary
 * header prepended to the prompt.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides frequency analysis implementation
 */

/**
 * Result of applying alias compression to a prompt.
 */
export interface AliasCompressionResult {
  /** The prompt with aliases substituted and dictionary header prepended */
  compressed: string;
  /** The dictionary header text (empty string if no aliases created) */
  dictionaryHeader: string;
  /** Number of alias substitutions created */
  aliasCount: number;
}

/**
 * Service interface for alias/meta-token compression.
 *
 * Scans a prompt for repeated long strings, builds a session dictionary,
 * and replaces occurrences with short aliases. A net-positive check
 * ensures the dictionary header does not exceed the savings from aliasing.
 */
export interface IAliasCompressionService {
  /**
   * Apply alias compression to a prompt string.
   *
   * Identifies strings appearing 3+ times that are 20+ characters long,
   * assigns aliases ($A1, $A2, ...), prepends a dictionary header, and
   * replaces all occurrences. Returns the original text unchanged if
   * aliasing would not achieve net-positive savings.
   *
   * @param text - Prompt text to compress via aliasing
   * @returns Compressed text with dictionary, header text, and alias count
   */
  compress(text: string): AliasCompressionResult;
}
