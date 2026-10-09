/**
 * Gives a headless feature run the `ask_decision` tool (spec 134, part 2).
 *
 * Agent-agnostic: the run gets the tool only when its executor declares the
 * `mcpConfig` capability (it honours `mcpConfigPath`), the collaboration flag
 * is on (otherwise nobody could answer), and the built decision server is
 * present. Prompts mention the tool only when this returns a config path.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AgentFeature } from '../../../../domain/generated/output.js';
import type { EnvironmentVariables } from '../../../../domain/shared/agent-run-environment.js';
import { writeDecisionMcpConfig } from './decision-mcp-config.js';

/** Built location of the decision server, relative to this module. */
export function defaultDecisionServerEntryPath(): string {
  return join(__dirname, '..', '..', 'mcp', 'decision-mcp-server.js');
}

export interface StartDecisionToolInput {
  collaborationEnabled: boolean;
  executor: { supportsFeature(feature: AgentFeature): boolean };
  runId: string;
  featureId: string;
  /** The plugin servers' config, when any are running. */
  pluginConfigPath?: string;
  env: EnvironmentVariables;
  entryPath?: string;
  dir?: string;
  log?: (message: string) => void;
}

/** @returns the run's MCP config path including the decision server, or undefined. */
export function startDecisionTool(input: StartDecisionToolInput): string | undefined {
  if (!input.collaborationEnabled) return undefined;
  if (!input.executor.supportsFeature(AgentFeature.mcpConfig)) {
    input.log?.('Executor does not take an MCP config — ask_decision not offered');
    return undefined;
  }
  const entryPath = input.entryPath ?? defaultDecisionServerEntryPath();
  if (!existsSync(entryPath)) {
    input.log?.(`Decision server not built at ${entryPath} — ask_decision not offered`);
    return undefined;
  }
  try {
    const path = writeDecisionMcpConfig({
      existingConfigPath: input.pluginConfigPath,
      entryPath,
      runId: input.runId,
      featureId: input.featureId,
      env: input.env,
      dir: input.dir,
    });
    input.log?.(`ask_decision offered through ${path}`);
    return path;
  } catch (error) {
    input.log?.(`Could not write the decision MCP config: ${String(error)}`);
    return undefined;
  }
}

/** Remove the config written by {@link startDecisionTool}. Safe to call with undefined. */
export function stopDecisionTool(configPath: string | undefined): void {
  if (!configPath) return;
  try {
    unlinkSync(configPath);
  } catch {
    // Already gone.
  }
}
