/**
 * Tool Metadata Provider Interface
 *
 * Output port that exposes read-only access to the catalogue of installable
 * developer tools (IDEs, CLI agents, terminals, VCS clients).
 * Infrastructure implementations are responsible for loading the underlying
 * JSON catalogue; application layer only consumes the resulting metadata.
 */

/**
 * Static metadata describing a single tool entry in the catalogue.
 *
 * Mirrors the JSON schema used by infrastructure loaders and is safe to
 * consume from the application layer (no IO side effects).
 */
export interface ToolMetadata {
  /** Human-readable display name */
  name: string;

  /** Short one-line summary */
  summary: string;

  /** Detailed description */
  description: string;

  /** Tool tags for grouping in listings. A tool can belong to multiple categories. */
  tags: ('ide' | 'cli-agent' | 'vcs' | 'terminal' | 'memory')[];

  /** Company or developer name */
  author?: string;

  /** Main website/homepage URL (separate from documentation) */
  website?: string;

  /** Supported platforms (os.platform() values) */
  platforms?: ('linux' | 'darwin' | 'win32')[];

  /** URL to the tool's icon/logo image */
  iconUrl?: string;

  /** Binary name to check with 'which' command (string or per-platform map) */
  binary: string | Record<string, string>;

  /** Package manager or installation method */
  packageManager: string;

  /** Platform-specific installation commands as shell strings (keyed by os.platform()) */
  commands: Record<string, string>;

  /** Installation timeout in milliseconds */
  timeout: number;

  /** Official documentation URL */
  documentationUrl: string;

  /** Command to verify installation (e.g., "code --version") */
  verifyCommand: string;

  /** Whether the tool supports automated installation (default: true) */
  autoInstall?: boolean;

  /** Whether this tool is required for the platform to function (default: false) */
  required?: boolean;

  /** Command to open a directory in this tool.
   * String format: "code {dir}" — single command for all platforms.
   * Object format: { "linux": "antigravity {dir}", "darwin": "agy {dir}" } — per-platform commands. */
  openDirectory?: string | Record<string, string>;

  /** Override default spawn options for the launch process.
   * Defaults: { detached: true, stdio: "ignore" } (GUI IDEs).
   * CLI agents should use { shell: true, stdio: "inherit" } to run in the current terminal. */
  spawnOptions?: {
    shell?: boolean;
    stdio?: 'ignore' | 'inherit' | 'pipe';
    detached?: boolean;
  };

  /** Platform-specific command to launch this tool in a new terminal window.
   * Used when launching from the web UI where no terminal is available.
   * When set, the launcher spawns a new terminal window with this command.
   * Supports {dir} placeholder like openDirectory.
   * Example: "x-terminal-emulator -e bash -c 'cd {dir} && claude'" */
  terminalCommand?: string | Record<string, string>;
}

/**
 * Read-only accessor over the installed-tool catalogue.
 *
 * Implementations must not expose IO concerns. Return values are the same
 * metadata documents the JSON source defines; callers treat them as immutable.
 */
export interface IToolMetadataProvider {
  /**
   * Returns metadata for the given tool id, or undefined when the id is
   * not present in the catalogue.
   */
  getToolById(toolId: string): ToolMetadata | undefined;

  /**
   * Returns all catalogue entries as [toolId, metadata] tuples in an
   * unspecified but stable-per-call order.
   */
  getAllEntries(): [string, ToolMetadata][];
}
