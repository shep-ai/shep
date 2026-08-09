/**
 * Evidence file resolution — REAL filesystem, no `stat` mock.
 *
 * evidence-output-parser.test.ts mocks `node:fs/promises` wholesale, which is
 * exactly what hid the defect these tests pin: `validateFileExistence` passed a
 * repo-relative `relativePath` straight to `stat()`, so Node resolved it against
 * the host daemon's `process.cwd()` rather than the worktree the agent wrote to.
 * Every committed evidence file then reported "Evidence file not found", burning
 * all evidence retries.
 *
 * These tests deliberately run with `process.cwd()` pointed somewhere OTHER than
 * the directory holding the files, so a resolution regression fails here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  validateFileExistence,
  validateEvidence,
} from '../../../../../../../packages/core/src/infrastructure/services/agents/feature-agent/nodes/evidence-output-parser.js';
import {
  EvidenceType,
  type Evidence,
} from '../../../../../../../packages/core/src/domain/generated/output.js';

const EVIDENCE_REL_DIR = 'specs/108-dev-server-auto-start/evidence';

describe('evidence file resolution (real filesystem)', () => {
  let worktree: string;
  let elsewhere: string;

  /** Build an evidence record pointing at a repo-relative path. */
  const record = (relativePath: string, description = 'proof'): Evidence => ({
    type: EvidenceType.Screenshot,
    capturedAt: '2026-08-09T12:00:00Z',
    description,
    relativePath,
  });

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'evidence-resolution-'));
    worktree = join(root, 'wt', 'feat-branch');
    elsewhere = join(root, 'elsewhere');
    await mkdir(join(worktree, EVIDENCE_REL_DIR), { recursive: true });
    await mkdir(elsewhere, { recursive: true });
    await writeFile(join(worktree, EVIDENCE_REL_DIR, 'shot.png'), 'not-really-a-png');
  });

  afterEach(async () => {
    // worktree and elsewhere share a parent mkdtemp root
    await rm(resolve(worktree, '..', '..'), { recursive: true, force: true });
  });

  it('resolves a repo-relative path against baseDir, not process.cwd()', async () => {
    const evidence = [record(`${EVIDENCE_REL_DIR}/shot.png`)];

    // process.cwd() is the test runner's cwd — emphatically NOT the worktree.
    expect(process.cwd()).not.toBe(worktree);

    const errors = await validateFileExistence(evidence, worktree);
    expect(errors).toEqual([]);
  });

  it('still reports a genuinely missing file under baseDir', async () => {
    const evidence = [record(`${EVIDENCE_REL_DIR}/nope.png`, 'absent')];

    const errors = await validateFileExistence(evidence, worktree);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not found');
    // The message keeps the agent-facing relative path so retry feedback is actionable.
    expect(errors[0]).toContain(`${EVIDENCE_REL_DIR}/nope.png`);
  });

  it('does not find the file when baseDir points at the wrong directory', async () => {
    const evidence = [record(`${EVIDENCE_REL_DIR}/shot.png`)];

    const errors = await validateFileExistence(evidence, elsewhere);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not found');
  });

  it('honours an absolute relativePath regardless of baseDir', async () => {
    // commitEvidence:false tells the agent to write absolute ~/.shep paths.
    const absolute = join(worktree, EVIDENCE_REL_DIR, 'shot.png');
    const evidence = [record(absolute)];

    const errors = await validateFileExistence(evidence, elsewhere);
    expect(errors).toEqual([]);
  });

  it('reports a zero-byte file under baseDir as empty, not missing', async () => {
    await writeFile(join(worktree, EVIDENCE_REL_DIR, 'empty.txt'), '');
    const evidence = [record(`${EVIDENCE_REL_DIR}/empty.txt`, 'empty output')];

    const errors = await validateFileExistence(evidence, worktree);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('zero size');
  });

  it('falls back to process.cwd() when no baseDir is supplied', async () => {
    // Backward compatibility: existing callers passing no baseDir keep working.
    const evidence = [record(`${EVIDENCE_REL_DIR}/shot.png`)];

    const errors = await validateFileExistence(evidence);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not found');
  });

  it('threads baseDir through the full validateEvidence pipeline', async () => {
    const evidence = [record(`${EVIDENCE_REL_DIR}/shot.png`)];

    const result = await validateEvidence(evidence, [], worktree);

    expect(result.errors.filter((e) => e.type === 'fileExistence')).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
