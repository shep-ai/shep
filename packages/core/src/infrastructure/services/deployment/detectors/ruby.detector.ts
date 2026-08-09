/**
 * Ruby detector — Rails.
 *
 * Rails is the one Ruby stack with a canonical dev invocation, so this
 * detector answers exactly one question: is this a Rails application? A
 * `bin/rails` binstub is the strongest possible answer (Rails writes it), and
 * a `Gemfile` declaring the `rails` gem is the fallback. A Ruby project that
 * is not Rails falls through to the agent tier, which is better at guessing
 * than we are.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult } from './types.js';
import { findManifest, readManifest } from './shared/manifest-read.js';
import { FRAMEWORK_DEFAULT_PORTS } from './shared/command-port.js';

/** The binstub Rails writes into every generated application. */
const RAILS_BINSTUB = 'bin/rails';

const GEMFILE = 'Gemfile';

/** A `gem "rails"` declaration, in either quoting style. */
const RAILS_GEM = /^\s*gem\s+["']rails["']/m;

const RAILS = 'Rails';

const log = createDeploymentLogger('[detectRuby]');

/**
 * Detect a Rails application.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns `bin/rails server` or `bundle exec rails server`, or a
 *          fall-through error for any non-Rails Ruby project.
 */
export const detectRuby: Detector = (dirPath: string): DetectorResult => {
  const gemfilePath = findManifest(dirPath, [GEMFILE]);
  const hasGemfile = gemfilePath !== null;
  const setupCommands = hasGemfile ? ['bundle install'] : [];

  const command = resolveCommand(dirPath, gemfilePath);
  if (command === null) {
    return { success: false, error: `No Rails application found in ${dirPath}` };
  }

  log.info(`detected — command="${command}", resolvedDir="${dirPath}"`);

  return {
    success: true,
    command,
    // Bundler installs into a shared gem home by default, so there is no
    // in-repo directory whose absence reliably means "not installed".
    needsInstall: false,
    resolvedDir: dirPath,
    language: 'Ruby',
    framework: RAILS,
    runtime: hasGemfile ? 'bundle' : 'ruby',
    expectedPort: FRAMEWORK_DEFAULT_PORTS[RAILS],
    setupCommands,
  };
};

/**
 * Resolve the Rails server command, binstub first.
 *
 * @returns The command, or `null` when this is not a Rails application.
 */
function resolveCommand(dirPath: string, gemfilePath: string | null): string | null {
  if (existsSync(join(dirPath, ...RAILS_BINSTUB.split('/')))) {
    return `${RAILS_BINSTUB} server`;
  }

  if (gemfilePath === null) return null;

  const gemfile = readManifest(gemfilePath);
  if (gemfile === null) {
    log.warn(`could not read ${gemfilePath} — falling through`);
    return null;
  }

  return RAILS_GEM.test(gemfile) ? 'bundle exec rails server' : null;
}
