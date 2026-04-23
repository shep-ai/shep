/**
 * Shell variant — controls which outer chrome the web UI renders.
 *
 * - `full` (default)   → existing AppShell with sidebar, FAB, global chat,
 *                        control-center canvas, and every provider.
 * - `apps-only`        → slim AppsOnlyShell with just a thin top bar and
 *                        the applications surface. Providers stay mounted
 *                        so real-time SSE and deployment status keep
 *                        flowing; only the visual chrome is skipped.
 *
 * Transport: HTTP cookie `shep-shell-variant`. The root layout reads it
 * server-side and passes the parsed value down as a prop; Electron sets
 * it via `session.defaultSession.cookies.set(...)` before `loadURL` when
 * launching in apps-only mode. See spec 091-apps-only-surface.
 */

export type ShellVariant = 'full' | 'apps-only';

export const SHELL_VARIANT_COOKIE = 'shep-shell-variant';

export const DEFAULT_SHELL_VARIANT: ShellVariant = 'full';

/**
 * Parse the raw cookie value into a `ShellVariant`. Unknown values and
 * absent cookies fall back to `full` so existing users never see a
 * regression when a new variant lands.
 */
export function parseShellVariant(raw: string | undefined): ShellVariant {
  return raw === 'apps-only' ? 'apps-only' : DEFAULT_SHELL_VARIANT;
}
