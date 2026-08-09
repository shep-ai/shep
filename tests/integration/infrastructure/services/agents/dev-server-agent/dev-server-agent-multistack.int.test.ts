// @vitest-environment node

/**
 * Multi-stack deterministic resolution — the behavioural heart of spec 108.
 *
 * Real fixture repositories on disk, the real detector registry, the real
 * config hashing and a real migrated SQLite run-plan repository. The ONLY
 * stub is the agent boundary, and its whole job here is to FAIL the test if
 * it is ever touched: every ecosystem the registry covers must cost zero
 * agent tokens on start (NFR-2) and must work with no agent configured at
 * all (FR-10).
 *
 * ## Why the sweep asserts at the analyze boundary
 *
 * The claim under test is the TIER DECISION — which detector won, what it
 * persisted, and that no agent was consulted. Driving the full graph for
 * every ecosystem would instead assert what happens to be installed on the
 * machine running the suite: `cargo run` would compile for ten seconds where
 * Rust exists and fail at the binary probe where it does not, and
 * `docker compose up` would create real containers, networks and volumes on
 * any developer machine with Docker running. Neither is hermetic and the
 * second is not safe.
 *
 * So the sweep stops at analyze, and ONE end-to-end scenario carries the
 * full-graph claim: a Make fixture whose `dev` target runs the same Node
 * fixture server every other suite uses, so a non-Node deterministic plan is
 * proven to flow all the way through ensure_infra → install_deps →
 * start_server → verify → Ready.
 */

import 'reflect-metadata';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteDevServerRunPlanRepository } from '@/infrastructure/repositories/sqlite-dev-server-run-plan.repository.js';
import { createAnalyzeNode } from '@/infrastructure/services/agents/dev-server-agent/nodes/analyze.node.js';
import type { DevServerAgentState } from '@/infrastructure/services/agents/dev-server-agent/state.js';
import { detectRunPlan } from '@/infrastructure/services/deployment/detect-dev-script.js';
import { readRepoDevConfig } from '@/infrastructure/services/deployment/repo-dev-config-reader.js';
import { computeConfigHash } from '@/infrastructure/services/deployment/config-hash.js';
import { probeBinaryDefault } from '@/infrastructure/services/agents/dev-server-agent/nodes/ensure-infra.node.js';
import { DeploymentState, DeploymentTargetType, RunPlanSource } from '@/domain/generated/output.js';
import {
  createHarness,
  uniqueTargetId,
  waitForState,
  waitForLogLine,
  SERVER_FILE,
  SERVER_JS_SOURCE,
  type DevServerAgentHarness,
} from './harness.js';

const TEST_TIMEOUT_MS = 60_000;
const TARGET_TYPE = DeploymentTargetType.Repository;

/** One covered ecosystem: the files that identify it and what must resolve. */
interface EcosystemCase {
  name: string;
  files: Record<string, string>;
  command: string;
  expectedPort?: number;
  language?: string;
  framework?: string;
}

/**
 * The broad eight, each written as the minimum a real repository of that
 * kind would contain. Deliberately NO package.json in any of them — Node is
 * first in the registry, so a stray manifest would mask the detector under
 * test.
 */
const ECOSYSTEMS: EcosystemCase[] = [
  {
    name: 'make',
    files: { Makefile: '.PHONY: dev\ndev:\n\tnode server.js\n' },
    command: 'make dev',
  },
  {
    name: 'deno',
    files: { 'deno.json': JSON.stringify({ tasks: { dev: 'node server.js' } }) },
    command: 'deno task dev',
    language: 'TypeScript',
  },
  {
    name: 'python',
    files: { 'manage.py': '#!/usr/bin/env python\n' },
    command: 'python manage.py runserver',
    expectedPort: 8000,
    language: 'Python',
    framework: 'Django',
  },
  {
    name: 'go',
    files: {
      'go.mod': 'module example.com/app\n\ngo 1.22\n',
      'main.go': 'package main\n\nfunc main() {}\n',
    },
    command: 'go run .',
    language: 'Go',
  },
  {
    name: 'rust',
    files: { 'Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\n' },
    command: 'cargo run',
    language: 'Rust',
  },
  {
    name: 'ruby',
    files: { 'bin/rails': '#!/usr/bin/env ruby\n' },
    command: 'bin/rails server',
    expectedPort: 3000,
    language: 'Ruby',
    framework: 'Rails',
  },
  {
    name: 'elixir',
    files: {
      'mix.exs':
        'defmodule App.MixProject do\n  defp deps do\n    [{:phoenix, "~> 1.7"}]\n  end\nend\n',
    },
    command: 'mix phx.server',
    expectedPort: 4000,
    language: 'Elixir',
    framework: 'Phoenix',
  },
  {
    name: 'compose',
    files: {
      'docker-compose.yml': 'services:\n  web:\n    image: nginx\n    ports:\n      - "8080:80"\n',
    },
    command: 'docker compose up',
    expectedPort: 8080,
  },
];

describe('dev-server agent integration — multi-stack deterministic resolution', () => {
  const fixtures: string[] = [];
  let db: Database.Database;
  let runPlanRepository: SQLiteDevServerRunPlanRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    runPlanRepository = new SQLiteDevServerRunPlanRepository(db);
  });

  afterEach(() => {
    db.close();
    while (fixtures.length > 0) {
      rmSync(fixtures.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  /** Write a fixture repository from a path → contents map. */
  function makeFixture(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'shep-multistack-'));
    fixtures.push(dir);

    for (const [relative, contents] of Object.entries(files)) {
      const filePath = join(dir, ...relative.split('/'));
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, contents);
    }

    return dir;
  }

  function makeState(targetPath: string): DevServerAgentState {
    return {
      targetId: 'multistack',
      targetType: TARGET_TYPE,
      targetPath,
      runPlan: null,
      infraReady: false,
      depsInstalled: false,
      resultUrl: null,
      failureReason: null,
      remediationAttempts: 0,
      lastErrorTail: [],
      capturedLogs: [],
      degraded: false,
    };
  }

  /**
   * The analyze node composed exactly as `DevServerAgentService.composeNodes`
   * composes it, with the agent seam either absent (degraded) or booby-trapped.
   */
  function makeAnalyzeNode(options: { degraded?: boolean } = {}) {
    const calls: string[] = [];
    const structuredCaller = options.degraded
      ? null
      : {
          call: async () => {
            calls.push('call');
            throw new Error('structuredCaller.call must not be invoked for a covered ecosystem');
          },
        };

    const logs: string[] = [];
    const node = createAnalyzeNode({
      runPlanRepository,
      detect: detectRunPlan,
      readRepoConfig: readRepoDevConfig,
      structuredCaller,
      computeConfigHash,
      reportAnalyzing: () => undefined,
      log: (line) => logs.push(line),
    });

    return { node, logs, calls };
  }

  describe('with an agent configured', () => {
    it.each(ECOSYSTEMS)(
      '$name resolves a Deterministic plan with ZERO agent calls',
      async (ecosystem) => {
        const dir = makeFixture(ecosystem.files);
        const { node, logs, calls } = makeAnalyzeNode();

        const result = await node(makeState(dir));

        expect(calls).toEqual([]);
        expect(result.failureReason).toBeUndefined();
        expect(result.runPlan?.source).toBe(RunPlanSource.Deterministic);
        expect(result.runPlan?.command).toBe(ecosystem.command);

        // Persisted, not just returned — the next start must hit the cache.
        const persisted = await runPlanRepository.findByRepoPath(dir);
        expect(persisted?.command).toBe(ecosystem.command);
        expect(persisted?.source).toBe(RunPlanSource.Deterministic);
        expect(persisted?.expectedPort).toBe(ecosystem.expectedPort);
        expect(persisted?.language).toBe(ecosystem.language);
        expect(persisted?.framework).toBe(ecosystem.framework);

        // The winning tier is readable from the log stream alone (NFR-11).
        expect(logs.join('\n')).toContain(`"${ecosystem.name}" detector`);
      }
    );
  });

  describe('degraded — no structured caller resolvable at all', () => {
    it.each(ECOSYSTEMS)('$name still resolves a Deterministic plan', async (ecosystem) => {
      const dir = makeFixture(ecosystem.files);
      const { node } = makeAnalyzeNode({ degraded: true });

      const result = await node(makeState(dir));

      expect(result.degraded).toBe(true);
      expect(result.failureReason).toBeUndefined();
      expect(result.runPlan?.command).toBe(ecosystem.command);
    });

    it('still reports the terminal failure for a repository no detector covers', async () => {
      // Maven is deliberately outside the registry: the right command depends
      // on plugins and profiles, so a deterministic guess would be wrong more
      // often than not and would pre-empt the agent that handles it properly.
      const dir = makeFixture({ 'pom.xml': '<project><artifactId>app</artifactId></project>' });
      const { node } = makeAnalyzeNode({ degraded: true });

      const result = await node(makeState(dir));

      expect(result.runPlan).toBeUndefined();
      expect(result.failureReason).toContain('Could not detect a dev server');
      expect(result.failureReason).toContain('no AI agent is configured');
    });
  });

  it('reaches the agent tier for an uncovered repository when one IS configured', async () => {
    const dir = makeFixture({ 'pom.xml': '<project><artifactId>app</artifactId></project>' });
    const { node, calls } = makeAnalyzeNode();

    const result = await node(makeState(dir));

    // The booby-trapped caller throws, which the node shapes into a reason —
    // proving the agent tier was reached rather than pre-empted.
    expect(calls).toEqual(['call']);
    expect(result.failureReason).toContain('Dev environment analysis failed');
  });
});

/**
 * The one full-graph, non-Node scenario. `make` is present on macOS and
 * Linux CI and absent on stock Windows, where the correct behaviour is the
 * ordinary probe-miss failure that ensure_infra already covers — so the
 * end-to-end claim is asserted where the toolchain exists.
 */
describe('dev-server agent integration — a Make plan end to end', () => {
  let harness: DevServerAgentHarness;
  let savedSkipRecovery: string | undefined;
  let hasMake = false;

  beforeEach(async () => {
    savedSkipRecovery = process.env.SHEP_SKIP_RECOVERY;
    process.env.SHEP_SKIP_RECOVERY = '1';
    hasMake = await probeBinaryDefault('make');
  });

  afterEach(async () => {
    await harness?.cleanup();
    if (savedSkipRecovery === undefined) {
      delete process.env.SHEP_SKIP_RECOVERY;
    } else {
      process.env.SHEP_SKIP_RECOVERY = savedSkipRecovery;
    }
  });

  it(
    'a Makefile-only repository reaches Ready with zero agent calls',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      harness = await createHarness();
      if (!hasMake) {
        // Reported rather than silently passing: a skipped platform must not
        // read as a covered one.
        console.warn('skipping Make end-to-end scenario — `make` is not on PATH');
        return;
      }

      const dir = mkdtempSync(join(tmpdir(), 'shep-make-e2e-'));
      harness.trackFixture(dir);
      writeFileSync(join(dir, SERVER_FILE), SERVER_JS_SOURCE);
      // A tab-indented recipe is mandatory in Make.
      writeFileSync(join(dir, 'Makefile'), `.PHONY: dev\ndev:\n\tnode ${SERVER_FILE}\n`);

      const targetId = uniqueTargetId();
      await harness.service.startDevServer(targetId, dir, TARGET_TYPE);

      const status = await waitForState(harness, targetId, DeploymentState.Ready);
      expect(status.url).toMatch(/^http:\/\/localhost:\d+$/);
      await waitForLogLine(harness, targetId, 'dev-server agent run succeeded');

      expect(harness.structuredCallSpy).not.toHaveBeenCalled();
      expect(harness.executeSpy).not.toHaveBeenCalled();
      expect(harness.installSpy).not.toHaveBeenCalled();

      const plan = await harness.runPlanRepository.findByRepoPath(dir);
      expect(plan?.source).toBe(RunPlanSource.Deterministic);
      expect(plan?.command).toBe('make dev');
      expect(plan?.packageManager).toBeUndefined();
    }
  );
});
