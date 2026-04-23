/**
 * Template overlay helper.
 *
 * Copies every file under `infrastructure/templates/vite-shadcn-base/`
 * on top of an already-scaffolded project, preserving directory
 * structure. Existing files at the destination are OVERWRITTEN — the
 * template is authoritative (e.g. `src/index.css` from the template
 * replaces the one shadcn init wrote).
 *
 * The `.template-manifest.json` file is read first to pick up the
 * template version, which is returned to the caller so it can be
 * persisted on the Application row.
 *
 * Resolves the template root relative to THIS source file via
 * `import.meta.url` so the same code works both from `src/` during
 * dev (`pnpm dev:cli`) and from `dist/` after `tsc` build (shipped
 * as part of the published npm package).
 */

import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { readdir, stat, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

export interface TemplateOverlayResult {
  readonly templateFiles: readonly string[];
  readonly templateVersion: string;
}

interface TemplateManifest {
  name: string;
  version: string;
}

/**
 * Resolve the absolute path to the template root. We try several
 * well-known layouts in order because this module is consumed in
 * three distinct runtime layouts:
 *
 *  1. `src/` during `pnpm dev:cli` — file at
 *     `.../infrastructure/services/scaffolding/template-overlay.ts`,
 *     templates at `.../infrastructure/templates/vite-shadcn-base/`.
 *  2. `dist/` after `tsc` — same relative `../../templates/...` path.
 *  3. Bundled into Electron's `main.cjs` — `import.meta.url` resolves
 *     to the bundle at `packages/electron/dist/main.cjs`, so the
 *     original `../../templates/...` lookup lands in the wrong place.
 *     The Electron build copies templates next to the bundle, so we
 *     also check `${here}/templates/vite-shadcn-base/`.
 *
 * A `SHEP_TEMPLATE_ROOT` env var override takes precedence over both
 * for packaging flexibility and testing.
 */
function resolveTemplateRoot(): string {
  const envOverride = process.env.SHEP_TEMPLATE_ROOT;
  if (envOverride && existsSync(envOverride)) return envOverride;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // src/ and tsc dist layout
    resolve(here, '..', '..', 'templates', 'vite-shadcn-base'),
    // bundled layout — templates copied next to the bundle entry
    resolve(here, 'templates', 'vite-shadcn-base'),
    // bundled layout — templates copied into an infrastructure/ subtree
    resolve(here, 'infrastructure', 'templates', 'vite-shadcn-base'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall back to the first (original) path — applyTemplateOverlay
  // will throw a descriptive error naming this path.
  return candidates[0];
}

/**
 * Apply the fat-template overlay to `repositoryPath`. Overwrites
 * any files at colliding destinations — the template wins.
 *
 * The `.template-manifest.json` file is read for metadata only and
 * is NOT copied into the user's project.
 */
export async function applyTemplateOverlay(repositoryPath: string): Promise<TemplateOverlayResult> {
  const templateRoot = resolveTemplateRoot();
  if (!existsSync(templateRoot)) {
    throw new Error(
      `Template overlay failed: template root "${templateRoot}" does not exist. ` +
        `The build pipeline must copy "src/infrastructure/templates" alongside compiled output.`
    );
  }

  const manifestPath = join(templateRoot, '.template-manifest.json');
  let templateVersion = '';
  if (existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw) as TemplateManifest;
      templateVersion = manifest.version ?? '';
    } catch (err) {
      // Non-fatal — a corrupted manifest shouldn't block scaffolding.
      // eslint-disable-next-line no-console
      console.warn(
        `[template-overlay] failed to parse manifest at ${manifestPath}: ${String(err)}`
      );
    }
  }

  const copied: string[] = [];
  await walkAndCopy(templateRoot, templateRoot, repositoryPath, copied);

  return {
    templateFiles: copied,
    templateVersion,
  };
}

/**
 * Recursively walk `current` under `root` and copy each file into
 * `destRoot`, preserving the subtree. Skips the manifest file.
 *
 * Uses `fs/promises` so libuv offloads file I/O to the thread pool —
 * critical when this module runs inside Electron's main process,
 * where synchronous I/O on a large template tree blocks IPC long
 * enough to trigger the OS "not responding" watchdog.
 */
async function walkAndCopy(
  root: string,
  current: string,
  destRoot: string,
  collected: string[]
): Promise<void> {
  const entries = await readdir(current);
  for (const entry of entries) {
    const srcPath = join(current, entry);
    // Hidden manifest file is metadata, not content — don't ship it
    // into the user's project.
    if (current === root && entry === '.template-manifest.json') continue;

    const entryStat = await stat(srcPath);
    if (entryStat.isDirectory()) {
      await walkAndCopy(root, srcPath, destRoot, collected);
      continue;
    }
    if (!entryStat.isFile()) continue;

    const rel = relative(root, srcPath);
    const destPath = join(destRoot, rel);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFile(srcPath, destPath);
    collected.push(rel);
  }
}
