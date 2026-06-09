// @vitest-environment node

/**
 * AgentDeploymentService Unit Tests
 *
 * Tests for the higher-level deployment orchestrator that uses the
 * DevEnvironmentAgent for analysis before starting deployments.
 *
 * TDD Phase: RED → GREEN → REFACTOR
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentDeploymentService,
  type AgentDeploymentServiceDeps,
} from '@/infrastructure/services/deployment/agent-deployment.service.js';
import type { DevEnvironmentAnalysis } from '@/application/ports/output/services/dev-environment-agent.interface.js';
import { DeploymentState } from '@/domain/generated/output.js';

const DEPLOYABLE_ANALYSIS: DevEnvironmentAnalysis = {
  deployable: true,
  reason: 'Detected Next.js project with dev script',
  command: 'pnpm dev',
  cwd: '.',
  expectedPort: 3000,
  language: 'node',
  framework: 'next.js',
  setupCommands: [],
};

const NOT_DEPLOYABLE_ANALYSIS: DevEnvironmentAnalysis = {
  deployable: false,
  reason: 'This is a CLI utility with no web server or UI to start',
  command: null,
  cwd: '.',
  expectedPort: null,
  language: 'node',
  framework: null,
  setupCommands: [],
};

function createMockDeps(
  overrides?: Partial<AgentDeploymentServiceDeps>
): AgentDeploymentServiceDeps {
  return {
    devEnvironmentAgent: {
      analyze: vi.fn().mockResolvedValue(DEPLOYABLE_ANALYSIS),
      clearCache: vi.fn(),
      clearAllCaches: vi.fn(),
    },
    deploymentService: {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue(null),
      stopAll: vi.fn(),
      getLogs: vi.fn().mockReturnValue(null),
      on: vi.fn(),
      off: vi.fn(),
    },
    execCommand: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AgentDeploymentService', () => {
  let service: AgentDeploymentService;
  let deps: AgentDeploymentServiceDeps;

  beforeEach(() => {
    deps = createMockDeps();
    service = new AgentDeploymentService(deps);
  });

  describe('deploy - deployable repo', () => {
    it('should analyze the repo via DevEnvironmentAgent', async () => {
      await service.deploy('feature-1', '/path/to/repo');

      expect(deps.devEnvironmentAgent.analyze).toHaveBeenCalledWith('/path/to/repo', {
        skipCache: undefined,
      });
    });

    it('should start the deployment service with the detected command', async () => {
      await service.deploy('feature-1', '/path/to/repo');

      expect(deps.deploymentService.start).toHaveBeenCalledWith('feature-1', '/path/to/repo', {
        command: 'pnpm dev',
        cwd: '.',
      });
    });

    it('should return success with Booting state and analysis', async () => {
      const result = await service.deploy('feature-1', '/path/to/repo');

      expect(result).toEqual({
        success: true,
        state: DeploymentState.Booting,
        analysis: DEPLOYABLE_ANALYSIS,
      });
    });

    it('should pass skipCache option to the agent', async () => {
      await service.deploy('feature-1', '/path/to/repo', { skipCache: true });

      expect(deps.devEnvironmentAgent.analyze).toHaveBeenCalledWith('/path/to/repo', {
        skipCache: true,
      });
    });

    it('should run setup commands before starting the dev server', async () => {
      const analysisWithSetup: DevEnvironmentAnalysis = {
        ...DEPLOYABLE_ANALYSIS,
        setupCommands: ['pnpm install'],
      };
      (deps.devEnvironmentAgent.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(
        analysisWithSetup
      );

      await service.deploy('feature-1', '/path/to/repo');

      expect(deps.execCommand).toHaveBeenCalledWith('pnpm install', '/path/to/repo');
      expect(deps.deploymentService.start).toHaveBeenCalled();
    });

    it('should run multiple setup commands in order', async () => {
      const analysisWithSetup: DevEnvironmentAnalysis = {
        ...DEPLOYABLE_ANALYSIS,
        setupCommands: ['pnpm install', 'pnpm generate'],
      };
      (deps.devEnvironmentAgent.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(
        analysisWithSetup
      );

      const callOrder: string[] = [];
      (deps.execCommand as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string) => {
        callOrder.push(cmd);
      });

      await service.deploy('feature-1', '/path/to/repo');

      expect(callOrder).toEqual(['pnpm install', 'pnpm generate']);
    });
  });

  describe('deploy - not deployable repo', () => {
    it('should return not-deployable result without starting deployment', async () => {
      (deps.devEnvironmentAgent.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(
        NOT_DEPLOYABLE_ANALYSIS
      );

      const result = await service.deploy('feature-1', '/path/to/cli-tool');

      expect(result).toEqual({
        success: false,
        error: 'This is a CLI utility with no web server or UI to start',
        analysis: NOT_DEPLOYABLE_ANALYSIS,
      });
      expect(deps.deploymentService.start).not.toHaveBeenCalled();
    });
  });

  describe('deploy - error handling', () => {
    it('should return error when agent analysis fails', async () => {
      (deps.devEnvironmentAgent.analyze as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Agent unavailable')
      );

      const result = await service.deploy('feature-1', '/path/to/repo');

      expect(result).toEqual({
        success: false,
        error: 'Agent unavailable',
      });
      expect(deps.deploymentService.start).not.toHaveBeenCalled();
    });

    it('should return error when deployment service start fails', async () => {
      (deps.deploymentService.start as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Failed to spawn process');
      });

      const result = await service.deploy('feature-1', '/path/to/repo');

      expect(result).toEqual({
        success: false,
        error: 'Failed to spawn process',
        analysis: DEPLOYABLE_ANALYSIS,
      });
    });

    it('should return error when setup command fails', async () => {
      const analysisWithSetup: DevEnvironmentAnalysis = {
        ...DEPLOYABLE_ANALYSIS,
        setupCommands: ['pnpm install'],
      };
      (deps.devEnvironmentAgent.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(
        analysisWithSetup
      );
      (deps.execCommand as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('pnpm install failed with exit code 1')
      );

      const result = await service.deploy('feature-1', '/path/to/repo');

      expect(result).toEqual({
        success: false,
        error: 'Setup command failed: pnpm install failed with exit code 1',
        analysis: analysisWithSetup,
      });
      expect(deps.deploymentService.start).not.toHaveBeenCalled();
    });

    it('should return error when analysis returns deployable but null command', async () => {
      const badAnalysis: DevEnvironmentAnalysis = {
        ...DEPLOYABLE_ANALYSIS,
        command: null,
      };
      (deps.devEnvironmentAgent.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(badAnalysis);

      const result = await service.deploy('feature-1', '/path/to/repo');

      expect(result).toEqual({
        success: false,
        error: 'Analysis marked repo as deployable but provided no command',
        analysis: badAnalysis,
      });
      expect(deps.deploymentService.start).not.toHaveBeenCalled();
    });
  });
});
