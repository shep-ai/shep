import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystemEvidenceWorkspace } from '@/infrastructure/services/harness-learning/file-system-evidence-workspace.js';

describe('FileSystemEvidenceWorkspace', () => {
  const workspace = new FileSystemEvidenceWorkspace();

  it('writes evidence and the harness under context/ and reads edits back', async () => {
    const root = await workspace.create(
      'inv1',
      { 'task.md': '# Task', 'run/signals.md': 'merged: no' },
      { 'guardrails.md': 'Run tests.' }
    );
    try {
      expect(readFileSync(join(root, 'context', 'task.md'), 'utf8')).toBe('# Task');
      expect(readFileSync(join(root, 'context', 'run', 'signals.md'), 'utf8')).toBe('merged: no');

      mkdirSync(join(root, 'context', 'harness', 'skills', 'db'), { recursive: true });
      writeFileSync(join(root, 'context', 'harness', 'skills', 'db', 'SKILL.md'), 'skill');
      writeFileSync(join(root, 'context', 'harness', 'notes.txt'), 'stray');
      mkdirSync(join(root, 'context', 'harness', '__pycache__'));
      writeFileSync(join(root, 'context', 'harness', '__pycache__', 'x.pyc'), 'noise');

      const { tree, rejected } = await workspace.readHarness(root);
      expect(tree).toEqual({ 'guardrails.md': 'Run tests.', 'skills/db/SKILL.md': 'skill' });
      expect(rejected).toEqual(['notes.txt']);
    } finally {
      await workspace.dispose(root);
    }
    expect(existsSync(root)).toBe(false);
  });

  it('reads a hand-written harness directory in the canonical layout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shep-harness-import-'));
    try {
      mkdirSync(join(dir, 'skills', 'db'), { recursive: true });
      writeFileSync(join(dir, 'skills', 'db', 'SKILL.md'), 'skill');
      writeFileSync(join(dir, 'guardrails.md'), 'Run tests.');
      writeFileSync(join(dir, 'README.txt'), 'stray');
      const { tree, rejected } = await workspace.readHarnessDirectory(dir);
      expect(tree).toEqual({ 'guardrails.md': 'Run tests.', 'skills/db/SKILL.md': 'skill' });
      expect(rejected).toEqual(['README.txt']);
      expect(await workspace.readHarnessDirectory(join(dir, 'missing'))).toEqual({
        tree: {},
        rejected: [],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never writes outside the workspace', async () => {
    const root = await workspace.create('x', { '../escape.md': 'no' }, { '../../out.md': 'no' });
    try {
      expect(existsSync(join(root, 'escape.md'))).toBe(false);
      expect((await workspace.readHarness(root)).tree).toEqual({});
    } finally {
      await workspace.dispose(root);
    }
  });

  it('refuses to dispose a directory it did not create', async () => {
    await expect(workspace.dispose(process.cwd())).resolves.toBeUndefined();
    expect(existsSync(process.cwd())).toBe(true);
  });
});
