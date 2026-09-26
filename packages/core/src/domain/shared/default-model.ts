/**
 * The model a fresh install runs every agent on.
 *
 * Settings defaults, the interactive executor's fallback and the chat display
 * fallback all read this constant, so the default changes in one place. The
 * TypeSpec default in `tsp/domain/entities/settings.tsp` must be a literal;
 * `default-model.test.ts` fails if the two disagree.
 *
 * Changing this affects new installs only. A persisted `models.default` is the
 * user's choice and is never rewritten.
 */
export const DEFAULT_MODEL_ID = 'claude-opus-5-5';
