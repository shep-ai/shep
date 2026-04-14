/**
 * Unit tests for `flattenSingleChildProject`.
 *
 * The helper runs deterministic `fs.renameSync` calls against a real
 * tmp directory — mocking `node:fs` would be more brittle than just
 * creating a temp tree, validating the post-state, and tearing it
 * down.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { flattenSingleChildProject } from '@/infrastructure/services/scaffolding/flatten-subdirectory.js';

describe('flattenSingleChildProject', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'shep-flatten-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flattens a single-child scaffold so package.json ends up at the root', () => {
    // Simulate shadcn creating `root/my-app/` with a typical project tree
    const child = join(root, 'my-app');
    mkdirSync(child);
    writeFileSync(join(child, 'package.json'), '{"name":"my-app"}');
    writeFileSync(join(child, 'vite.config.ts'), 'export default {}');
    mkdirSync(join(child, 'src'));
    writeFileSync(join(child, 'src', 'main.tsx'), 'console.log("hi")');

    const result = flattenSingleChildProject(root);

    expect(result.flattened).toBe(true);
    expect(result.childName).toBe('my-app');
    expect(existsSync(join(root, 'package.json'))).toBe(true);
    expect(readFileSync(join(root, 'package.json'), 'utf-8')).toBe('{"name":"my-app"}');
    expect(existsSync(join(root, 'vite.config.ts'))).toBe(true);
    expect(existsSync(join(root, 'src', 'main.tsx'))).toBe(true);
    // The child shell must be removed
    expect(existsSync(child)).toBe(false);
  });

  it('also moves dotfiles like .gitignore and .env.example up', () => {
    const child = join(root, 'my-app');
    mkdirSync(child);
    writeFileSync(join(child, 'package.json'), '{}');
    writeFileSync(join(child, '.gitignore'), 'node_modules\n');
    writeFileSync(join(child, '.env.example'), 'FOO=bar\n');

    flattenSingleChildProject(root);

    expect(existsSync(join(root, '.gitignore'))).toBe(true);
    expect(existsSync(join(root, '.env.example'))).toBe(true);
    expect(readFileSync(join(root, '.gitignore'), 'utf-8')).toBe('node_modules\n');
  });

  it('is a no-op when package.json is already at the root', () => {
    writeFileSync(join(root, 'package.json'), '{"name":"already-flat"}');
    writeFileSync(join(root, 'vite.config.ts'), '');

    const result = flattenSingleChildProject(root);

    expect(result.flattened).toBe(false);
    expect(result.childName).toBeNull();
    // Nothing was moved or deleted
    expect(readFileSync(join(root, 'package.json'), 'utf-8')).toBe('{"name":"already-flat"}');
    expect(existsSync(join(root, 'vite.config.ts'))).toBe(true);
  });

  it('throws with a clear message when no package.json is found anywhere', () => {
    // Empty-ish tree with no package.json
    mkdirSync(join(root, 'random'));

    expect(() => flattenSingleChildProject(root)).toThrow(
      /no package.json found at .* or in any immediate child/
    );
  });

  it('throws when more than one candidate child contains package.json', () => {
    const childA = join(root, 'app-a');
    const childB = join(root, 'app-b');
    mkdirSync(childA);
    mkdirSync(childB);
    writeFileSync(join(childA, 'package.json'), '{}');
    writeFileSync(join(childB, 'package.json'), '{}');

    expect(() => flattenSingleChildProject(root)).toThrow(
      /multiple candidate child directories contain package.json/
    );
  });

  it('throws when a destination collision would silently overwrite existing files', () => {
    // An existing file at the parent with the same name as one inside
    // the child — indicates an unexpected layout. Fail loudly.
    const child = join(root, 'my-app');
    mkdirSync(child);
    writeFileSync(join(child, 'package.json'), '{"from":"child"}');
    writeFileSync(join(root, 'package.json'), '{"from":"parent"}');

    // Parent already has package.json → early return as "already flat"
    // means we MUST NOT clobber the child. This is the no-op branch.
    const result = flattenSingleChildProject(root);
    expect(result.flattened).toBe(false);
    expect(readFileSync(join(root, 'package.json'), 'utf-8')).toBe('{"from":"parent"}');
  });

  it('ignores non-directory entries at the parent when searching for the child', () => {
    // Simulate a stray file at the parent that shadcn didn't create.
    writeFileSync(join(root, 'SHEP_BRIEF_HINT.txt'), 'ignore me');
    const child = join(root, 'my-app');
    mkdirSync(child);
    writeFileSync(join(child, 'package.json'), '{}');
    writeFileSync(join(child, 'index.html'), '<html></html>');

    const result = flattenSingleChildProject(root);

    expect(result.flattened).toBe(true);
    expect(existsSync(join(root, 'index.html'))).toBe(true);
    // The stray sibling is preserved
    expect(existsSync(join(root, 'SHEP_BRIEF_HINT.txt'))).toBe(true);
  });
});
