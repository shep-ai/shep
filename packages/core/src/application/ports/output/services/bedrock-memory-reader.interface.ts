/**
 * Bedrock Memory Reader Service Interface
 *
 * Output port for inspecting the on-disk `.bedrock/` memory store at a
 * worktree. Powers the BedrockMemoryPanel visualization in the web UI
 * and the `shep bedrock status` CLI command — both need to SEE what
 * bedrock has captured without invoking the python CLI.
 *
 * The port is intentionally read-only:
 *   - No file mutation.
 *   - No subprocess invocation.
 *   - No Node APIs leak across the boundary (file shapes are plain
 *     value objects defined in the domain layer).
 */

import type { BedrockMemorySnapshot } from '../../../../domain/generated/output.js';

/**
 * Options controlling how the snapshot is built.
 *
 * `cwd` is the absolute path of the worktree to probe — typically
 * resolved by a use case from `Application.repositoryPath`,
 * `Repository.path`, or `Feature.worktreePath`. The adapter never
 * derives `cwd` implicitly from `process.cwd()`.
 *
 * `previewBytes` caps the optional `preview` field per file (default
 * 256). Setting it to 0 disables previews entirely — useful for
 * environments where reading file contents is expensive.
 */
export interface BedrockMemoryReaderOptions {
  /** Absolute path to the worktree to probe. */
  cwd: string;
  /** Cap (in bytes) for each file's optional UTF-8 preview. Default: 256. */
  previewBytes?: number;
}

/**
 * Output port for reading a bedrock memory store snapshot.
 *
 * Implementations live under `infrastructure/services/integrations/`
 * and are registered in the tsyringe container under the string token
 * 'IBedrockMemoryReader'.
 */
export interface IBedrockMemoryReader {
  /**
   * Probe the `.bedrock/` directory at `opts.cwd` and return a typed
   * snapshot.
   *
   * Contract:
   *   - When `.bedrock/` is absent the returned snapshot has
   *     `present: false`, empty `files`, and `totalBytes: 0`.
   *   - When `.bedrock/` exists, every regular file inside it
   *     (recursively) is included in `files` with its size and mtime.
   *   - Hidden files (starting with `.`) are skipped except the root
   *     `.bedrock/` directory itself.
   *   - The method never throws on a missing or unreadable directory —
   *     it returns a `present: false` snapshot so the UI can render an
   *     empty state instead of an error.
   */
  read(opts: BedrockMemoryReaderOptions): Promise<BedrockMemorySnapshot>;
}
