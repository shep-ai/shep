// Finds the `shep` binary for this machine inside its per-platform npm package.

import process from 'node:process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BINARY_NAME, describeSupported, findPlatform, packageNameFor } from './platforms.mjs';

/** Set to run a specific `shep` binary instead of the installed one (development and tests). */
export const BINARY_PATH_ENV = 'SHEP_BINARY_PATH';

const OTHER_WAYS = [
  'Other ways to install shep:',
  '  curl -fsSL https://shep.bot/install | sh',
  '  brew install shep-ai/tap/shep',
].join('\n');

export class LaunchError extends Error {}

const require = createRequire(import.meta.url);

function defaultPackageDir(packageName) {
  return dirname(require.resolve(`${packageName}/package.json`));
}

/**
 * Returns the absolute path of the binary to run.
 * Throws LaunchError with a message meant for the user when there is none.
 */
export function resolveBinary({
  os = process.platform,
  cpu = process.arch,
  env = process.env,
  packageDir = defaultPackageDir,
} = {}) {
  const override = env[BINARY_PATH_ENV];
  if (override) {
    if (!existsSync(override)) {
      throw new LaunchError(
        `shep: ${BINARY_PATH_ENV} points at ${override}, which does not exist.`
      );
    }
    return override;
  }

  const platform = findPlatform(os, cpu);
  if (!platform) {
    const windows = os === 'win32' ? ' On Windows, run it inside WSL.' : '';
    throw new LaunchError(
      `shep: there is no build for ${os}-${cpu}. Supported: ${describeSupported()}.${windows}`
    );
  }

  const packageName = packageNameFor(platform);
  let dir;
  try {
    dir = packageDir(packageName);
  } catch {
    throw new LaunchError(
      [
        `shep: the binary package ${packageName} is not installed.`,
        'npm installs it alongside this package unless optional dependencies are turned off',
        '(--omit=optional, --no-optional). Reinstall with them on.',
        '',
        OTHER_WAYS,
      ].join('\n')
    );
  }

  const binary = join(dir, 'bin', BINARY_NAME);
  if (!existsSync(binary)) {
    throw new LaunchError(`shep: ${packageName} is installed but ${binary} is missing.`);
  }
  return binary;
}
