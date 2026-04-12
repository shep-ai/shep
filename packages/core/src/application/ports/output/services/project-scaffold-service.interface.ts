/**
 * Project Scaffold Service Interface
 *
 * Output port for creating brand-new project folders on the filesystem.
 * The adapter owns "where projects live" (e.g. $SHEP_HOME/projects) and
 * how they are bootstrapped (mkdir + git init + initial commit) so the
 * application layer stays free of node:fs / child_process imports.
 */

export interface ScaffoldProjectInput {
  /** Filesystem-safe slug derived from the user-supplied project name. */
  slug: string;
}

export interface ScaffoldProjectResult {
  /** Absolute path to the created folder, normalized to forward slashes. */
  path: string;
}

export interface IProjectScaffoldService {
  /**
   * Check whether a project folder with the given slug already exists.
   * Used by the use case to fail fast without overwriting user data.
   */
  projectExists(slug: string): Promise<boolean>;

  /**
   * Create the project folder under the configured projects root, initialise
   * git, and commit an empty initial commit so the canvas can resolve a real
   * HEAD immediately. Implementations should be cross-platform safe.
   *
   * @throws Error if the directory cannot be created. Git init failures
   *         should be tolerated (the folder still exists) but logged.
   */
  scaffoldProject(input: ScaffoldProjectInput): Promise<ScaffoldProjectResult>;
}
