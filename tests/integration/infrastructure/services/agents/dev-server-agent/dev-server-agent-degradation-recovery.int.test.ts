// @vitest-environment node

/**
 * Dev-server agent end-to-end integration — degradation + recovery
 * (spec 103, task-15).
 *
 * Real graph + real DeploymentService + real SQLite + real child processes;
 * ONLY the agent seams are stubbed (here: absent entirely).
 *
 * Scenarios covered here:
 * 7. Degradation — with NO executor provider and NO structured caller:
 *    (a) a repo the deterministic detector can resolve still reaches Ready;
 *    (b) a repo it cannot resolve terminates Stopped with an actionable
 *        failure line that stays readable after the run.
 * 8. recoverAll interplay — a graph-started Ready server is re-adopted by a
 *    SECOND DeploymentService sharing the same SQLite database (simulated
 *    process restart), keeping the same URL, and remains adopted after the
 *    async URL health probe. Stopping through the new instance really kills
 *    the process.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeploymentState, DeploymentTargetType } from '@/domain/generated/output.js';
import { DeploymentService } from '@/infrastructure/services/deployment/deployment.service.js';
import {
  createHarness,
  makeNodeFixture,
  seedFreshRunPlan,
  uniqueTargetId,
  waitForState,
  waitForStatus,
  waitForLogLine,
  isPidAlive,
  SERVER_PID_FILE,
  type DevServerAgentHarness,
} from './harness.js';

const TEST_TIMEOUT_MS = 60_000;
const TARGET_TYPE = DeploymentTargetType.Repository;
/** DeploymentRecovery probes the recovered URL with a 2s TCP timeout. */
const RECOVERY_PROBE_SETTLE_MS = 2_300;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('dev-server agent integration — degradation and recovery', () => {
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

  it(
    'degradation: with no agent configured, a detectable repo still reaches Ready deterministically',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness({ executor: null, analysis: null });
      const fixture = harness.trackFixture(
        makeNodeFixture({ packageJson: 'dev-script', nodeModules: true })
      );
      const targetId = uniqueTargetId();

      const result = await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);
      expect(result.state).toBe(DeploymentState.Analyzing);

      const status = await waitForState(harness, targetId, DeploymentState.Ready);
      expect(status.url).toMatch(/^http:\/\/localhost:\d+$/);
      await waitForLogLine(harness, targetId, 'dev-server agent run succeeded');

      // Nothing agent-shaped exists in this composition to have been called.
      expect(harness.executeSpy).not.toHaveBeenCalled();
      expect(harness.structuredCallSpy).not.toHaveBeenCalled();
      expect(harness.getExecutorSpy).not.toHaveBeenCalled();
    }
  );

  it(
    'degradation: with no agent and no detectable dev script, the run stops with an actionable reason',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness({ executor: null, analysis: null });
      // package.json without dev/start/serve: detection fails, no agent to
      // fall back to.
      const fixture = harness.trackFixture(makeNodeFixture({ packageJson: 'no-scripts' }));
      const targetId = uniqueTargetId();

      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);

      // Actionable failure reaches the live log stream…
      const failureLine = await waitForLogLine(harness, targetId, 'no AI agent is configured');
      expect(failureLine.line).toContain('Could not detect a dev server');
      expect(failureLine.line).toContain('add a dev/start/serve script');

      // …the run winds down to Stopped/untracked…
      const finalStatus = await waitForStatus(harness, targetId, (s) => s === null);
      expect(finalStatus).toBeNull();

      // …and the trail stays readable AFTER the run (post-mortem retention).
      const logs = harness.deploymentService.getLogs(targetId);
      expect(logs).not.toBeNull();
      const lines = logs!.map((entry) => entry.line);
      expect(lines).toContain('dev-server agent run started');
      expect(lines.some((line) => line.includes('no AI agent is configured'))).toBe(true);

      expect(harness.deploymentService.listAll()).toEqual([]);
    }
  );

  it(
    'recoverAll interplay: a graph-started Ready server is re-adopted by a fresh service instance after a simulated restart',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      const fixture = harness.trackFixture(makeNodeFixture({ packageJson: 'dev-script' }));
      await seedFreshRunPlan(harness, fixture);
      const targetId = uniqueTargetId();

      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);
      const ready = await waitForState(harness, targetId, DeploymentState.Ready);
      await waitForLogLine(harness, targetId, 'dev-server agent run succeeded');

      // Ready state persisted the dev_servers row (recovery source).
      const row = harness.db
        .prepare('SELECT pid, url, state FROM dev_servers WHERE target_id = ?')
        .get(targetId) as { pid: number; url: string; state: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.url).toBe(ready.url);

      // Simulate a process restart: a SECOND service on the same database.
      const restarted = harness.trackService(new DeploymentService());
      restarted.setDatabase(harness.db);

      // recoverAll must actually run in this test process.
      delete process.env.SHEP_SKIP_RECOVERY;
      try {
        restarted.recoverAll();
      } finally {
        process.env.SHEP_SKIP_RECOVERY = '1';
      }

      // Re-adopted with the same URL.
      const recovered = restarted.getStatus(targetId);
      expect(recovered).not.toBeNull();
      expect(recovered!.state).toBe(DeploymentState.Ready);
      expect(recovered!.url).toBe(ready.url);

      // The async URL health probe must confirm the server (it REALLY
      // listens) — after the probe window the adoption still holds and the
      // process was not killed as a zombie.
      await sleep(RECOVERY_PROBE_SETTLE_MS);
      const afterProbe = restarted.getStatus(targetId);
      expect(afterProbe).not.toBeNull();
      expect(afterProbe!.state).toBe(DeploymentState.Ready);
      expect(afterProbe!.url).toBe(ready.url);

      // Stop through the restarted instance and verify the real process
      // (pid recorded by the fixture server itself) is gone.
      const serverPid = Number(readFileSync(join(fixture, SERVER_PID_FILE), 'utf-8'));
      expect(isPidAlive(serverPid)).toBe(true);

      await restarted.stop(targetId);

      // Signal delivery + child reaping are asynchronous — poll briefly
      // instead of asserting instantly (a freshly-killed child can linger
      // as a zombie for kill(pid, 0)).
      const deadline = Date.now() + 5_000;
      while (isPidAlive(serverPid) && Date.now() < deadline) {
        await sleep(50);
      }
      expect(isPidAlive(serverPid)).toBe(false);
      expect(restarted.getStatus(targetId)).toBeNull();
      const remaining = harness.db
        .prepare('SELECT COUNT(*) AS c FROM dev_servers WHERE target_id = ?')
        .get(targetId) as { c: number };
      expect(remaining.c).toBe(0);
    }
  );
});
