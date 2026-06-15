import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  getCheckpointPath,
  getClusterCheckpointPath,
} from '@/infrastructure/services/agents/common/checkpointer.js';

describe('checkpoint path resolution', () => {
  let originalShepHome: string | undefined;

  beforeEach(() => {
    originalShepHome = process.env.SHEP_HOME;
  });

  afterEach(() => {
    if (originalShepHome === undefined) {
      delete process.env.SHEP_HOME;
    } else {
      process.env.SHEP_HOME = originalShepHome;
    }
  });

  describe('getCheckpointPath', () => {
    it('falls back to ~/.shep/checkpoints when SHEP_HOME is not set', () => {
      delete process.env.SHEP_HOME;
      expect(getCheckpointPath('thread-1')).toBe(
        join(homedir(), '.shep', 'checkpoints', 'thread-1.db')
      );
    });

    it('respects SHEP_HOME so tenants do not share checkpoint state', () => {
      process.env.SHEP_HOME = '/tmp/test-shep-home';
      expect(getCheckpointPath('thread-1')).toBe(
        join('/tmp/test-shep-home', 'checkpoints', 'thread-1.db')
      );
    });
  });

  describe('getClusterCheckpointPath', () => {
    it('prefixes cluster- and respects SHEP_HOME', () => {
      process.env.SHEP_HOME = '/tmp/test-shep-home';
      expect(getClusterCheckpointPath('thread-1')).toBe(
        join('/tmp/test-shep-home', 'checkpoints', 'cluster-thread-1.db')
      );
    });
  });
});
