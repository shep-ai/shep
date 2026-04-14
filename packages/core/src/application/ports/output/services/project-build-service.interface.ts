/**
 * Project Build Service Interface
 *
 * Output port for running a project's build script before cloud deployment.
 * Keeps the application layer free of child_process / filesystem imports.
 */

export interface IProjectBuildService {
  /**
   * Run the project's "build" npm script in the given directory.
   * Streams stdout/stderr lines through onLog.
   *
   * Resolves when the build exits with code 0.
   * Rejects with an Error if the build script is missing, dependencies
   * cannot be installed, or the build exits with a non-zero code.
   *
   * @param repositoryPath - Absolute path to the project root
   * @param onLog - Called for each stdout/stderr line produced by the build
   */
  buildProject(repositoryPath: string, onLog: (line: string) => void): Promise<void>;
}
