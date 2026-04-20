/**
 * Application Scaffolder (output port)
 *
 * Produces a ready-to-code project tree at a given repository path so
 * the agent's first turn starts on a flat, dependency-installed,
 * theme-ready project — no `bunx shadcn init`, no flatten gymnastics,
 * no package-manager bootstrap inside an agent turn.
 *
 * The port is deliberately narrow and presentation-agnostic:
 *   - No Node types (`fs`, `ChildProcess`, `URL`) leak into the
 *     signature — the use-case that depends on this port must remain
 *     runnable in any environment where a `ScaffoldResult` can be
 *     produced.
 *   - No bash strings, no package-manager names, no template paths —
 *     those are infrastructure concerns owned by the adapter.
 *
 * Adapters live in `infrastructure/services/scaffolding/`.
 *
 * @see `CreateApplicationUseCase` for the single caller.
 */

export interface ScaffoldOptions {
  /**
   * Absolute path where the scaffolded project must end up. The adapter
   * is responsible for ensuring `package.json` lives at exactly this
   * path — no intermediate subdirectories — on success.
   */
  readonly repositoryPath: string;

  /**
   * Human-readable project name. Adapters may slugify it for
   * `package.json#name`, folder naming during intermediate steps, etc.
   */
  readonly projectName: string;

  /**
   * ID of the Application this scaffold belongs to. Used as the
   * `operationId` when the adapter appends progress/error entries to
   * the shared operation log so the UI can stream the scaffold's
   * stdout/stderr into the same drawer that shows deploy / publish /
   * sync activity.
   */
  readonly applicationId: string;

  /**
   * Progress callback. The adapter emits high-level phase events
   * (`Starting shadcn init`, `bun add extras done`) and deduped CLI
   * output lines from child processes as they arrive. Must never
   * throw — errors inside the callback are swallowed by the adapter
   * so a failing sink cannot abort a successful scaffold.
   *
   * Level mapping:
   *   - `Info` — phase boundaries + stdout from child processes
   *   - `Warn` — stderr from child processes (surfaced as warnings so
   *     the user can see progress chatter without the whole log
   *     turning red; real failures are emitted as `Error` by the
   *     adapter itself on non-zero exit)
   *   - `Error` — phase failure with the exception message
   *   - `Debug` — low-priority bookkeeping (reserved)
   */
  readonly onLog?: ScaffoldLogCallback;
}

export type ScaffoldLogLevel = 'Debug' | 'Info' | 'Warn' | 'Error';

export type ScaffoldLogCallback = (entry: {
  level: ScaffoldLogLevel;
  message: string;
  /** Optional multi-line block — typically captured stdout/stderr. */
  detail?: string;
}) => void;

export interface ScaffoldResult {
  /**
   * Absolute path to the finished project root. Always equal to
   * `options.repositoryPath` on success — returned explicitly so the
   * caller can assert the contract held.
   */
  readonly repositoryPath: string;

  /**
   * Relative paths (relative to `repositoryPath`) of the files the
   * adapter's template overlay wrote on top of the raw scaffold. Empty
   * array when the adapter did not overlay a template. Useful for the
   * final `report` step and for integration tests.
   */
  readonly templateFiles: readonly string[];

  /**
   * Opaque version string identifying the template bundle that was
   * applied. Persisted on the `Application` row so future migrations
   * can invalidate or re-overlay stale template payloads. Empty string
   * when no template was applied.
   */
  readonly templateVersion: string;
}

export interface IApplicationScaffolder {
  /**
   * Scaffold a new project at `options.repositoryPath`.
   *
   * Contract on success:
   *   - `package.json` exists at `repositoryPath`.
   *   - All dependencies the agent needs on turn 1 are installed
   *     (node_modules present).
   *   - The template overlay (if any) has been applied.
   *
   * Throws when the adapter cannot produce a valid project tree. The
   * caller is responsible for cleaning up the partial directory on
   * failure — the adapter SHOULD NOT delete anything it did not
   * create.
   */
  scaffold(options: ScaffoldOptions): Promise<ScaffoldResult>;
}
