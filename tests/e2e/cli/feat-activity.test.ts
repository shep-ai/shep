/**
 * CLI E2E: agent activity (spec 148)
 *
 * Runs the real CLI against an isolated SHEP_HOME. A feature created with the
 * deterministic mock executor parks at its first approval gate; from outside
 * shep's UI that must read as "blocked, at an approval gate":
 *
 * - `shep feat wait` returns as soon as it is blocked (exit 0), and reports a
 *   missing feature with its own exit code;
 * - `shep feat status` explains it, in words and as JSON;
 * - the A2A endpoint of `shep ui` serves the agent card, refuses a request
 *   without the install token, and returns the feature as an A2A task in
 *   TASK_STATE_INPUT_REQUIRED.
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCliRunner, type CliRunner } from '../../helpers/cli/index.js';
import { startCliServer, type ServerProcess } from '../../helpers/cli/server.js';
import { createConsoleFixture, type ConsoleFixture } from '../../helpers/tui/console-e2e.js';

vi.setConfig({ hookTimeout: 300_000 });

/** The worker reaches its first gate within seconds; Windows CI is several times slower. */
const GATE_TIMEOUT_S = process.platform === 'win32' ? 180 : 90;
const WAIT_EXIT_MATCHED = 0;
const WAIT_EXIT_NOT_FOUND = 1;
const TOKEN_FILE = 'web-auth-token';

/** A port the OS says is free right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

interface ActivityJson {
  featureId: string;
  state: string;
  reason: string;
  phase: string;
}

describe('CLI: agent activity', { timeout: 600_000 }, () => {
  let fixture: ConsoleFixture;
  let runner: CliRunner;
  let featureId: string;

  beforeAll(() => {
    fixture = createConsoleFixture();
    runner = createCliRunner({
      env: { SHEP_HOME: fixture.shepHome, SHEP_TELEMETRY_DISABLED: '1' },
      timeout: (GATE_TIMEOUT_S + 30) * 1000,
    });
    const created = runner.runOrThrow(`feat new "Activity probe" --repo ${fixture.repo}`);
    const match = created.stdout.match(/ID:\s+([0-9a-f-]{36})/);
    if (!match) throw new Error(`No feature id in:\n${created.stdout}`);
    featureId = match[1];
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('feat wait returns once the feature blocks at its gate', () => {
    const result = runner.run(
      `feat wait ${featureId} --until blocked --timeout ${GATE_TIMEOUT_S} --json`
    );

    expect(result.exitCode, result.stderr).toBe(WAIT_EXIT_MATCHED);
    const parsed = JSON.parse(result.stdout) as { outcome: string; activity: ActivityJson };
    expect(parsed.outcome).toBe('matched');
    expect(parsed.activity).toMatchObject({
      featureId,
      state: 'blocked',
      reason: 'approval-gate',
    });
  });

  it('feat status explains it in words and as JSON', () => {
    const text = runner.runOrThrow(`feat status ${featureId.slice(0, 8)}`).stdout;
    expect(text).toContain('Activity Probe');
    expect(text).toContain('blocked');
    expect(text).toContain('Waiting for your approval');
    expect(text).toContain(`shep feat approve ${featureId.slice(0, 8)}`);

    const json = JSON.parse(
      runner.runOrThrow(`feat status ${featureId} --json`).stdout
    ) as ActivityJson;
    expect(json).toMatchObject({ featureId, state: 'blocked', reason: 'approval-gate' });
  });

  it('feat wait reports a missing feature with its own exit code', () => {
    const result = runner.run('feat wait 00000000-0000-0000-0000-000000000000 --json');
    expect(result.exitCode).toBe(WAIT_EXIT_NOT_FOUND);
    expect(JSON.parse(result.stdout)).toEqual({ outcome: 'not-found' });
  });

  describe('A2A endpoint of shep ui', () => {
    let server: ServerProcess;
    let base: string;
    let token: string;

    beforeAll(async () => {
      server = await startCliServer(`--port ${await freePort()}`, {
        env: { SHEP_HOME: fixture.shepHome, SHEP_TELEMETRY_DISABLED: '1' },
        timeout: 240_000,
      });
      base = `http://localhost:${server.port}`;
      // The daemon writes its token when the request guard first runs.
      await fetch(`${base}/.well-known/agent-card.json`);
      token = readFileSync(join(fixture.shepHome, TOKEN_FILE), 'utf8').trim();
    });

    afterAll(async () => {
      await server?.stop();
    });

    const rpc = (method: string, params: unknown, headers: Record<string, string> = {}) =>
      fetch(`${base}/api/a2a`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'A2A-Version': '1.0', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

    it('serves the agent card at the well-known path without the token', async () => {
      const response = await fetch(`${base}/.well-known/agent-card.json`);
      expect(response.status).toBe(200);
      const card = (await response.json()) as {
        name: string;
        supportedInterfaces: { url: string; protocolBinding: string }[];
      };
      expect(card.name).toBe('Shep');
      expect(card.supportedInterfaces[0]).toMatchObject({
        url: `${base}/api/a2a`,
        protocolBinding: 'JSONRPC',
      });
    });

    it('refuses a JSON-RPC call without the install token', async () => {
      const response = await rpc('GetTask', { id: featureId });
      expect(response.status).toBe(401);
    });

    it('returns the blocked feature as a task that needs input', async () => {
      const response = await rpc(
        'GetTask',
        { id: featureId },
        { authorization: `Bearer ${token}` }
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { id: string; status: { state: string; message: { parts: { text: string }[] } } };
      };
      expect(body.result.id).toBe(featureId);
      expect(body.result.status.state).toBe('TASK_STATE_INPUT_REQUIRED');
      expect(body.result.status.message.parts[0].text).toContain('"decision"');
    });
  });
});
