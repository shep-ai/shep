/**
 * Dev Environment Agent Interface
 *
 * Output port for agent-based dev environment analysis.
 * Uses an AI agent to analyze any repository (language-agnostic) and determine
 * how to start a local development server. Supports per-repo caching for fast
 * repeated invocations.
 *
 * Key behaviors:
 * - Analyzes repo structure to detect dev server commands across all languages
 * - Returns a "not deployable" result for repos with no server/UI to start
 * - Caches analysis results per-repo for fast subsequent calls
 */

/** Result of analyzing a repository for dev environment setup. */
export interface DevEnvironmentAnalysis {
  /** Whether this repo has a startable dev environment. */
  deployable: boolean;

  /** Human-readable explanation of what was detected or why it's not deployable. */
  reason: string;

  /** The shell command to start the dev server (null if not deployable). */
  command: string | null;

  /** Working directory relative to repo root (defaults to "."). */
  cwd: string;

  /** Expected port the dev server will listen on (null if unknown). */
  expectedPort: number | null;

  /** Detected language/framework (e.g., "node", "python", "go", "rust"). */
  language: string | null;

  /** Detected framework if any (e.g., "next.js", "django", "flask", "gin"). */
  framework: string | null;

  /** Setup commands to run before the dev command (e.g., "npm install"). */
  setupCommands: string[];
}

/** Options for the analyze method. */
export interface DevEnvironmentAnalyzeOptions {
  /** Skip the cache and force a fresh analysis. */
  skipCache?: boolean;
}

/**
 * Port interface for AI-driven dev environment analysis.
 *
 * Implementations use a structured agent caller to analyze repositories
 * and determine how to start a local dev server. Results are cached
 * per-repo (keyed by absolute path) for fast repeated calls.
 */
export interface IDevEnvironmentAgent {
  /**
   * Analyze a repository to determine how to start its dev environment.
   *
   * @param repositoryPath - Absolute filesystem path to the repository
   * @param options - Optional configuration (e.g., skip cache)
   * @returns Analysis result with command, language, and deployability info
   */
  analyze(
    repositoryPath: string,
    options?: DevEnvironmentAnalyzeOptions
  ): Promise<DevEnvironmentAnalysis>;

  /**
   * Clear the cached analysis for a specific repository.
   *
   * @param repositoryPath - Absolute filesystem path to the repository
   */
  clearCache(repositoryPath: string): void;

  /**
   * Clear all cached analyses.
   */
  clearAllCaches(): void;
}
