/**
 * Elixir detector — `mix phx.server` for Phoenix, `mix run --no-halt` otherwise.
 *
 * `mix.exs` is executable Elixir, never parsed as data. The only fact read
 * from it is whether the project depends on `:phoenix`, and that is a
 * substring match over the file with comments removed — a `# uses phoenix`
 * note must not turn a plain mix project into a Phoenix one.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult } from './types.js';
import { findManifest, readManifest } from './shared/manifest-read.js';
import { FRAMEWORK_DEFAULT_PORTS } from './shared/command-port.js';

const MIX_MANIFEST = 'mix.exs';

/** Directory `mix deps.get` populates — its absence means dependencies are missing. */
const DEPS_DIR = 'deps';

/** The `:phoenix` dependency atom, as it appears in a `deps` list. */
const PHOENIX_DEP = /(^|[^A-Za-z0-9_]):phoenix\b/;

const PHOENIX = 'Phoenix';

const log = createDeploymentLogger('[detectElixir]');

/**
 * Detect an Elixir project.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns The mix command to start the project, or a fall-through error.
 */
export const detectElixir: Detector = (dirPath: string): DetectorResult => {
  const manifestPath = findManifest(dirPath, [MIX_MANIFEST]);
  if (manifestPath === null) {
    return { success: false, error: `No mix.exs found in ${dirPath}` };
  }

  const contents = readManifest(manifestPath);
  if (contents === null) {
    log.warn(`could not read ${manifestPath} — falling through`);
    return { success: false, error: `Could not read ${manifestPath}` };
  }

  const isPhoenix = PHOENIX_DEP.test(stripElixirComments(contents));
  const command = isPhoenix ? 'mix phx.server' : 'mix run --no-halt';
  log.info(`detected — command="${command}", resolvedDir="${dirPath}"`);

  return {
    success: true,
    command,
    needsInstall: !existsSync(join(dirPath, DEPS_DIR)),
    resolvedDir: dirPath,
    language: 'Elixir',
    runtime: 'mix',
    setupCommands: ['mix deps.get'],
    ...(isPhoenix ? { framework: PHOENIX, expectedPort: FRAMEWORK_DEFAULT_PORTS[PHOENIX] } : {}),
  };
};

/**
 * Remove `#` comments, leaving string literals intact.
 *
 * A `#` inside `"..."` or `'...'` is content, not a comment — cutting there
 * would be harmless here but wrong for anything that reads values later.
 */
function stripElixirComments(contents: string): string {
  return contents
    .split('\n')
    .map((line) => {
      let quote: string | null = null;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '\\') {
          i++;
          continue;
        }
        if (quote !== null) {
          if (char === quote) quote = null;
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === '#') return line.slice(0, i);
      }

      return line;
    })
    .join('\n');
}
