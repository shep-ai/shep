/**
 * Decision MCP server (spec 134, part 2)
 *
 * The stdio MCP server a feature worker gives a headless agent run (through
 * the per-run `mcpConfigPath`). It exposes `ask_decision` only — a run must not
 * gain Shep's other tools (run/stop agents, features) by being able to ask.
 *
 * Run as a script: `node decision-mcp-server.js`, with the run marker
 * (SHEP_AGENT_RUN_ID / SHEP_FEATURE_ID) in its environment.
 */

import 'reflect-metadata';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import type { EnvironmentVariables } from '../../../domain/shared/agent-run-environment.js';
import type { IVersionService } from '../../../application/ports/output/services/version-service.interface.js';
import { registerDecisionTools } from './tools/decision-tools.js';

const SERVER_NAME = 'shep-decisions';

export function createDecisionMcpServer(
  container: DependencyContainer,
  env: EnvironmentVariables,
  version: string
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version });
  registerDecisionTools(server, container, env);
  return server;
}

async function main(): Promise<void> {
  // stdout carries the protocol: anything that logs must go to stderr.
  /* eslint-disable no-console */
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  /* eslint-enable no-console */
  const { initializeContainer, container } = await import('../../di/container.js');
  await initializeContainer();
  // Same bootstrap as the feature worker: notifications read the process-wide
  // settings singleton when a question is escalated.
  const { InitializeSettingsUseCase } = await import(
    '../../../application/use-cases/settings/initialize-settings.use-case.js'
  );
  const { initializeSettings } = await import('../settings.service.js');
  initializeSettings(await container.resolve(InitializeSettingsUseCase).execute());
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { version } = container.resolve<IVersionService>('IVersionService').getVersion();
  const server = createDecisionMcpServer(container, process.env, version);
  await server.connect(new StdioServerTransport());
}

const isMainModule =
  typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.includes('decision-mcp-server');

if (isMainModule) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `[shep-decisions] failed to start: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}
