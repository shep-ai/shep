import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Provide fallback env vars for standalone dev mode (pnpm dev:web).
 * When run via `shep ui`, these are already set by the CLI's setVersionEnvVars()
 * before Next.js starts, so this returns an empty object.
 */
function loadDevFallbacks(): Record<string, string> {
  if (process.env.NEXT_PUBLIC_SHEP_VERSION) {
    return {};
  }

  try {
    // Web package is at src/presentation/web/, root package.json is 3 levels up
    const rootPkgPath = resolve(import.meta.dirname, '../../../package.json');
    const pkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8')) as Record<string, string>;
    let branch = '';
    let commitHash = '';
    try {
      const isWin = process.platform === 'win32';
      const syncOpts = isWin
        ? { encoding: 'utf-8' as const, windowsHide: true }
        : { encoding: 'utf-8' as const };
      branch = execSync('git rev-parse --abbrev-ref HEAD', syncOpts).trim();
      commitHash = execSync('git rev-parse HEAD', syncOpts).trim();
    } catch {
      // Not in a git repo
    }

    return {
      NEXT_PUBLIC_SHEP_VERSION: pkg.version ?? 'unknown',
      NEXT_PUBLIC_SHEP_PACKAGE_NAME: pkg.name ?? '@shepai/cli',
      NEXT_PUBLIC_SHEP_DESCRIPTION: pkg.description ?? 'Autonomous AI Native SDLC Platform',
      NEXT_PUBLIC_SHEP_BRANCH: branch,
      NEXT_PUBLIC_SHEP_COMMIT: commitHash,
      NEXT_PUBLIC_SHEP_INSTANCE_PATH: process.cwd(),
    };
  } catch {
    return {
      NEXT_PUBLIC_SHEP_VERSION: 'unknown',
      NEXT_PUBLIC_SHEP_PACKAGE_NAME: '@shepai/cli',
      NEXT_PUBLIC_SHEP_DESCRIPTION: 'Autonomous AI Native SDLC Platform',
    };
  }
}

const nextConfig: NextConfig = {
  // Prefix all static asset URLs so a reverse proxy can forward them
  // without ambiguity. Unset locally (assets served at /_next/…); set to
  // '/cli' in the org-runner image so the shep-cloud proxy can route
  // /cli/_next/… → the pod's /_next/… without namespace collision with
  // the cloud app's own /_next/… files.
  assetPrefix: process.env.NEXT_ASSET_PREFIX,

  // Pin turbopack root to the monorepo root so it doesn't infer a wrong
  // workspace root from unrelated lockfiles higher in the filesystem.
  turbopack: {
    root: resolve(import.meta.dirname, '../../..'),
  },

  // Hide the dev-mode "compiling / N issues" badge in the bottom-right
  // corner. Shep's own UI uses that corner for the application FAB and
  // workflow tracker, so the Next.js indicator just gets in the way.
  // No effect in production builds.
  devIndicators: false,

  // Exclude native/DI packages and Node.js builtins from Next.js bundling.
  // Without this, Turbopack statically evaluates os.platform() at build time
  // and tree-shakes platform-conditional branches (e.g., open-shell.ts).
  serverExternalPackages: [
    'tsyringe',
    'reflect-metadata',
    'better-sqlite3',
    'node-pty',
    'node:os',
    'node:child_process',
    'node:fs',
  ],

  // Enable typed routes (moved from experimental in Next.js 16)
  typedRoutes: true,

  // Configure the output directory
  distDir: '.next',

  // Produce a self-contained production server under
  // `.next/standalone/`. Required for the Electron packaged app: when
  // the web UI ships inside `resources/web/` (outside `app.asar`),
  // Turbopack-compiled chunks emit `require('next/dist/compiled/...')`
  // calls that can't resolve the `next` package across the asar
  // boundary. `standalone` bundles every runtime dep into
  // `.next/standalone/node_modules/`, sibling to the server entry, so
  // the walks work from any caller. In dev (`pnpm dev:web` / `shep ui`)
  // the standalone output is simply ignored — Next still serves from
  // `.next/` directly.
  output: 'standalone',

  // Inject version info from package.json for the web UI
  env: loadDevFallbacks(),

  // Allow attachment uploads up to 11 MB (10 MB limit + multipart overhead)
  experimental: {
    serverActions: {
      bodySizeLimit: '11mb',
    },
  },
};

export default nextConfig;
