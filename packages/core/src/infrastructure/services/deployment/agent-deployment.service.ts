/**
 * Agent Deployment Service
 *
 * Higher-level deployment orchestrator that uses the DevEnvironmentAgent
 * to analyze repos before starting deployments. Replaces the simple
 * "detect package.json scripts" approach with AI-driven analysis that
 * supports any language/framework.
 *
 * Flow:
 * 1. Analyze repo via DevEnvironmentAgent (cached per-repo for speed)
 * 2. If not deployable → return descriptive reason
 * 3. If deployable → run setup commands → start dev server via DeploymentService
 */

import { exec } from 'node:child_process';
import { join } from 'node:path';
import type {
  IAgentDeploymentService,
  AgentDeployResult,
} from '@/application/ports/output/services/agent-deployment-service.interface.js';
import type { IDevEnvironmentAgent } from '@/application/ports/output/services/dev-environment-agent.interface.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import { DeploymentState } from '@/domain/generated/output.js';
import { createDeploymentLogger } from './deployment-logger.js';

const log = createDeploymentLogger('[AgentDeploymentService]');

/** Dependencies injectable for testing. */
export interface AgentDeploymentServiceDeps {
  devEnvironmentAgent: IDevEnvironmentAgent;
  deploymentService: IDeploymentService;
  execCommand?: (command: string, cwd: string) => Promise<void>;
}

function defaultExecCommand(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

type ResolvedDeps = Required<AgentDeploymentServiceDeps>;

export class AgentDeploymentService implements IAgentDeploymentService {
  private readonly deps: ResolvedDeps;

  constructor(deps: AgentDeploymentServiceDeps) {
    this.deps = {
      execCommand: defaultExecCommand,
      ...deps,
    };
  }

  async deploy(
    targetId: string,
    targetPath: string,
    options?: { skipCache?: boolean }
  ): Promise<AgentDeployResult> {
    log.info(`deploy() called — targetId="${targetId}", targetPath="${targetPath}"`);

    // Step 1: Analyze via agent
    let analysis;
    try {
      analysis = await this.deps.devEnvironmentAgent.analyze(targetPath, {
        skipCache: options?.skipCache,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      log.error(`agent analysis failed: ${message}`);
      return { success: false, error: message };
    }

    log.info(`analysis result — deployable=${analysis.deployable}, command=${analysis.command}`);

    // Step 2: Handle not-deployable repos
    if (!analysis.deployable) {
      log.info(`repo is not deployable: ${analysis.reason}`);
      return {
        success: false,
        error: analysis.reason,
        analysis,
      };
    }

    // Validate: deployable but no command is an error
    if (!analysis.command) {
      log.error('analysis marked repo as deployable but provided no command');
      return {
        success: false,
        error: 'Analysis marked repo as deployable but provided no command',
        analysis,
      };
    }

    // Step 3: Run setup commands
    const resolvedCwd =
      analysis.cwd && analysis.cwd !== '.' ? join(targetPath, analysis.cwd) : targetPath;

    for (const setupCmd of analysis.setupCommands) {
      log.info(`running setup command: "${setupCmd}" in "${resolvedCwd}"`);
      try {
        await this.deps.execCommand(setupCmd, resolvedCwd);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Setup failed';
        log.error(`setup command failed: ${message}`);
        return {
          success: false,
          error: `Setup command failed: ${message}`,
          analysis,
        };
      }
    }

    // Step 4: Start the dev server
    try {
      this.deps.deploymentService.start(targetId, targetPath, {
        command: analysis.command,
        cwd: analysis.cwd,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to start deployment';
      log.error(`deployment start failed: ${message}`);
      return {
        success: false,
        error: message,
        analysis,
      };
    }

    log.info('deployment started successfully');
    return {
      success: true,
      state: DeploymentState.Booting,
      analysis,
    };
  }
}
