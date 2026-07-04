// @vitest-environment node

/**
 * Dev-server agent end-to-end integration — install + remediation paths
 * (spec 103, task-15).
 *
 * Real graph + real DeploymentService + real SQLite + real child processes;
 * ONLY the agent seams are stubbed.
 *
 * Scenarios covered here:
 * 4. Install path — stale deps (no install stamp) with agent-supplied
 *    setupCommands: the run passes through Installing, really executes the
 *    setup command (marker file proves it), stamps the install hash, and
 *    reaches Ready.
 *    NOTE (hermeticity): the install work is modelled as
 *    `setupCommands: ['node setup.js']` (a REAL spawn through the real
 *    install_deps node) instead of a `packageManager` install, because any
 *    real package-manager install with actual dependencies would hit the
 *    network. The package-manager branch of the very same node is covered
 *    by the deterministic-path test (empty-deps `npm install`, offline).
 * 5. Remediation path — the first spawn fails (missing entry file), the
 *    stubbed executor FIXES the repo, the retry succeeds. Pins: exactly one
 *    executor run, no re-analysis within the run, and the cached plan row
 *    invalidated (deleted; the NEXT run re-analyzes) — the remediate node's
 *    documented semantics.
 * 6. Remediation exhaustion — the executor fixes nothing; after
 *    MAX_REMEDIATION_ATTEMPTS the run terminates Stopped with the actionable
 *    failure reason visible in the log trail, and no process is left behind.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DeploymentState, RunPlanSource } from '@/domain/generated/output.js';
import { computeInstallHash } from '@/infrastructure/services/deployment/config-hash.js';
import { MAX_REMEDIATION_ATTEMPTS } from '@/infrastructure/services/agents/dev-server-agent/dev-server-agent-graph.js';
import {
  createHarness,
  makeNodeFixture,
  nodeServerAnalysis,
  uniqueTargetId,
  waitForState,
  waitForStatus,
  waitForLogLine,
  waitForLogLineCount,
  SERVER_JS_SOURCE,
  SETUP_MARKER_FILE,
  type DevServerAgentHarness,
} from './harness.js';

const TEST_TIMEOUT_MS = 60_000;
const TARGET_TYPE = 'repository';
/** Entry file the broken plans point at; the remediation stub creates it. */
const MISSING_SERVER_FILE = 'missing-server.js';

describe('dev-server agent integration — install and remediation', () => {
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
    'install path: stale deps run the plan setupCommands through Installing, stamp the hash, then Ready',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness({
        analysis: nodeServerAnalysis({ setupCommands: ['node setup.js'] }),
      });
      // package.json without a dev script: detection fails (agent path) and
      // the install hash has a real, non-empty value to stamp.
      const fixture = harness.trackFixture(
        makeNodeFixture({ packageJson: 'no-scripts', setupScript: true })
      );
      const targetId = uniqueTargetId();

      const seenStates = new Set<DeploymentState>();
      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);
      const status = await waitForState(harness, targetId, DeploymentState.Ready, { seenStates });

      expect(status.url).toMatch(/^http:\/\/localhost:\d+$/);
      await waitForLogLine(harness, targetId, 'dev-server agent run succeeded');

      // The run was observable through both pre-spawn states.
      expect(seenStates).toContain(DeploymentState.Analyzing);
      expect(seenStates).toContain(DeploymentState.Installing);

      // The setup command REALLY ran (real spawn wrote the marker).
      expect(existsSync(join(fixture, SETUP_MARKER_FILE))).toBe(true);
      // ...and no package-manager install was involved (hermetic choice).
      expect(harness.installSpy).not.toHaveBeenCalled();

      // Agent plan persisted with the setup command and the install stamp.
      const plan = await harness.runPlanRepository.findByRepoPath(fixture);
      expect(plan).not.toBeNull();
      expect(plan!.source).toBe(RunPlanSource.Agent);
      expect(plan!.setupCommands).toEqual(['node setup.js']);
      expect(plan!.installStampHash).toBe(computeInstallHash(fixture));
      expect(plan!.installStampHash).not.toBe('');

      expect(harness.structuredCallSpy).toHaveBeenCalledTimes(1);
      expect(harness.executeSpy).not.toHaveBeenCalled();
    }
  );

  it(
    'remediation path: failed start → executor fixes the repo → retry reaches Ready',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const fixture = makeNodeFixture({ packageJson: 'none', serverFile: false });
      harness = await createHarness({
        analysis: nodeServerAnalysis({ command: `node ${MISSING_SERVER_FILE}` }),
        // The remediation "agent" fixes the actual failure: it creates the
        // missing entry file, so the retried spawn succeeds.
        executor: () => {
          writeFileSync(join(fixture, MISSING_SERVER_FILE), SERVER_JS_SOURCE);
        },
      });
      harness.trackFixture(fixture);
      const targetId = uniqueTargetId();

      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);
      const status = await waitForState(harness, targetId, DeploymentState.Ready);

      expect(status.url).toMatch(/^http:\/\/localhost:\d+$/);
      await waitForLogLine(harness, targetId, 'dev-server agent run succeeded');

      // Exactly ONE remediation execution fixed the run.
      expect(harness.executeSpy).toHaveBeenCalledTimes(1);
      // The remediation trail is visible in the deployment log stream even
      // though the crashed first attempt tore its live entry down.
      await waitForLogLine(harness, targetId, 'remediation attempt 1: launching agent');
      await waitForLogLine(harness, targetId, 'remediation attempt 1 completed — retrying start');

      // Within one run the SAME plan is retried — analysis runs once.
      expect(harness.structuredCallSpy).toHaveBeenCalledTimes(1);

      // Pinned remediate semantics: the cached plan row is invalidated
      // (deleted) and NOT re-created within the run — the next
      // startDevServer() re-analyzes from scratch.
      expect(await harness.runPlanRepository.findByRepoPath(fixture)).toBeNull();
    }
  );

  it(
    'remediation exhaustion: unfixable failure terminates Stopped with the reason in the log trail and no zombie process',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness({
        analysis: nodeServerAnalysis({ command: `node ${MISSING_SERVER_FILE}` }),
        // Executor "succeeds" but fixes nothing — every retry keeps failing.
      });
      const fixture = harness.trackFixture(makeNodeFixture({ packageJson: 'none' }));
      const targetId = uniqueTargetId();

      await harness.service.startDevServer(targetId, fixture, TARGET_TYPE);

      // Terminal signal: the reason line is emitted once per failed verify
      // (initial attempt + MAX_REMEDIATION_ATTEMPTS retries) plus once more
      // by the service's terminal failure routing (verbatim re-append) —
      // waiting for the LAST occurrence, not the first, avoids racing the
      // still-running remediation loop.
      const failureReason = 'Dev server exited before becoming ready';
      await waitForLogLineCount(harness, targetId, failureReason, MAX_REMEDIATION_ATTEMPTS + 2);
      // The run winds down to a stopped (untracked) deployment.
      const finalStatus = await waitForStatus(harness, targetId, (s) => s === null);
      expect(finalStatus).toBeNull();

      // Remediation was attempted exactly MAX_REMEDIATION_ATTEMPTS times.
      expect(harness.executeSpy).toHaveBeenCalledTimes(MAX_REMEDIATION_ATTEMPTS);
      expect(harness.structuredCallSpy).toHaveBeenCalledTimes(1);

      // The failure trail stays retrievable AFTER the run (task-11
      // acceptance: "graph failure surfaces as Stopped + logged reason") —
      // a crashed child must not erase the post-mortem.
      const logs = harness.deploymentService.getLogs(targetId);
      expect(logs).not.toBeNull();
      expect(logs!.map((entry) => entry.line)).toContain('Dev server exited before becoming ready');

      // No zombie children and no leaked dev_servers rows.
      expect(harness.deploymentService.listAll()).toEqual([]);
      const rows = harness.db.prepare('SELECT COUNT(*) AS c FROM dev_servers').get() as {
        c: number;
      };
      expect(rows.c).toBe(0);
    }
  );
});
