/**
 * The per-run MCP config that gives a headless agent ask_decision (spec 134).
 * Real filesystem: the agent CLI reads the file the worker writes.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeDirWithRetry } from '../../../../../helpers/remove-dir.helper.js';
import {
  DECISION_MCP_SERVER_NAME,
  writeDecisionMcpConfig,
} from '@/infrastructure/services/agents/feature-agent/decision-mcp-config.js';

describe('writeDecisionMcpConfig', () => {
  let dir: string;
  afterEach(() => removeDirWithRetry(dir));

  it('adds the decision server, scoped to the run, next to the plugin servers', () => {
    dir = mkdtempSync(join(tmpdir(), 'shep-decision-mcp-'));
    const pluginConfig = join(dir, 'plugins.json');
    writeFileSync(
      pluginConfig,
      JSON.stringify({ mcpServers: { github: { type: 'stdio', command: 'gh-mcp', args: [] } } })
    );

    const path = writeDecisionMcpConfig({
      existingConfigPath: pluginConfig,
      entryPath: '/opt/shep/decision-mcp-server.js',
      runId: 'run-1',
      featureId: 'feat-1',
      dir,
      env: { SHEP_HOME: '/home/me/.shep-test' },
    });

    const config = JSON.parse(readFileSync(path, 'utf-8'));
    expect(Object.keys(config.mcpServers)).toEqual(['github', DECISION_MCP_SERVER_NAME]);
    expect(config.mcpServers[DECISION_MCP_SERVER_NAME]).toEqual({
      type: 'stdio',
      command: process.execPath,
      args: ['/opt/shep/decision-mcp-server.js'],
      env: {
        SHEP_AGENT_RUN_ID: 'run-1',
        SHEP_FEATURE_ID: 'feat-1',
        SHEP_HOME: '/home/me/.shep-test',
      },
    });
    // The plugin config is left for its own owner to clean up.
    expect(path).not.toBe(pluginConfig);
  });

  it('writes a config of its own when there are no plugin servers', () => {
    dir = mkdtempSync(join(tmpdir(), 'shep-decision-mcp-'));
    const path = writeDecisionMcpConfig({
      entryPath: '/opt/shep/decision-mcp-server.js',
      runId: 'run-1',
      featureId: 'feat-1',
      dir,
      env: {},
    });
    const config = JSON.parse(readFileSync(path, 'utf-8'));
    expect(Object.keys(config.mcpServers)).toEqual([DECISION_MCP_SERVER_NAME]);
    expect(config.mcpServers[DECISION_MCP_SERVER_NAME].env).toEqual({
      SHEP_AGENT_RUN_ID: 'run-1',
      SHEP_FEATURE_ID: 'feat-1',
    });
  });
});
