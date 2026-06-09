/**
 * Messaging Command Executor Unit Tests
 *
 * Tests for the command executor that maps inbound messaging commands
 * to existing Shep use case invocations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagingCommandExecutor } from '@/infrastructure/services/messaging/command-executor.js';
import type { MessagingCommand, Feature } from '@/domain/generated/output.js';
import {
  MessagingFrameType,
  MessagingPlatform,
  MessagingCommandType,
} from '@/domain/generated/output.js';

function createCommand(overrides: Partial<MessagingCommand> = {}): MessagingCommand {
  return {
    type: MessagingFrameType.Command,
    command: MessagingCommandType.Help,
    chatId: 'chat-123',
    platform: MessagingPlatform.Telegram,
    ...overrides,
  };
}

function createMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'abcdef12-3456-7890-abcd-ef1234567890',
    name: 'Test Feature',
    userQuery: 'test query',
    slug: 'test-feature',
    description: 'Test description',
    repositoryPath: '/test/path',
    branch: 'feat/test',
    lifecycle: 'requirements',
    messages: [],
    relatedArtifacts: [],
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Feature;
}

describe('MessagingCommandExecutor', () => {
  let executor: MessagingCommandExecutor;
  let mockFeatureRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByIdPrefix: ReturnType<typeof vi.fn>;
  };
  let mockCreateFeature: { execute: ReturnType<typeof vi.fn> };
  let mockApproveAgentRun: { execute: ReturnType<typeof vi.fn> };
  let mockRejectAgentRun: { execute: ReturnType<typeof vi.fn> };
  let mockStopAgentRun: { execute: ReturnType<typeof vi.fn> };
  let mockResumeFeature: { execute: ReturnType<typeof vi.fn> };
  let mockListFeatures: { execute: ReturnType<typeof vi.fn> };
  let mockShowFeature: { execute: ReturnType<typeof vi.fn> };
  let mockListRepositories: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFeatureRepo = {
      findById: vi.fn().mockResolvedValue(null),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
    };
    mockCreateFeature = { execute: vi.fn() };
    mockApproveAgentRun = { execute: vi.fn() };
    mockRejectAgentRun = { execute: vi.fn() };
    mockStopAgentRun = { execute: vi.fn() };
    mockResumeFeature = { execute: vi.fn() };
    mockListFeatures = { execute: vi.fn() };
    mockShowFeature = { execute: vi.fn() };
    mockListRepositories = { execute: vi.fn() };

    executor = new MessagingCommandExecutor(
      mockFeatureRepo as any,
      mockCreateFeature as any,
      mockApproveAgentRun as any,
      mockRejectAgentRun as any,
      mockStopAgentRun as any,
      mockResumeFeature as any,
      mockListFeatures as any,
      mockShowFeature as any,
      mockListRepositories as any
    );
  });

  describe('help command', () => {
    it('should return help text', async () => {
      const result = await executor.execute(createCommand({ command: MessagingCommandType.Help }));
      expect(result).toContain('/new');
      expect(result).toContain('/approve');
      expect(result).toContain('/status');
    });
  });

  describe('status command', () => {
    it('should return "No active features" when list is empty', async () => {
      mockListFeatures.execute.mockResolvedValue([]);
      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Status })
      );
      expect(result).toBe('No active features.');
    });

    it('should list features with short IDs', async () => {
      mockListFeatures.execute.mockResolvedValue([
        createMockFeature({
          id: 'abcdef12-rest',
          name: 'Feature One',
          lifecycle: 'implement' as any,
        }),
      ]);
      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Status })
      );
      expect(result).toContain('#abcdef12');
      expect(result).toContain('Feature One');
      expect(result).toContain('implement');
    });

    it('should show single feature detail when featureId is provided', async () => {
      const feature = createMockFeature({
        id: 'abcdef12-rest',
        name: 'My Feature',
        lifecycle: 'plan' as any,
      });
      mockShowFeature.execute.mockResolvedValue(feature);

      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Status, featureId: 'abcdef12' })
      );
      expect(result).toContain('#abcdef12');
      expect(result).toContain('My Feature');
    });
  });

  describe('approve command', () => {
    it('should return usage when no featureId', async () => {
      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Approve })
      );
      expect(result).toContain('Usage');
    });

    it('should return not found when feature does not exist', async () => {
      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Approve, featureId: 'abc123' })
      );
      expect(result).toContain('not found');
    });

    it('should approve when feature has active agent run', async () => {
      const feature = createMockFeature({ agentRunId: 'run-456' });
      mockFeatureRepo.findById.mockResolvedValue(feature);
      mockApproveAgentRun.execute.mockResolvedValue({ approved: true, reason: '' });

      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Approve, featureId: feature.id })
      );
      expect(result).toContain('Approved');
      expect(mockApproveAgentRun.execute).toHaveBeenCalledWith('run-456');
    });

    it('should return error when feature has no agent run', async () => {
      const feature = createMockFeature({ agentRunId: undefined });
      mockFeatureRepo.findById.mockResolvedValue(feature);

      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Approve, featureId: feature.id })
      );
      expect(result).toContain('no active agent run');
    });
  });

  describe('reject command', () => {
    it('should reject with feedback', async () => {
      const feature = createMockFeature({ agentRunId: 'run-789' });
      mockFeatureRepo.findById.mockResolvedValue(feature);
      mockRejectAgentRun.execute.mockResolvedValue({ rejected: true, reason: '' });

      const result = await executor.execute(
        createCommand({
          command: MessagingCommandType.Reject,
          featureId: feature.id,
          args: 'need error handling',
        })
      );
      expect(result).toContain('Rejected');
      expect(result).toContain('with feedback');
      expect(mockRejectAgentRun.execute).toHaveBeenCalledWith('run-789', 'need error handling');
    });
  });

  describe('stop command', () => {
    it('should stop agent run', async () => {
      const feature = createMockFeature({ agentRunId: 'run-999' });
      mockFeatureRepo.findById.mockResolvedValue(feature);
      mockStopAgentRun.execute.mockResolvedValue({ stopped: true, reason: '' });

      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Stop, featureId: feature.id })
      );
      expect(result).toContain('Stopped');
    });
  });

  describe('new command', () => {
    it('should return usage when no args', async () => {
      const result = await executor.execute(createCommand({ command: MessagingCommandType.New }));
      expect(result).toContain('Usage');
    });

    it('should return error when no repositories configured', async () => {
      mockListRepositories.execute.mockResolvedValue([]);
      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.New, args: 'add healthcheck' })
      );
      expect(result).toContain('No repositories configured');
    });

    it('should create feature when repository exists', async () => {
      mockListRepositories.execute.mockResolvedValue([{ path: '/test/repo' }]);
      mockCreateFeature.execute.mockResolvedValue({
        feature: createMockFeature({ id: 'newid123-rest' }),
      });

      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.New, args: 'add healthcheck' })
      );
      expect(result).toContain('Started');
      expect(result).toContain('#newid123');
    });
  });

  describe('resume command', () => {
    it('should resume a feature', async () => {
      mockResumeFeature.execute.mockResolvedValue({
        feature: createMockFeature(),
        newRun: {},
      });

      const result = await executor.execute(
        createCommand({ command: MessagingCommandType.Resume, featureId: 'abc123' })
      );
      expect(result).toContain('Resumed');
    });
  });

  describe('unknown command', () => {
    it('should return unknown command message', async () => {
      const result = await executor.execute(createCommand({ command: 'nonexistent' as any }));
      expect(result).toContain('Unknown command');
    });
  });
});
