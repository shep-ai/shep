/**
 * Environment scrubbing for spawned user dev servers.
 *
 * The cloud org-runner pod sets a handful of env vars for the cli process
 * ITSELF that must NOT propagate to user dev servers that DeploymentService
 * spawns:
 *
 *  - `NEXT_ASSET_PREFIX=/cli` — the cli's own Next.js UI is served behind the
 *    shep-cloud proxy under `/cli`. If a user's Next.js dev server inherits
 *    this, it emits `/cli/_next/...` asset URLs, which 404 on the preview
 *    origin (`<port>-<orgHex>.preview.shep.bot`) because the dev server serves
 *    its static assets at `/_next/...`. This breaks every previewed app.
 *  - `PORT` — the cli web port; a user app that honors PORT would fight the
 *    cli for it instead of using its own framework default.
 *  - Anthropic credentials — the cli's own agent creds; user dev servers (and
 *    their postinstall scripts) must never see them.
 *
 * The org-runner image also ships `env-scrub` PATH wrappers for the package
 * managers, but those depend on PATH resolution and are bypassed when the
 * spawned binary (e.g. `bun`, or a globally-installed pnpm) resolves ahead of
 * `/usr/local/sbin`. Scrubbing here, at the spawn point, is deterministic and
 * independent of PATH.
 *
 * `HOST` / `HOSTNAME` are deliberately KEPT: the pod sets them to `0.0.0.0`
 * so dev servers bind all interfaces and the preview proxy can reach them on
 * the pod IP.
 */
export const DEV_SERVER_ENV_BLOCKLIST = [
  'NEXT_ASSET_PREFIX',
  'PORT',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

/**
 * Build the environment for a spawned dev server: a copy of `baseEnv` with the
 * cli-only vars removed, then `overrides` applied on top. Never mutates input.
 */
export function buildDevServerEnv(
  baseEnv: Partial<NodeJS.ProcessEnv>,
  overrides: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...baseEnv };
  for (const key of DEV_SERVER_ENV_BLOCKLIST) {
    delete env[key];
  }
  // Real callers pass process.env, so the result carries NODE_ENV etc.; the
  // cast keeps the return assignable to spawn()'s env option.
  return { ...env, ...overrides } as NodeJS.ProcessEnv;
}
