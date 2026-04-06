/**
 * Command Output Filter Service Interface
 *
 * Output port for filtering command output (test runners, build tools,
 * git operations) embedded in prompts. Applies configurable regex-based
 * filter policies to reduce token consumption while preserving all
 * error-relevant information.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides regex-based implementation
 */

/**
 * Filter policy type identifying the kind of command output.
 */
export type OutputFilterPolicyType =
  | 'jest'
  | 'vitest'
  | 'typescript-build'
  | 'git-diff'
  | 'pnpm-install'
  | 'generic';

/**
 * Result of applying the command output filter to a prompt.
 */
export interface CommandOutputFilterResult {
  /** The filtered prompt string */
  filtered: string;
  /** Number of lines removed by the filter */
  linesRemoved: number;
}

/**
 * Service interface for filtering command output within prompts.
 *
 * Scans the prompt for recognizable command output blocks and applies
 * reduction policies: removing passing test lines, truncating long diffs,
 * collapsing blank lines, and summarizing passing sections with counts.
 *
 * Safety guarantee: any line containing error-related keywords (error,
 * fail, warn, ENOENT, exception, stack, panic, timeout, denied, etc.)
 * is preserved verbatim.
 */
export interface ICommandOutputFilterService {
  /**
   * Filter command output embedded in a prompt string.
   *
   * Detects output blocks (fenced code blocks, test runner output patterns)
   * and applies reduction policies based on detected output type. Lines
   * containing error-related keywords are always preserved.
   *
   * @param prompt - Raw prompt containing embedded command output
   * @returns Filtered prompt and count of lines removed
   */
  filter(prompt: string): CommandOutputFilterResult;
}
