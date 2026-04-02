import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompleteOnboardingUseCase } from '@/application/use-cases/settings/complete-onboarding.use-case.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { Settings } from '@/domain/generated/output.js';
import { AgentType, AgentAuthMethod, EditorType, TerminalType } from '@/domain/generated/output.js';

function createTestSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: 'singleton',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    models: {
      default: 'claude-sonnet-4-6',
    },
    user: {},
    environment: {
      defaultEditor: EditorType.VsCode,
      shellPreference: 'bash',
      terminalPreference: TerminalType.System,
    },
    system: { autoUpdate: true, logLevel: 'info' },
    agent: {
      type: AgentType.ClaudeCode,
      authMethod: AgentAuthMethod.Session,
    },
    notifications: {
      inApp: { enabled: true },
      browser: { enabled: true },
      desktop: { enabled: true },
      events: {
        agentStarted: true,
        phaseCompleted: true,
        waitingApproval: true,
        agentCompleted: true,
        agentFailed: true,
        prMerged: true,
        prClosed: true,
        prChecksPassed: true,
        prChecksFailed: true,
        prBlocked: true,
        mergeReviewReady: true,
      },
    },
    workflow: {
      openPrOnImplementationComplete: false,
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
      enableEvidence: false,
      commitEvidence: false,
      ciWatchEnabled: true,
      defaultMode: 'Fast',
    },
    onboardingComplete: false,
    ...overrides,
  };
}

describe('CompleteOnboardingUseCase', () => {
  let useCase: CompleteOnboardingUseCase;
  let mockRepository: ISettingsRepository;

  beforeEach(() => {
    mockRepository = {
      initialize: vi.fn(),
      load: vi.fn(),
      update: vi.fn(),
    };
    useCase = new CompleteOnboardingUseCase(mockRepository);
  });

  it('should persist settings with onboardingComplete=true', async () => {
    const existingSettings = createTestSettings({ onboardingComplete: false });
    vi.mocked(mockRepository.load).mockResolvedValue(existingSettings);
    vi.mocked(mockRepository.update).mockResolvedValue();

    const result = await useCase.execute({
      agent: { type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session },
      ide: 'vscode',
      workflowDefaults: {
        allowPrd: true,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
        openPrOnImplementationComplete: false,
      },
    });

    expect(result.onboardingComplete).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledOnce();
  });

  it('should merge agent config from input into settings', async () => {
    const existingSettings = createTestSettings();
    vi.mocked(mockRepository.load).mockResolvedValue(existingSettings);
    vi.mocked(mockRepository.update).mockResolvedValue();

    const result = await useCase.execute({
      agent: { type: AgentType.Cursor, authMethod: AgentAuthMethod.Token, token: 'test-key' },
      ide: 'vscode',
      workflowDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
        openPrOnImplementationComplete: false,
      },
    });

    expect(result.agent.type).toBe(AgentType.Cursor);
    expect(result.agent.authMethod).toBe(AgentAuthMethod.Token);
    expect(result.agent.token).toBe('test-key');
  });

  it('should merge IDE from input into settings', async () => {
    const existingSettings = createTestSettings();
    vi.mocked(mockRepository.load).mockResolvedValue(existingSettings);
    vi.mocked(mockRepository.update).mockResolvedValue();

    const result = await useCase.execute({
      agent: { type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session },
      ide: 'cursor',
      workflowDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
        openPrOnImplementationComplete: false,
      },
    });

    expect(result.environment.defaultEditor).toBe('cursor');
  });

  it('should merge workflow defaults from input into settings', async () => {
    const existingSettings = createTestSettings();
    vi.mocked(mockRepository.load).mockResolvedValue(existingSettings);
    vi.mocked(mockRepository.update).mockResolvedValue();

    const result = await useCase.execute({
      agent: { type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session },
      ide: 'vscode',
      workflowDefaults: {
        allowPrd: true,
        allowPlan: true,
        allowMerge: false,
        pushOnImplementationComplete: true,
        openPrOnImplementationComplete: true,
      },
    });

    expect(result.workflow.approvalGateDefaults.allowPrd).toBe(true);
    expect(result.workflow.approvalGateDefaults.allowPlan).toBe(true);
    expect(result.workflow.approvalGateDefaults.allowMerge).toBe(false);
    expect(result.workflow.approvalGateDefaults.pushOnImplementationComplete).toBe(true);
    expect(result.workflow.openPrOnImplementationComplete).toBe(true);
  });

  it('should throw error when settings not found', async () => {
    vi.mocked(mockRepository.load).mockResolvedValue(null);

    await expect(
      useCase.execute({
        agent: { type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session },
        ide: 'vscode',
        workflowDefaults: {
          allowPrd: false,
          allowPlan: false,
          allowMerge: false,
          pushOnImplementationComplete: false,
          openPrOnImplementationComplete: false,
        },
      })
    ).rejects.toThrow();
  });

  it('should set updatedAt to current time', async () => {
    const existingSettings = createTestSettings();
    vi.mocked(mockRepository.load).mockResolvedValue(existingSettings);
    vi.mocked(mockRepository.update).mockResolvedValue();

    const before = new Date();
    const result = await useCase.execute({
      agent: { type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session },
      ide: 'vscode',
      workflowDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
        openPrOnImplementationComplete: false,
      },
    });
    const after = new Date();

    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
