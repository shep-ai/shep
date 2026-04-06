/**
 * Semantic Compressor Service Interface
 *
 * Output port for rule-based text compression on non-code prompt sections.
 * Applies deterministic transformations (article removal, filler word
 * stripping, phrase shortening, whitespace collapsing) while preserving
 * code blocks, file paths, URLs, YAML/JSON content, and quoted strings.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides regex-based caveman compression
 */

/**
 * Result of applying semantic text compression.
 */
export interface SemanticCompressionResult {
  /** The compressed text */
  compressed: string;
  /** Compression ratio (compressed length / original length, 0.0-1.0) */
  compressionRatio: number;
}

/**
 * Service interface for rule-based semantic text compression.
 *
 * Applies caveman-style compression to natural language instruction
 * sections of prompts: removing articles, filler words, shortening
 * common phrases, and collapsing whitespace. Protected regions
 * (code blocks, URLs, YAML, quoted strings) are excluded.
 */
export interface ISemanticCompressorService {
  /**
   * Compress natural language text in a prompt.
   *
   * Detects and preserves protected regions (code fences, URLs, file
   * paths, YAML/JSON blocks, quoted strings), then applies compression
   * rules to the remaining natural language sections.
   *
   * @param text - Prompt text to compress
   * @returns Compressed text and compression ratio
   */
  compress(text: string): SemanticCompressionResult;
}
