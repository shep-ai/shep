/**
 * Per-run MCP config that gives a headless agent the `ask_decision` tool
 * (spec 134, part 2).
 *
 * The worker passes the executor ONE `mcpConfigPath`. When plugin servers are
 * running their config is copied and the decision server added; otherwise a
 * config with only the decision server is written. The decision server runs
 * with the run's marker environment, which is where `ask_decision` takes its
 * run and feature from. Each call writes a new file; the worker deletes it.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agentRunEnvironment,
  type EnvironmentVariables,
} from '../../../../domain/shared/agent-run-environment.js';

/** Key of the decision server inside `mcpServers` (tools appear as `mcp__shep-decisions__…`). */
export const DECISION_MCP_SERVER_NAME = 'shep-decisions';

/** Environment the decision server needs beyond the run marker (test isolation). */
const PASSTHROUGH_ENV = ['SHEP_HOME'] as const;

interface McpServerEntry {
  type: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface WriteDecisionMcpConfigInput {
  /** The plugin servers' config, when any are running. */
  existingConfigPath?: string;
  /** Absolute path of the built `decision-mcp-server.js`. */
  entryPath: string;
  runId: string;
  featureId: string;
  /** Directory for the file (default: the OS temp directory). */
  dir?: string;
  env: EnvironmentVariables;
}

function readServers(path: string | undefined): Record<string, McpServerEntry> {
  if (!path) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      mcpServers?: Record<string, McpServerEntry>;
    };
    return parsed.mcpServers ?? {};
  } catch {
    return {};
  }
}

export function writeDecisionMcpConfig(input: WriteDecisionMcpConfigInput): string {
  const passthrough: Record<string, string> = {};
  for (const key of PASSTHROUGH_ENV) {
    const value = input.env[key];
    if (value) passthrough[key] = value;
  }
  const mcpServers: Record<string, McpServerEntry> = {
    ...readServers(input.existingConfigPath),
    [DECISION_MCP_SERVER_NAME]: {
      type: 'stdio',
      command: process.execPath,
      args: [input.entryPath],
      env: { ...agentRunEnvironment(input.runId, input.featureId), ...passthrough },
    },
  };
  const path = join(
    input.dir ?? tmpdir(),
    `shep-mcp-decisions-${input.featureId}-${randomUUID()}.json`
  );
  writeFileSync(path, JSON.stringify({ mcpServers }, null, 2), 'utf-8');
  return path;
}
