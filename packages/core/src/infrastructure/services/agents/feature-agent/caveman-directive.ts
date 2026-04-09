/**
 * Caveman mode — default system-prompt directive for Claude Code.
 *
 * Injected via `claude --append-system-prompt <text>` so it persists
 * across every turn in the session. Purpose: shrink the agent's own
 * output AND shrink the accumulated conversation history that gets
 * re-sent on every subsequent turn. Savings compound across turns.
 *
 * The directive itself is deliberately terse (practicing what it
 * preaches) so the system-prompt overhead is minimal — ~300 tokens
 * of directive in exchange for compounding savings across 30+ turns
 * of session history is a strongly net-positive trade.
 *
 * NOT applied to the `merge` node even when caveman mode is enabled.
 * Merge writes commit messages, PR titles, and PR bodies that humans
 * read; caveman style there produces unreadable "ui add star count.
 * test pass. push." commits. The exemption happens at the enforcement
 * site in `buildExecutorOptions`, not here.
 */

export const DEFAULT_CAVEMAN_DIRECTIVE = `Respond like smart caveman. Cut all filler, keep technical substance.
- Drop articles (a, an, the), filler (just, really, basically, actually).
- Drop pleasantries (sure, certainly, happy to).
- No hedging. Fragments fine. Short synonyms.
- Technical terms stay exact. Code blocks unchanged.
- Pattern: [thing] [action] [reason]. [next step].`;

/**
 * Nodes that are ALWAYS exempt from the caveman directive, regardless of
 * user settings. These nodes produce output that humans read directly
 * (commit messages, PR bodies, release notes), so terse style is actively
 * harmful there.
 *
 * Add a node name to this set to exempt it. Do NOT remove `merge`.
 */
export const CAVEMAN_EXEMPT_NODES: ReadonlySet<string> = new Set(['merge']);

/**
 * Resolve the effective caveman directive for a given node, or undefined
 * when caveman mode should not apply. Pure function; no I/O.
 *
 * @param nodeName - The current graph node name
 * @param enabled - Whether caveman mode is enabled in settings
 * @param customDirective - Optional user override for the directive text
 * @returns The directive string to pass to `--append-system-prompt`, or
 *          undefined to skip the flag entirely
 */
export function resolveCavemanDirective(
  nodeName: string,
  enabled: boolean,
  customDirective?: string
): string | undefined {
  if (!enabled) return undefined;
  if (CAVEMAN_EXEMPT_NODES.has(nodeName)) return undefined;
  return customDirective ?? DEFAULT_CAVEMAN_DIRECTIVE;
}
