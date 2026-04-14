/**
 * Unit tests for `applyTemplateOverlay`.
 *
 * These tests run against the REAL template directory shipped under
 * `packages/core/src/infrastructure/templates/vite-shadcn-base/`, so
 * if a file is renamed or removed the tests break loudly — exactly
 * what we want for template assets where the "API" is the on-disk
 * layout.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyTemplateOverlay } from '@/infrastructure/services/scaffolding/template-overlay.js';

describe('applyTemplateOverlay', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'shep-overlay-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('copies the fat template into an empty project root', () => {
    const result = applyTemplateOverlay(root);

    // Sanity check a representative file from each layer of the template:
    //  - docs
    //  - src/lib helper
    //  - src/components/common primitive
    //  - src/types
    expect(existsSync(join(root, 'TEMPLATE.md'))).toBe(true);
    expect(existsSync(join(root, 'src', 'lib', 'theme.ts'))).toBe(true);
    expect(existsSync(join(root, 'src', 'lib', 'format.ts'))).toBe(true);
    expect(existsSync(join(root, 'src', 'lib', 'mock.ts'))).toBe(true);
    expect(existsSync(join(root, 'src', 'components', 'common', 'Avatar.tsx'))).toBe(true);
    expect(existsSync(join(root, 'src', 'components', 'common', 'index.ts'))).toBe(true);
    expect(existsSync(join(root, 'src', 'types', 'common.ts'))).toBe(true);

    // The manifest is metadata — it must NOT ship into the user's project.
    expect(existsSync(join(root, '.template-manifest.json'))).toBe(false);

    // templateVersion should be picked up from the manifest.
    expect(result.templateVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.templateFiles.length).toBeGreaterThan(5);
    expect(result.templateFiles).toContain('TEMPLATE.md');
    expect(result.templateFiles).toContain(join('src', 'lib', 'theme.ts'));
  });

  it('overwrites a pre-existing file at the destination (template wins)', () => {
    // Pretend shadcn init wrote a stub TEMPLATE.md already — our
    // template version must replace it.
    writeFileSync(join(root, 'TEMPLATE.md'), 'STUB FROM SHADCN');

    applyTemplateOverlay(root);

    const content = readFileSync(join(root, 'TEMPLATE.md'), 'utf-8');
    expect(content).not.toBe('STUB FROM SHADCN');
    expect(content).toContain('Shep template cheat sheet');
  });

  it('preserves files that live OUTSIDE the template tree', () => {
    // Simulate shadcn output: package.json, vite.config.ts, src/main.tsx.
    // The overlay must not touch these.
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'package.json'), '{"name":"user-app"}');
    writeFileSync(join(root, 'vite.config.ts'), 'export default {}');
    writeFileSync(join(root, 'src', 'main.tsx'), 'console.log("hi")');

    applyTemplateOverlay(root);

    // Untouched by the overlay:
    expect(readFileSync(join(root, 'package.json'), 'utf-8')).toBe('{"name":"user-app"}');
    expect(readFileSync(join(root, 'vite.config.ts'), 'utf-8')).toBe('export default {}');
    expect(readFileSync(join(root, 'src', 'main.tsx'), 'utf-8')).toBe('console.log("hi")');
    // Overlay files were still added:
    expect(existsSync(join(root, 'src', 'components', 'common', 'Avatar.tsx'))).toBe(true);
  });
});
