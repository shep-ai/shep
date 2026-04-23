/* global console, process */
/**
 * Electron packaging driver.
 *
 * Why this exists: electron-builder packages the electron workspace
 * package's `node_modules/` as-is into the installer. pnpm's default
 * isolated layout stores transitive deps as symlinks under
 * `.pnpm/...`, which electron-builder does not follow correctly —
 * the packaged app's `node_modules/` silently lacks transitives
 * (e.g. `@ai-sdk/gateway`, a transitive of `ai`), and the app dies
 * at launch with `Cannot find module '...'`.
 *
 * The fix is to let pnpm itself produce a self-contained deployable
 * directory via `pnpm deploy --prod --legacy <dir>`, which walks the
 * full dependency graph and writes every transitive as a PHYSICAL
 * directory. This script then stages the compiled `dist/` + the
 * builder config into that deploy tree, and invokes `electron-builder`
 * against the staged root.
 *
 * Usage:
 *   node scripts/package.mjs <variant> <target>
 *     variant: 'full' | 'apps-only'
 *     target:  'mac' | 'win' | 'linux'
 */

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(electronRoot, '../..');

// On Windows, npm and npx ship as `.cmd` batch wrappers rather than
// native executables. Node 22 (CVE-2024-27980 mitigation) refuses to
// spawn `.cmd` / `.bat` via execFileSync without `shell: true`, so we
// opt in explicitly on Windows only. Arguments are fully controlled by
// this script (no user input reaches them), so shell injection is not
// a concern here.
const isWindows = process.platform === 'win32';
const npmBin = isWindows ? 'npm.cmd' : 'npm';
const npxBin = isWindows ? 'npx.cmd' : 'npx';
const spawnOpts = { stdio: 'inherit', shell: isWindows };

const [variant = 'full', target = 'linux'] = process.argv.slice(2);
if (!['full', 'apps-only'].includes(variant)) {
  console.error(`Unknown variant: ${variant} (expected 'full' or 'apps-only')`);
  process.exit(1);
}
if (!['mac', 'win', 'linux'].includes(target)) {
  console.error(`Unknown target: ${target} (expected 'mac' | 'win' | 'linux')`);
  process.exit(1);
}

const builderConfigSrc =
  variant === 'apps-only' ? 'electron-builder.apps-only.yml' : 'electron-builder.yml';
const outputDir = variant === 'apps-only' ? 'release-apps-only' : 'release';

// Staging root: `<electron>/staged-<variant>/`. Discarded and recreated
// on every packaging run so stale state from a prior variant / target
// can never leak into the build.
const stagedDir = path.join(electronRoot, `staged-${variant}`);
if (existsSync(stagedDir)) {
  console.log(`Removing stale staging dir ${stagedDir}`);
  rmSync(stagedDir, { recursive: true, force: true });
}
mkdirSync(stagedDir, { recursive: true });

// 1. Start by copying the electron package.json into the staged dir
//    and then run `npm install --omit=dev` there. We DO NOT use `pnpm
//    deploy` because electron-builder's node-module collector bails
//    with "no node modules found in collection" on pnpm's deploy
//    output and falls back to the monorepo root, producing an
//    incomplete asar missing transitive deps.
//
//    Plain `npm install` yields the vanilla flat `node_modules` tree
//    that electron-builder handles natively — every transitive
//    becomes a physical directory the builder packages verbatim.
console.log(`[stage:${variant}] copy package.json → staged`);
copyFileSync(path.join(electronRoot, 'package.json'), path.join(stagedDir, 'package.json'));

// A `.npmrc` inside the staged dir hides the monorepo's pnpm config
// (notably `node-linker=hoisted`) from `npm install`, so npm can run
// its normal resolver without being confused by pnpm-only keys.
writeFileSync(path.join(stagedDir, '.npmrc'), '# npm-only tree\n');

console.log(`[stage:${variant}] npm install --omit=dev (flat tree for electron-builder)`);
execFileSync(npmBin, ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], {
  ...spawnOpts,
  cwd: stagedDir,
});

// 2. Copy the compiled main-process bundle + resources into staged.
//    electron-builder reads `files:` / `extraResources:` relative to
//    the app directory, so these have to live under stagedDir.
const distSrc = path.join(electronRoot, 'dist');
const distDst = path.join(stagedDir, 'dist');
if (!existsSync(distSrc)) {
  console.error(
    `dist/ is missing at ${distSrc} — run \`pnpm compile${variant === 'apps-only' ? ':apps-only' : ''}\` first.`
  );
  process.exit(1);
}
console.log(`[stage:${variant}] copy dist → staged`);
cpSync(distSrc, distDst, { recursive: true });

const resourcesSrc = path.join(electronRoot, 'resources');
if (existsSync(resourcesSrc)) {
  console.log(`[stage:${variant}] copy resources → staged`);
  cpSync(resourcesSrc, path.join(stagedDir, 'resources'), { recursive: true });
}

// The pre-built Next.js web UI lives at `<monorepo>/web/` after
// `pnpm run build:release`. electron-builder `extraResources` references
// it from the app directory — inside the staged tree we want a LOCAL
// `./web` so the YAML does not need to know about the monorepo layout.
const webSrc = path.join(monorepoRoot, 'web');
if (existsSync(webSrc)) {
  console.log(`[stage:${variant}] copy web → staged`);
  cpSync(webSrc, path.join(stagedDir, 'web'), { recursive: true });
} else {
  console.warn(
    `[stage:${variant}] WARNING: ${webSrc} does not exist — ` +
      `run \`pnpm run build:release\` first. The packaged app will be missing the web UI.`
  );
}

// 3. Copy the electron-builder config and rename to the canonical file
//    so the `-c` flag is not required when invoking electron-builder
//    inside the staged dir.
const configSrc = path.join(electronRoot, builderConfigSrc);
const configDst = path.join(stagedDir, 'electron-builder.yml');
console.log(`[stage:${variant}] copy ${builderConfigSrc} → staged/electron-builder.yml`);
copyFileSync(configSrc, configDst);

// 4. Drop a pointer file in the staged package.json so readers
//    understand the tree is generated. `pnpm deploy` already wrote the
//    electron package's real package.json — we only amend it with the
//    staging marker and the correct output directory (so artifacts
//    land in `packages/electron/<release|release-apps-only>/`, not
//    inside the staged tree where they'd be thrown away next time).
const stagedPkgPath = path.join(stagedDir, 'package.json');
const stagedPkg = JSON.parse(readFileSync(stagedPkgPath, 'utf8'));
stagedPkg._shepStaged = { variant, target, stagedAt: new Date().toISOString() };
writeFileSync(stagedPkgPath, JSON.stringify(stagedPkg, null, 2));

// 5. Run electron-builder from the staged dir. We pass `--<target>`
//    and rely on the staged electron-builder.yml for everything else.
//    The output directory is set absolutely so artifacts land next to
//    the source tree (not inside stagedDir, which is ephemeral).
const outputAbs = path.join(electronRoot, outputDir);
console.log(`[build:${variant}] electron-builder --${target} (output → ${outputAbs})`);
execFileSync(
  npxBin,
  [
    'electron-builder',
    `--${target}`,
    '--publish',
    'never',
    '--config.directories.output',
    outputAbs,
  ],
  { ...spawnOpts, cwd: stagedDir }
);

console.log(`Electron ${variant} ${target} build complete → ${outputAbs}`);
