/**
 * Claude usage accounting shared by the batch CLI executor and the
 * interactive (Agent SDK) executor.
 *
 * The API's `input_tokens` EXCLUDES prompt-cache writes and reads, which are
 * reported beside it. Shep's `inputTokens` means every token the prompt cost,
 * so both executors fold the cache counts in here — one rule, so a feature
 * run and an interactive session report the same prompt the same way.
 */

/** The token counts on a Claude `usage` object (CLI result event or SDK message). */
export interface ClaudeUsageTokens {
  readonly input_tokens?: number | null;
  readonly cache_creation_input_tokens?: number | null;
  readonly cache_read_input_tokens?: number | null;
}

/** Total prompt tokens: uncached input + cache creation + cache read. */
export function claudeInputTokens(usage: ClaudeUsageTokens): number {
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}
