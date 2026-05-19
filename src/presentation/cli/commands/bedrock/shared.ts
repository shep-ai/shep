/**
 * Shared helpers for `shep bedrock` subcommands.
 *
 * - `appOption`: applies the common `--app <id>` Commander option.
 * - `pipeProgressToStdout`: typed callback that mirrors BedrockProgressChunk
 *   to process.stdout / process.stderr.
 * - `renderBedrockError`: pretty-prints typed bedrock domain errors with
 *   their attached remediation string.
 */

import type { Command } from 'commander';
import { messages } from '../../ui/index.js';

export interface BedrockProgressChunk {
  stream: 'stdout' | 'stderr';
  data: string;
}

export function appOption(cmd: Command): Command {
  return cmd.requiredOption('--app <id>', 'Application id (required)');
}

export function pipeProgressToStdout(chunk: BedrockProgressChunk): void {
  // Both stdout and stderr chunks are mirrored to the parent's stdout so
  // users see a single coherent stream, matching `shep install`'s convention.
  process.stdout.write(chunk.data);
}

interface BedrockLikeError extends Error {
  remediation?: string;
  code?: string;
}

export function renderBedrockError(label: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  messages.error(label, err);
  const candidate = err as BedrockLikeError;
  if (candidate.remediation) {
    messages.info(candidate.remediation);
  }
  process.exitCode = 1;
}
