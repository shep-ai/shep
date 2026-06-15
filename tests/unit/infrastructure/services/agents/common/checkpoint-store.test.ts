import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CheckpointStore } from '@/infrastructure/services/agents/common/checkpoint-store.js';

describe('CheckpointStore', () => {
  let shepHome: string;
  let originalShepHome: string | undefined;

  beforeEach(() => {
    originalShepHome = process.env.SHEP_HOME;
    shepHome = mkdtempSync(join(tmpdir(), 'shep-ckpt-'));
    process.env.SHEP_HOME = shepHome;
  });

  afterEach(() => {
    if (originalShepHome === undefined) {
      delete process.env.SHEP_HOME;
    } else {
      process.env.SHEP_HOME = originalShepHome;
    }
    rmSync(shepHome, { recursive: true, force: true });
  });

  it('deletes the checkpoint file for a given checkpoint id under SHEP_HOME', async () => {
    const store = new CheckpointStore();
    const checkpointPath = join(shepHome, 'checkpoints', 'thread-1.db');
    mkdirSync(join(shepHome, 'checkpoints'), { recursive: true });
    writeFileSync(checkpointPath, 'state');
    expect(existsSync(checkpointPath)).toBe(true);

    await store.deleteCheckpoint('thread-1');

    expect(existsSync(checkpointPath)).toBe(false);
  });

  it('does not throw when the checkpoint file does not exist', async () => {
    const store = new CheckpointStore();
    await expect(store.deleteCheckpoint('missing-thread')).resolves.toBeUndefined();
  });
});
