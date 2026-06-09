/**
 * _serve Command - Workflow Scheduler Integration Tests
 *
 * Tests that the daemon _serve command initializes and stops
 * the WorkflowSchedulerService alongside existing services.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mock factories ---
const {
  mockWebServerStart,
  mockWebServerStop,
  mockDeploymentStopAll,
  mockSchedulerStart,
  mockSchedulerStop,
} = vi.hoisted(() => ({
  mockWebServerStart: vi.fn().mockResolvedValue(undefined),
  mockWebServerStop: vi.fn().mockResolvedValue(undefined),
  mockDeploymentStopAll: vi.fn(),
  mockSchedulerStart: vi.fn().mockResolvedValue(undefined),
  mockSchedulerStop: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: unknown) => {
      if (typeof token === 'function') return { execute: vi.fn().mockResolvedValue({}) };
      if (token === 'IVersionService') {
        return {
          getVersion: vi.fn().mockReturnValue({
            version: '1.0.0',
            name: '@shepai/cli',
            description: 'Test',
          }),
        };
      }
      if (token === 'IWebServerService') {
        return { start: mockWebServerStart, stop: mockWebServerStop };
      }
      if (token === 'IDeploymentService') return { stopAll: mockDeploymentStopAll };
      if (
        token === 'IAgentRunRepository' ||
        token === 'IPhaseTimingRepository' ||
        token === 'IFeatureRepository' ||
        token === 'INotificationService' ||
        token === 'IWorkflowRepository' ||
        token === 'IWorkflowExecutionRepository' ||
        token === 'IClock'
      ) {
        return {};
      }
      throw new Error(`Unknown token: ${String(token)}`);
    }),
  },
}));

vi.mock('@/infrastructure/services/version.service.js', () => ({
  setVersionEnvVars: vi.fn(),
}));

vi.mock('@/infrastructure/services/web-server.service.js', () => ({
  resolveWebDir: vi.fn().mockReturnValue({ dir: '/mock/web/dir', dev: false }),
}));

vi.mock('@/infrastructure/services/notifications/notification-watcher.service.js', () => ({
  initializeNotificationWatcher: vi.fn(),
  getNotificationWatcher: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('@/infrastructure/services/workflow-scheduler/workflow-scheduler.service.js', () => ({
  initializeWorkflowScheduler: vi.fn(),
  getWorkflowScheduler: vi.fn().mockReturnValue({
    start: mockSchedulerStart,
    stop: mockSchedulerStop,
  }),
  hasWorkflowScheduler: vi.fn().mockReturnValue(true),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: vi.fn().mockReturnValue(true),
  getSettings: vi.fn().mockReturnValue({
    featureFlags: { scheduledWorkflows: true },
  }),
}));

import {
  initializeWorkflowScheduler,
  getWorkflowScheduler,
} from '@/infrastructure/services/workflow-scheduler/workflow-scheduler.service.js';
import { createServeCommand } from '../../../../../../src/presentation/cli/commands/_serve.command.js';

describe('_serve command - scheduler integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes the workflow scheduler on startup', async () => {
    const cmd = createServeCommand();
    await cmd.parseAsync(['--port', '4050'], { from: 'user' });

    expect(initializeWorkflowScheduler).toHaveBeenCalledOnce();
  });

  it('starts the workflow scheduler after initialization', async () => {
    const cmd = createServeCommand();
    await cmd.parseAsync(['--port', '4050'], { from: 'user' });

    expect(mockSchedulerStart).toHaveBeenCalledOnce();
  });

  it('stops the workflow scheduler on shutdown', async () => {
    const handlers: Record<string, () => Promise<void>> = {};
    vi.spyOn(process, 'on').mockImplementation(
      (event: string | symbol, listener: (...args: unknown[]) => void) => {
        handlers[String(event)] = listener as () => Promise<void>;
        return process;
      }
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const cmd = createServeCommand();
    await cmd.parseAsync(['--port', '4050'], { from: 'user' });

    await handlers['SIGTERM']?.();

    const scheduler = getWorkflowScheduler();
    expect(scheduler.stop).toHaveBeenCalledOnce();

    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
