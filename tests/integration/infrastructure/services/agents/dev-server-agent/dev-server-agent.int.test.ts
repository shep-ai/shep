// @vitest-environment node

/**
 * Dev-server agent end-to-end integration — happy paths (spec 103, task-15).
 *
 * Real graph + real DeploymentService + real SQLite (in-memory, migrated) +
 * real child processes from fixture repos; ONLY the agent seams are stubbed.
 *
 * Scenarios covered here:
 * 1. Deterministic fast path — detection resolves the plan, the run reaches
 *    Ready with ZERO agent invocations (no executor.execute, no
 *    structuredCaller.call), and a Deterministic plan row is persisted.
 *    The one real `npm install` this exercises runs against an EMPTY
 *    dependency set — npm resolves nothing, so it never touches the network.
 * 2. Cached fast path — a fresh persisted plan short-circuits detection AND
 *    installation entirely (repeat-start production path).
 * 3. Agent path — detection fails (no package.json), the stubbed structured
 *    analysis supplies the command, the run reaches Ready via the run-plan
 *    override spawn, and an Agent plan row is persisted.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeploymentState, RunPlanSource } from '@/domain/generated/output.js';
import { computeInstallHash } from '@/infrastructure/services/deployment/config-hash.js';
import {
  createHarness,
  makeNodeFixture,
  nodeServerAnalysis,
  seedFreshRunPlan,
  uniqueTargetId,
  waitForState,
  waitForLogLine,
  SERVER_FILE,
  type DevServerAgentHarness,
} from './harness.js';

const TEST_TIMEOUT_MS = 60_000;
const TARGET_TYPE = 'repository';

describe('dev-server agent integration — deterministic and agent paths', () => {
  let harness: DevServerAgentHarness;
  let savedSkipRecovery: string | undefined;

  beforeEach(() => {
    savedSkipRecovery = process.env.SHEP_SKIP_RECOVERY;
    // Hygiene: no recovery pass in this test process may kill scenario
    // children. (Spawned fixture servers additionally get
    // SHEP_SKIP_RECOVERY=1 injected by the deployment spawner itself.)
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

  it(
    'deterministic fast path: first run reaches Ready with zero agent calls and persists a Deterministic plan',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      const fixture = harness.trackFixture(
        makeNodeFixture({ packageJson: 'dev-script', nodeModules: true })
      );
      const targetId = uniqueTargetId();

      const result = await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);
      expect(result.state).toBe(DeploymentState.Analyzing);

      const status = await waitForState(harness, targetId, DeploymentState.Ready);
      expect(status.url).toMatch(/^http:\/\/localhost:\d+$/);
      await waitForLogLine(harness, targetId, 'dev-server agent run succeeded');

      // ZERO agent invocations — the acceptance-critical fast-path pin.
      // (getExecutor itself IS called once per run: the service resolves the
      // remediation executor eagerly, which is a cheap local resolution, not
      // an agent call. The agent boundary is execute()/call().)
      expect(harness.executeSpy).not.toHaveBeenCalled();
      expect(harness.structuredCallSpy).not.toHaveBeenCalled();

      // Deterministic plan persisted with the detected npm command.
      const plan = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(plan).not.toBeNull();
      expect(plan!.source).toBe(RunPlanSource.Deterministic);
      expect(plan!.command).toBe('npm run dev');
      expect(plan!.packageManager).toBe('npm');

      // The real installer ran exactly once (empty deps — no network) and
      // the post-install hash was stamped onto the row.
      expect(harness.installSpy).toHaveBeenCalledExactlyOnceWith(
        fixture,
        'npm',
        expect.any(Function),
        expect.any(Number)
      );
      expect(plan!.installStampHash).toBe(computeInstallHash(fixture));
    }
  );

  it(
    'cached fast path: a fresh persisted plan reaches Ready with zero agent calls and zero installs',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      // No node_modules on purpose: the seeded plan has no packageManager,
      // so freshness is decided purely by the install-hash stamp.
      const fixture = harness.trackFixture(makeNodeFixture({ packageJson: 'dev-script' }));
      const seeded = await seedFreshRunPlan(harness, fixture);
      const targetId = uniqueTargetId();

      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);

      const status = await waitForState(harness, targetId, DeploymentState.Ready);
      expect(status.url).toMatch(/^http:\/\/localhost:\d+$/);
      await waitForLogLine(harness, targetId, 'run plan cache hit');
      await waitForLogLine(harness, targetId, 'dev-server agent run succeeded');

      // Cache hit = one DB read + spawn: no detection re-persist, no
      // installer run, no agent involvement.
      expect(harness.installSpy).not.toHaveBeenCalled();
      expect(harness.executeSpy).not.toHaveBeenCalled();
      expect(harness.structuredCallSpy).not.toHaveBeenCalled();

      // The cached row was reused as-is (no upsert rewrote it).
      const plan = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(plan!.updatedAt).toEqual(seeded.updatedAt);
      expect(plan!.command).toBe(`node ${SERVER_FILE}`);
    }
  );

  it(
    'agent path: failed detection falls back to the structured analysis and reaches Ready via the override spawn',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness({ analysis: nodeServerAnalysis() });
      // No package.json — deterministic detection must fail.
      const fixture = harness.trackFixture(makeNodeFixture({ packageJson: 'none' }));
      const targetId = uniqueTargetId();

      const result = await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);
      expect(result.state).toBe(DeploymentState.Analyzing);

      const status = await waitForState(harness, targetId, DeploymentState.Ready);
      expect(status.url).toMatch(/^http:\/\/localhost:\d+$/);
      await waitForLogLine(harness, targetId, 'dev-server agent run succeeded');

      // Exactly one structured analysis; no remediation executor run.
      expect(harness.structuredCallSpy).toHaveBeenCalledTimes(1);
      expect(harness.executeSpy).not.toHaveBeenCalled();

      // Agent plan persisted, cwd resolved from '.' to the repo root.
      const plan = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(plan).not.toBeNull();
      expect(plan!.source).toBe(RunPlanSource.Agent);
      expect(plan!.command).toBe(`node ${SERVER_FILE}`);
      expect(plan!.cwd).toBe(fixture);
      expect(plan!.language).toBe('node');

      // The security contract: the exact spawned command was logged
      // verbatim BEFORE the spawn.
      await waitForLogLine(harness, targetId, `starting dev server: node ${SERVER_FILE}`);
    }
  );
});
