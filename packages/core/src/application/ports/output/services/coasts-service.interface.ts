/**
 * Coasts Service Interface
 *
 * Output port for managing Coasts containerized runtime isolation.
 * Implementations wrap the coast CLI binary via subprocess invocation
 * and integrate with the AI agent system for Coastfile generation.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementations
 */

/**
 * Result of checking Coasts prerequisites.
 * Each boolean indicates whether a specific prerequisite is met.
 */
export interface PrerequisiteCheckResult {
  /** Whether the `coast` binary is available on PATH. */
  coastBinary: boolean;
  /** Whether the Docker daemon is reachable. */
  docker: boolean;
  /** Whether the coastd daemon is running and responding. */
  coastdRunning: boolean;
  /** Convenience AND of all prerequisite checks. */
  allMet: boolean;
  /** Human-readable messages for each missing prerequisite with fix instructions. */
  missingMessages: string[];
}

/**
 * Information about a running Coasts instance.
 */
export interface CoastInstance {
  /** Port the coast instance is listening on. */
  port: number;
  /** URL to access the coast instance. */
  url: string;
}

/**
 * Port interface for managing Coasts containerized runtime isolation.
 *
 * Implementations must:
 * - Invoke the coast CLI binary via subprocess (not the coastd HTTP API)
 * - Support concurrent operations across different worktrees via workDir scoping
 * - Cache the installation prompt for the process lifetime
 * - Delegate Coastfile generation to the AI agent system
 */
export interface ICoastsService {
  /**
   * Check whether all Coasts prerequisites are met.
   * Validates coast binary on PATH, Docker daemon reachable, and coastd running.
   * On Windows, fails immediately with a platform-not-supported message.
   *
   * @param workDir - Working directory for the check (used as cwd for subprocess calls)
   * @returns Result with individual check statuses and actionable messages for failures
   */
  checkPrerequisites(workDir: string): Promise<PrerequisiteCheckResult>;

  /**
   * Build the Coasts container image for the given directory.
   * Invokes `coast build` in the specified working directory.
   * Safe to call when the image is already built (idempotent).
   *
   * @param workDir - Directory containing the Coastfile
   * @throws Error if coast build fails (exit code non-zero)
   */
  build(workDir: string): Promise<void>;

  /**
   * Start a Coasts instance for the given directory.
   * Invokes `coast run` and returns instance info (port, URL).
   * Safe to call when the instance is already running (idempotent).
   *
   * @param workDir - Directory containing the Coastfile
   * @returns Information about the running coast instance
   * @throws Error if coast run fails
   */
  run(workDir: string): Promise<CoastInstance>;

  /**
   * Stop the Coasts instance for the given directory.
   * Invokes `coast stop` for the specified working directory.
   * No-op if no instance is running.
   *
   * @param workDir - Directory whose coast instance should be stopped
   */
  stop(workDir: string): Promise<void>;

  /**
   * Look up a running Coasts instance for the given directory.
   *
   * @param workDir - Directory to look up
   * @returns Instance info if running, null if not found
   */
  lookup(workDir: string): Promise<CoastInstance | null>;

  /**
   * Check if a Coasts instance is currently running for the given directory.
   *
   * @param workDir - Directory to check
   * @returns True if an instance is running
   */
  isRunning(workDir: string): Promise<boolean>;

  /**
   * Assign canonical ports to this worktree's coast instance.
   * Invokes `coast checkout` in the specified working directory.
   *
   * @param workDir - Directory whose coast instance should be checked out
   */
  checkout(workDir: string): Promise<void>;

  /**
   * Get the Coasts installation prompt for Coastfile generation.
   * Invokes `coast installation-prompt` and returns the full prompt text.
   * The result is cached for the process lifetime (FR-13).
   *
   * @returns The full installation prompt text from the coast CLI
   * @throws Error if the coast binary is not available
   */
  getInstallationPrompt(): Promise<string>;

  /**
   * Generate a Coastfile for the given directory using the AI agent system.
   * Runs `coast installation-prompt` to obtain the generation prompt,
   * passes it to the AI agent system with repo context, and writes the
   * generated Coastfile to the directory.
   *
   * @param workDir - Directory where the Coastfile should be generated
   * @returns Absolute path to the generated Coastfile
   * @throws Error if prompt retrieval or agent execution fails
   */
  generateCoastfile(workDir: string): Promise<string>;

  /**
   * Check if a Coastfile exists in the given directory.
   *
   * @param workDir - Directory to check for a Coastfile
   * @returns True if a Coastfile exists
   */
  hasCoastfile(workDir: string): Promise<boolean>;
}
