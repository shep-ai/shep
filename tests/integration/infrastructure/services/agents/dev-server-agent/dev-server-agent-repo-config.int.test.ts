// @vitest-environment node

/**
 * Tier zero end-to-end — a committed `.shep/dev.json`.
 *
 * Real graph + real DeploymentService + real migrated SQLite + real child
 * processes; only the agent seams are stubbed, and here they must never be
 * touched at all.
 *
 * The file is read on EVERY start, ahead of the run-plan cache, and the row
 * it writes is a projection of it rather than a cache of it. That is what
 * these scenarios pin: it beats a fresh cached plan, an edit takes effect
 * with no invalidation step, the previous row's install stamp survives so
 * setup commands do not re-run, a malformed file costs nothing, and the same
 * file works in the next worktree — which is the whole reason the tier exists,
 * since run plans are keyed by on-disk path and shep creates a worktree per
 * feature.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeploymentState, RunPlanSource, DeploymentTargetType } from '@/domain/generated/output.js';
import { REPO_DEV_CONFIG_PATH } from '@/infrastructure/services/deployment/repo-dev-config-reader.js';
import {
  createHarness,
  makeNodeFixture,
  seedFreshRunPlan,
  uniqueTargetId,
  waitForState,
  waitForLogLine,
  SERVER_FILE,
  SERVER_JS_SOURCE,
  SETUP_JS_SOURCE,
  SETUP_MARKER_FILE,
  type DevServerAgentHarness,
} from './harness.js';

const TEST_TIMEOUT_MS = 60_000;
const TARGET_TYPE = DeploymentTargetType.Repository;

/** Second fixture server, so an edit to the config is observable. */
const OTHER_SERVER_FILE = 'other-server.js';

/**
 * The service's terminal log line. Scenarios that stop a server or start a
 * second one MUST wait for it first: the run is fire-and-track, so stopping
 * mid-flight is a verify failure, which routes to remediation and re-spawns.
 */
const RUN_SUCCEEDED = 'dev-server agent run succeeded';

describe('dev-server agent integration — committed .shep/dev.json (tier zero)', () => {
  let harness: DevServerAgentHarness;
  let savedSkipRecovery: string | undefined;

  beforeEach(() => {
    savedSkipRecovery = process.env.SHEP_SKIP_RECOVERY;
    process.env.SHEP_SKIP_RECOVERY = '1';
  });

  afterEach(async () => {
    await harness.cleanup();
    if (savedSkipRecovery === undefined) {
      delete process.env.SHEP_SKIP_RECOVERY;
    } else {
      process.env.SHEP_SKIP_RECOVERY = savedSkipRecovery;
    }
  });

  /** Write `.shep/dev.json` — `contents` may be a document or raw text. */
  function writeDevConfig(dir: string, contents: unknown): void {
    const filePath = join(dir, ...REPO_DEV_CONFIG_PATH.split('/'));
    mkdirSync(join(dir, '.shep'), { recursive: true });
    writeFileSync(filePath, typeof contents === 'string' ? contents : JSON.stringify(contents));
  }

  it(
    'outranks a FRESH cached plan and reaches Ready with zero agent calls',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      const fixture = harness.trackFixture(makeNodeFixture({ packageJson: 'dev-script' }));
      // A perfectly current cached plan the committed file must still beat.
      await seedFreshRunPlan(harness, fixture, { command: 'node never-run-this.js' });
      writeDevConfig(fixture, { command: `node ${SERVER_FILE}`, expectedPort: null });
      const targetId = uniqueTargetId();

      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);

      const status = await waitForState(harness, targetId, DeploymentState.Ready);
      expect(status.url).toMatch(/^http:\/\/localhost:\d+$/);
      await waitForLogLine(harness, targetId, 'Run plan tier: repo config');
      await waitForLogLine(harness, targetId, `starting dev server: node ${SERVER_FILE}`);
      await waitForLogLine(harness, targetId, RUN_SUCCEEDED);

      expect(harness.structuredCallSpy).not.toHaveBeenCalled();
      expect(harness.executeSpy).not.toHaveBeenCalled();

      const plan = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(plan?.source).toBe(RunPlanSource.Manual);
      expect(plan?.command).toBe(`node ${SERVER_FILE}`);
      expect(plan?.cwd).toBe(fixture);
    }
  );

  it(
    'an edit to the file changes the next start with no invalidation step',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      const fixture = harness.trackFixture(makeNodeFixture({ packageJson: 'dev-script' }));
      writeFileSync(join(fixture, OTHER_SERVER_FILE), SERVER_JS_SOURCE);
      writeDevConfig(fixture, { command: `node ${SERVER_FILE}` });
      const targetId = uniqueTargetId();

      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);
      await waitForState(harness, targetId, DeploymentState.Ready);
      await waitForLogLine(harness, targetId, RUN_SUCCEEDED);
      await harness.deploymentService.stop(targetId);

      // The user edits the committed file. Nothing clears any cache.
      writeDevConfig(fixture, { command: `node ${OTHER_SERVER_FILE}` });

      const secondTargetId = uniqueTargetId();
      await harness.service.startDevServer(secondTargetId, fixture, TARGET_TYPE);
      await waitForState(harness, secondTargetId, DeploymentState.Ready);
      await waitForLogLine(
        harness,
        secondTargetId,
        `starting dev server: node ${OTHER_SERVER_FILE}`
      );
      await waitForLogLine(harness, secondTargetId, RUN_SUCCEEDED);

      const plan = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(plan?.command).toBe(`node ${OTHER_SERVER_FILE}`);
      expect(plan?.source).toBe(RunPlanSource.Manual);
    }
  );

  it(
    'carries the install stamp forward so setup commands do not re-run',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      const fixture = harness.trackFixture(makeNodeFixture({ packageJson: 'dev-script' }));
      writeFileSync(join(fixture, 'setup.js'), SETUP_JS_SOURCE);
      writeDevConfig(fixture, {
        command: `node ${SERVER_FILE}`,
        setupCommands: ['node setup.js'],
      });

      const firstTargetId = uniqueTargetId();
      await harness.service.startDevServer(firstTargetId, fixture, TARGET_TYPE);
      await waitForState(harness, firstTargetId, DeploymentState.Ready);
      await waitForLogLine(harness, firstTargetId, RUN_SUCCEEDED);
      await harness.deploymentService.stop(firstTargetId);

      const markerPath = join(fixture, SETUP_MARKER_FILE);
      expect(existsSync(markerPath)).toBe(true);
      const stamped = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(stamped?.installStampHash).toBeTruthy();

      // Remove the proof, then start again: a carried-forward stamp means the
      // setup command is skipped and the marker is NOT recreated.
      rmSync(markerPath);
      const secondTargetId = uniqueTargetId();
      await harness.service.startDevServer(secondTargetId, fixture, TARGET_TYPE);
      await waitForState(harness, secondTargetId, DeploymentState.Ready);
      await waitForLogLine(harness, secondTargetId, RUN_SUCCEEDED);

      expect(existsSync(markerPath)).toBe(false);
      const reread = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(reread?.installStampHash).toBe(stamped?.installStampHash);
      expect(reread?.source).toBe(RunPlanSource.Manual);
    }
  );

  it(
    'a malformed file falls through to detection instead of crashing the graph',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      const fixture = harness.trackFixture(
        makeNodeFixture({ packageJson: 'dev-script', nodeModules: true })
      );
      writeDevConfig(fixture, '{ this is not valid json');
      const targetId = uniqueTargetId();

      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);

      await waitForState(harness, targetId, DeploymentState.Ready);
      await waitForLogLine(harness, targetId, 'Run plan tier: deterministic');
      await waitForLogLine(harness, targetId, RUN_SUCCEEDED);

      const plan = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(plan?.source).toBe(RunPlanSource.Deterministic);
      expect(plan?.command).toBe('npm run dev');
      expect(harness.structuredCallSpy).not.toHaveBeenCalled();
    }
  );

  it(
    'is honoured in a freshly created worktree, where a DB override would not be',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      const original = harness.trackFixture(makeNodeFixture({ packageJson: 'dev-script' }));
      writeDevConfig(original, { command: `node ${SERVER_FILE}` });

      // The next feature gets a new worktree — a different on-disk path, and
      // run plans are keyed by path, so nothing in the database applies to it.
      const worktree = harness.trackFixture(makeNodeFixture({ packageJson: 'dev-script' }));
      writeDevConfig(worktree, { command: `node ${SERVER_FILE}` });
      expect(await harness.runPlanRepository.findByRepoPath(worktree)).toBeNull();

      const targetId = uniqueTargetId();
      await harness.service.startDevServer(targetId, worktree, TARGET_TYPE);

      await waitForState(harness, targetId, DeploymentState.Ready);
      await waitForLogLine(harness, targetId, 'Run plan tier: repo config');
      await waitForLogLine(harness, targetId, RUN_SUCCEEDED);

      const plan = await harness.runPlanRepository.findByRepoPath(worktree);
      expect(plan?.source).toBe(RunPlanSource.Manual);
      expect(plan?.command).toBe(`node ${SERVER_FILE}`);
      expect(plan?.repoPath).toBe(worktree);
    }
  );
});
