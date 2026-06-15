import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  getDaemonStatePath,
  getShepLogsDir,
  getShepCheckpointsDir,
  getShepClustersDir,
} from '@/infrastructure/services/filesystem/shep-directory.service.js';

describe('shep-directory paths', () => {
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

  describe('getDaemonStatePath', () => {
    it('returns ~/.shep/daemon.json when SHEP_HOME is not set', () => {
      delete process.env.SHEP_HOME;
      const expected = join(homedir(), '.shep', 'daemon.json');
      expect(getDaemonStatePath()).toBe(expected);
    });

    it('returns SHEP_HOME/daemon.json when SHEP_HOME is set', () => {
      process.env.SHEP_HOME = '/tmp/test-shep-home';
      expect(getDaemonStatePath()).toBe(join('/tmp/test-shep-home', 'daemon.json'));
    });
  });

  describe('getShepLogsDir', () => {
    it('falls back to ~/.shep/logs when SHEP_HOME is not set', () => {
      delete process.env.SHEP_HOME;
      expect(getShepLogsDir()).toBe(join(homedir(), '.shep', 'logs'));
    });

    it('respects SHEP_HOME so instances do not share logs', () => {
      process.env.SHEP_HOME = '/tmp/test-shep-home';
      expect(getShepLogsDir()).toBe(join('/tmp/test-shep-home', 'logs'));
    });
  });

  describe('getShepCheckpointsDir', () => {
    it('falls back to ~/.shep/checkpoints when SHEP_HOME is not set', () => {
      delete process.env.SHEP_HOME;
      expect(getShepCheckpointsDir()).toBe(join(homedir(), '.shep', 'checkpoints'));
    });

    it('respects SHEP_HOME so instances do not share checkpoints', () => {
      process.env.SHEP_HOME = '/tmp/test-shep-home';
      expect(getShepCheckpointsDir()).toBe(join('/tmp/test-shep-home', 'checkpoints'));
    });
  });

  describe('getShepClustersDir', () => {
    it('falls back to ~/.shep/clusters when SHEP_HOME is not set', () => {
      delete process.env.SHEP_HOME;
      expect(getShepClustersDir()).toBe(join(homedir(), '.shep', 'clusters'));
    });

    it('respects SHEP_HOME so instances do not share kubeconfigs', () => {
      process.env.SHEP_HOME = '/tmp/test-shep-home';
      expect(getShepClustersDir()).toBe(join('/tmp/test-shep-home', 'clusters'));
    });
  });
});
