/**
 * Application Brief Store (output port)
 *
 * Persists the Shep application-creation brief for a given application
 * to a well-known on-disk location OUTSIDE the user's project directory,
 * so the brief does not pollute the scaffolded repo (no stray
 * `SHEP_BRIEF.md` sitting next to `package.json`).
 *
 * The brief is the text we can't deliver via the Claude Agent SDK V2
 * session API (which silently drops `systemPrompt`). We materialize it
 * on disk and ask the agent to read it on turn 1 via its `Read` tool.
 * Keeping it inside the Shep home directory (e.g.
 * `~/.shep/application-briefs/<applicationId>.md`) means:
 *
 *   - the user's project tree stays clean,
 *   - briefs survive project-folder recreation and are auditable,
 *   - `SHEP_HOME=<tmp>` in tests transparently isolates them.
 *
 * Adapters live in infrastructure and are the only place allowed to
 * know the real on-disk layout.
 */

export interface IApplicationBriefStore {
  /**
   * Persist the brief content for `applicationId` to the Shep-managed
   * brief directory, creating parent directories as needed.
   *
   * @param applicationId  Stable application identifier (UUID).
   * @param content        Full brief text — persona, workflow, quality
   *                       bar, etc. Written as UTF-8.
   * @returns The absolute path the brief was written to. Callers embed
   *          this path in the agent kickoff directive so the agent can
   *          read the brief with its `Read` tool.
   */
  write(applicationId: string, content: string): Promise<string>;
}
