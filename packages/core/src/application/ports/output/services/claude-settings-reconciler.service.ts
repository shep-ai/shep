/**
 * Claude Settings Reconciler Service Interface
 *
 * Output port that merges two `.claude/settings.json`-shaped JSON payloads —
 * typically a pre-`bedrock init` snapshot (the state shep itself wrote via
 * `SkillInjectorService`) and the post-`bedrock init` state — so neither
 * party clobbers the other's hook entries.
 *
 * Contract:
 *   - The merge is pure-functional over already-parsed JSON. The port does
 *     NOT touch the filesystem and does NOT spawn processes.
 *   - shep entries take precedence on conflict: any shep-authored hook
 *     present in `before` MUST appear in the merged result, even if
 *     `bedrock init` overwrote the settings file. Bedrock entries from
 *     `after` are preserved verbatim and pass through opaque — shep never
 *     reinterprets or regenerates bedrock's hook payload.
 *   - Hook arrays are deduped by stable hook signature so re-running the
 *     merge is idempotent and never produces duplicates.
 *   - Malformed `before` or `after` MUST raise a typed
 *     `ClaudeSettingsMergeFailedError` — never best-effort rewriting.
 *
 * Implementations live in `infrastructure/services/filesystem/` and are
 * registered in the tsyringe container under the string token
 * 'IClaudeSettingsReconciler'.
 */
export interface IClaudeSettingsReconciler {
  /**
   * Merge two parsed `.claude/settings.json` payloads.
   *
   * @param before - The shep-authored state captured before `bedrock init` ran.
   * @param after  - The bedrock-authored state captured after `bedrock init` ran.
   * @returns The reconciled settings object — union of both hook arrays,
   *          deduped by stable signature, with shep entries taking
   *          precedence on conflict.
   */
  mergeSettings(before: unknown, after: unknown): unknown;
}
