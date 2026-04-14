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
import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
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
 * Resolve the absolute path to the template root relative to THIS
 * compiled file. In `dist/` the file sits at
 * `dist/infrastructure/services/scaffolding/template-overlay.js` and
 * the templates sit at `dist/infrastructure/templates/vite-shadcn-base/`,
 * so the relative path `../../templates/vite-shadcn-base` is stable
 * across dev (`src/`) and prod (`dist/`) as long as the prebuild copies
 * the template directory alongside the compiled `.js` files.
 */
function resolveTemplateRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'templates', 'vite-shadcn-base');
}

/**
 * Apply the fat-template overlay to `repositoryPath`. Overwrites
 * any files at colliding destinations — the template wins.
 *
 * The `.template-manifest.json` file is read for metadata only and
 * is NOT copied into the user's project.
 */
export function applyTemplateOverlay(repositoryPath: string): TemplateOverlayResult {
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
  walkAndCopy(templateRoot, templateRoot, repositoryPath, copied);

  return {
    templateFiles: copied,
    templateVersion,
  };
}

/**
 * Recursively walk `current` under `root` and copy each file into
 * `destRoot`, preserving the subtree. Skips the manifest file.
 */
function walkAndCopy(root: string, current: string, destRoot: string, collected: string[]): void {
  const entries = readdirSync(current);
  for (const entry of entries) {
    const srcPath = join(current, entry);
    // Hidden manifest file is metadata, not content — don't ship it
    // into the user's project.
    if (current === root && entry === '.template-manifest.json') continue;

    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      walkAndCopy(root, srcPath, destRoot, collected);
      continue;
    }
    if (!stat.isFile()) continue;

    const rel = relative(root, srcPath);
    const destPath = join(destRoot, rel);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
    collected.push(rel);
  }
}
