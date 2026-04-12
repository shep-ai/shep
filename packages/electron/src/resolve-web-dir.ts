/**
 * Electron-specific Web Directory Resolver
 *
 * Resolves the path to the Next.js web UI bundle for Electron.
 * Handles two contexts:
 *
 * 1. **Packaged mode** (app.isPackaged = true):
 *    The web bundle is copied into the app's resources directory
 *    at build time. Path: process.resourcesPath + '/web/'
 *
 * 2. **Development mode** (app.isPackaged = false):
 *    Falls back to the monorepo source directory or the production
 *    web/ directory at the monorepo root (same logic as resolveWebDir()
 *    in web-server.service.ts but relative to packages/electron/).
 *
 * This module lives in packages/electron/ and does NOT modify the
 * existing resolveWebDir() in core. Electron-specific path logic
 * is fully isolated here.
 */

import path from 'node:path';
import type fs from 'node:fs';

export interface WebDirResult {
  /** Absolute path to the web UI directory */
  dir: string;
  /** Whether to run Next.js in development mode */
  dev: boolean;
}

export interface ResolveWebDirDeps {
  isPackaged: boolean;
  resourcesPath: string;
  existsSync: typeof fs.existsSync;
  /** Base directory for monorepo-relative resolution (defaults to import.meta.dirname) */
  basedir: string;
}

/**
 * Resolve the web UI directory for the Electron app.
 *
 * @param deps - Injectable dependencies for testability
 * @returns The web directory path and whether it's in dev mode
 * @throws Error if no web UI directory can be found
 */
export function resolveWebDirForElectron(deps: ResolveWebDirDeps): WebDirResult {
  const { isPackaged, resourcesPath, existsSync, basedir } = deps;

  // In a packaged Electron app, the web bundle is in the resources directory
  if (isPackaged) {
    const packagedDir = path.join(resourcesPath, 'web');
    if (existsSync(path.join(packagedDir, '.next'))) {
      return { dir: packagedDir, dev: false };
    }

    throw new Error(
      `Web UI directory not found in packaged app.\n` +
        `  Expected: ${packagedDir}/.next\n` +
        `  process.resourcesPath: ${resourcesPath}`
    );
  }

  // Development mode: resolve relative to packages/electron/src/ in the monorepo
  // From packages/electron/src/ → 3 levels up to monorepo root → src/presentation/web/
  const monorepoRoot = path.resolve(basedir, '../../..');
  const devDir = path.join(monorepoRoot, 'src', 'presentation', 'web');
  if (existsSync(path.join(devDir, 'next.config.ts'))) {
    return { dir: devDir, dev: true };
  }

  // Production build (pre-built web at monorepo root /web/)
  const prodDir = path.join(monorepoRoot, 'web');
  if (existsSync(path.join(prodDir, '.next'))) {
    return { dir: prodDir, dev: false };
  }

  throw new Error(
    `Web UI directory not found.\n` +
      `  Searched:\n` +
      `    dev:  ${devDir} (next.config.ts: ${existsSync(path.join(devDir, 'next.config.ts'))})\n` +
      `    prod: ${prodDir} (.next: ${existsSync(path.join(prodDir, '.next'))})\n` +
      `  basedir: ${basedir}`
  );
}
