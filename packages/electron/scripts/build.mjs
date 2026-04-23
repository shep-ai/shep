/* global console, process */
/**
 * Build script for Electron main process.
 *
 * Bundles the Electron source code AND @shepai/core source into dist/.
 * Third-party packages (next, better-sqlite3, tsyringe, etc.) are
 * externalized — they're resolved at runtime from node_modules.
 *
 * This approach is needed because @shepai/core exports raw .ts files
 * that can't be consumed at runtime without a TypeScript compiler.
 */

import { build } from 'esbuild';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Recursively copy a directory tree. Used to stage runtime assets
 * (templates, etc.) alongside the bundled Electron main entry so that
 * modules bundled from `@shepai/core` which resolve data directories
 * via `import.meta.url` can locate them at runtime.
 */
function copyDirSync(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    const st = statSync(s);
    if (st.isDirectory()) copyDirSync(s, d);
    else if (st.isFile()) copyFileSync(s, d);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(root, '../..');
const coreDir = path.join(root, '..', 'core', 'src');

/**
 * Collect all third-party dependencies that should be external.
 * These come from the root package.json dependencies (where next,
 * better-sqlite3, tsyringe etc. live) and the electron package.json.
 */
function collectExternalDeps() {
  const externals = new Set(['electron']);

  // Root package.json dependencies
  const rootPkg = JSON.parse(readFileSync(path.join(monorepoRoot, 'package.json'), 'utf8'));
  for (const dep of Object.keys(rootPkg.dependencies || {})) {
    externals.add(dep);
  }

  // Electron package.json dependencies (runtime)
  const electronPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const dep of Object.keys(electronPkg.dependencies || {})) {
    if (dep !== '@shepai/core') externals.add(dep);
  }
  for (const dep of Object.keys(electronPkg.devDependencies || {})) {
    externals.add(dep);
  }

  // Core package.json dependencies
  const corePkg = JSON.parse(readFileSync(path.join(root, '..', 'core', 'package.json'), 'utf8'));
  for (const dep of Object.keys(corePkg.dependencies || {})) {
    externals.add(dep);
  }

  return [...externals];
}

async function main() {
  const distDir = path.join(root, 'dist');
  const externals = collectExternalDeps();

  console.log(`Externalizing ${externals.length} packages`);

  // Build main process entry point
  // Bundles: electron src + @shepai/core src (TypeScript → JS)
  // External: all node_modules packages (resolved at runtime)
  await build({
    entryPoints: [path.join(root, 'src/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    // CJS output: Electron's main process runs the entry synchronously,
    // and tsyringe checks for the reflect-metadata polyfill at CJS load
    // time. ESM linking would load tsyringe before any inline shim has a
    // chance to install the polyfill, and an `import('./main.js')` from
    // a CJS shim breaks app.whenReady() because Electron emits `ready`
    // before the dynamic import has actually entered startApp(). CJS
    // sidesteps both issues — entry.cjs `require`s reflect-metadata
    // first, then `require`s this bundle synchronously.
    format: 'cjs',
    // Emit .cjs so Node treats this file as CommonJS even though the
    // package.json declares "type": "module" (preload.js stays ESM).
    outExtension: { '.js': '.cjs' },
    outdir: distDir,
    external: externals,
    sourcemap: true,
    alias: {
      '@shepai/core': coreDir,
    },
    resolveExtensions: ['.ts', '.js', '.mjs', '.json'],
    // import.meta is unavailable in CJS, so map dirname/filename to the
    // CJS equivalents and define `import.meta.url` to a banner-provided
    // identifier so the bundled @shepai/core modules that use
    // fileURLToPath(import.meta.url) keep working at runtime.
    define: {
      'import.meta.dirname': '__dirname',
      'import.meta.filename': '__filename',
      'import.meta.url': '__shep_import_meta_url',
    },
    banner: {
      js: [
        '// Built by esbuild for Electron main process (CJS)',
        // Compute once for the entire bundled file. All bundled modules
        // share this single __filename, so a single value is correct.
        'const __shep_import_meta_url = require("url").pathToFileURL(__filename).href;',
      ].join('\n'),
    },
    logLevel: 'info',
  });

  // Build preload script separately (runs in isolated renderer context).
  //
  // IMPORTANT: CJS format. Electron's preload loader attaches the
  // contextBridge at document_start for CJS preloads; ESM preloads have
  // observable races where the bridge isn't on `window` by the time
  // React mounts in the renderer. Using CJS also avoids the
  // sandbox-incompatibility issues with ESM preloads. The preload
  // `require`s 'electron' synchronously, which is valid in this
  // context.
  await build({
    entryPoints: [path.join(root, 'src/preload.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    outdir: distDir,
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
  });

  // Copy splash.html to dist/
  const splashSrc = path.join(root, 'src', 'splash.html');
  const splashDst = path.join(distDir, 'splash.html');
  if (existsSync(splashSrc)) {
    copyFileSync(splashSrc, splashDst);
    console.log('Copied splash.html to dist/');
  }

  // Copy CJS entry shim to dist/. This is the file Electron loads first
  // (per package.json `main`); it requires reflect-metadata synchronously
  // before dynamically importing the ESM main bundle. See entry.cjs for
  // the full rationale.
  const entrySrc = path.join(root, 'src', 'entry.cjs');
  const entryDst = path.join(distDir, 'entry.cjs');
  if (existsSync(entrySrc)) {
    copyFileSync(entrySrc, entryDst);
    console.log('Copied entry.cjs to dist/');
  }

  // Compile each SQLite migration .ts file into dist/migrations/*.js
  // alongside the main bundle. `getMigrationsDir()` in the core package
  // resolves the directory as a sibling of the compiled file via
  // `import.meta.url` — in the Electron bundle that lands on
  // `dist/main.cjs`, so the runtime discovery looks for
  // `dist/migrations/`. Node 22 can't `import('./foo.ts')` so we pre-
  // compile each file to CJS .js. Without this, migrations 035+
  // (including the workflow_steps table) never run and startup crashes
  // the first time a fresh SHEP_HOME is used.
  const migrationsSrc = path.join(coreDir, 'infrastructure', 'persistence', 'sqlite', 'migrations');
  const migrationsDst = path.join(distDir, 'migrations');
  if (existsSync(migrationsSrc)) {
    const entries = readdirSync(migrationsSrc)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
      .map((f) => path.join(migrationsSrc, f));
    if (entries.length > 0) {
      await build({
        entryPoints: entries,
        bundle: false, // one-file-in/one-file-out — no bundling
        platform: 'node',
        target: 'node22',
        format: 'cjs',
        outdir: migrationsDst,
        sourcemap: true,
        logLevel: 'info',
      });
      // Electron's package.json declares "type": "module", so Node
      // treats plain .js files as ESM and refuses `module.exports`.
      // Drop a directory-local package.json that pins CJS for every
      // .js file in dist/migrations/ — overrides the parent without
      // changing migration file extensions (keeping the discovery
      // logic in core untouched).
      writeFileSync(
        path.join(migrationsDst, 'package.json'),
        JSON.stringify({ type: 'commonjs' }, null, 2)
      );
      console.log(`Compiled ${entries.length} migrations to dist/migrations/`);
    }
  }

  // Copy scaffolding templates next to the bundle. The template-overlay
  // resolver (bundled into main.cjs) falls back to `${here}/templates/
  // vite-shadcn-base` when its default lookup fails, so placing the
  // tree at `dist/templates/` is enough for the bundled runtime to
  // find it. Without this, creating a new Application fails with:
  // `Template overlay failed: template root ".../packages/templates/
  // vite-shadcn-base" does not exist.`
  const templatesSrc = path.join(coreDir, 'infrastructure', 'templates');
  const templatesDst = path.join(distDir, 'templates');
  if (existsSync(templatesSrc)) {
    copyDirSync(templatesSrc, templatesDst);
    console.log('Copied scaffolding templates to dist/templates/');
  }

  console.log('Electron build complete.');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
