/**
 * Tool Installation Metadata
 *
 * Dynamically loads tool definitions from individual JSON files in the tools/ directory.
 * Each JSON file defines installation commands and metadata for a single development tool.
 *
 * To add a new tool, create a JSON file in tools/ matching the ToolMetadata schema:
 *   tools/<tool-name>.json
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ToolMetadata {
  /** Human-readable display name */
  name: string;

  /** Short one-line summary */
  summary: string;

  /** Detailed description */
  description: string;

  /** Tool tags for grouping in listings. A tool can belong to multiple categories. */
  tags: ('ide' | 'cli-agent' | 'vcs' | 'terminal' | 'memory' | 'cluster')[];

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

const REQUIRED_FIELDS: (keyof ToolMetadata)[] = [
  'name',
  'summary',
  'description',
  'tags',
  'binary',
  'packageManager',
  'commands',
  'timeout',
  'documentationUrl',
  'verifyCommand',
];

function loadToolMetadata(): Record<string, ToolMetadata> {
  // NOTE: This module uses import.meta.url to resolve the tools/ directory.
  // It works correctly when loaded in the Node.js CLI bootstrap context but
  // breaks when bundled by Turbopack (import.meta.url points to the chunk
  // location where tools/ doesn't exist). API routes should access tool
  // metadata via the DI container, not by importing this module directly.
  const toolsDir = join(fileURLToPath(import.meta.url), '..', 'tools');
  const metadata: Record<string, ToolMetadata> = {};

  let files: string[];
  try {
    files = readdirSync(toolsDir).filter((f) => f.endsWith('.json'));
  } catch {
    return metadata;
  }

  for (const file of files) {
    const toolName = basename(file, '.json');
    try {
      const raw = readFileSync(join(toolsDir, file), 'utf-8');
      const parsed = JSON.parse(raw) as ToolMetadata;

      const missing = REQUIRED_FIELDS.filter((field) => !(field in parsed));
      if (missing.length > 0) {
        continue;
      }

      metadata[toolName] = parsed;
    } catch {
      // Skip malformed JSON files
    }
  }

  return metadata;
}

export const TOOL_METADATA: Record<string, ToolMetadata> = loadToolMetadata();

/**
 * Returns entries from TOOL_METADATA that can open a directory as an IDE.
 * A tool qualifies if it has an `openDirectory` field, regardless of category.
 * Each entry is [toolId, metadata].
 */
export function getIdeEntries(): [string, ToolMetadata][] {
  return Object.entries(TOOL_METADATA).filter(([, meta]) => meta.openDirectory != null);
}

/**
 * Returns entries from TOOL_METADATA tagged as "terminal" that have an
 * `openDirectory` field. Each entry is [toolId, metadata].
 */
export function getTerminalEntries(): [string, ToolMetadata][] {
  return Object.entries(TOOL_METADATA).filter(
    ([, meta]) => meta.tags.includes('terminal') && meta.openDirectory != null
  );
}
