/**
 * Resolves the Electron runtime version the packaged app should ship.
 *
 * The staged packaging tree is installed with `--omit=dev`, so electron-builder
 * cannot detect Electron from the `electron` devDependency there. Instead of
 * pinning a version in the builder YAML (which drifted from package.json on
 * every upgrade), package.mjs reads the version installed in the workspace and
 * passes it on the command line.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * @param {string} packageRoot Directory whose `node_modules` holds `electron`.
 * @returns {string} The installed Electron version, e.g. `44.9.3`.
 */
export function resolveInstalledElectronVersion(packageRoot) {
  // Read the package's own link only. Module resolution would also search parent and
  // global folders, which could pick up an unrelated Electron.
  const manifestPath = path.join(packageRoot, 'node_modules', 'electron', 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `electron is not installed under ${packageRoot}; run \`pnpm install\` before packaging.`
    );
  }
  const { version } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof version !== 'string' || !RELEASE_VERSION.test(version)) {
    throw new Error(`${manifestPath} has "${version}", which is not a valid Electron version.`);
  }
  return version;
}
