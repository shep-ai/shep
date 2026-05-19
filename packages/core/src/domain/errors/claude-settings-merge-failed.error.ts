/**
 * Claude Settings Merge Failed Error
 *
 * Thrown by the ClaudeSettingsReconciler when the supplied `before` or
 * `after` payload cannot be reconciled — for example because the JSON
 * structure does not match the expected `.claude/settings.json` shape, or
 * because a hook entry is malformed. The reconciler MUST raise this error
 * rather than best-effort rewriting on malformed input, so we never
 * silently corrupt user content.
 */
export class ClaudeSettingsMergeFailedError extends Error {
  readonly code = 'CLAUDE_SETTINGS_MERGE_FAILED';
  readonly remediation: string;

  constructor(public readonly reason: string) {
    super(`Failed to merge .claude/settings.json — ${reason}`);
    this.name = 'ClaudeSettingsMergeFailedError';
    this.remediation =
      'Inspect `.claude/settings.json` for invalid or unexpected JSON, restore it from git, and re-run the bedrock enable flow.';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
