/**
 * Evidence Node Unit Tests
 *
 * Tests for the evidence collection node that invokes the agent executor
 * to capture screenshots, test outputs, and terminal recordings, then
 * parses Evidence[] from the agent's text output.
 *
 * Covers:
 * - Agent executor call with evidence prompt
 * - Evidence record parsing from agent output
 * - Graceful degradation on parse failure
 * - Resume support via completedPhases
 * - Phase marking on completion
 * - Error handling (re-throw for LangGraph checkpoint/resume)
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Suppress logger output
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

const {
  mockGetCompletedPhases,
  mockMarkPhaseComplete,
  mockRecordPhaseStart,
  mockRecordPhaseEnd,
  mockBuildEvidencePrompt,
  mockBuildEvidenceRetryPrompt,
  mockParseEvidenceRecords,
  mockValidateUiEvidenceHasAppProof,
  mockValidateEvidence,
  mockIsGraphBubbleUp,
  mockHasSettings,
  mockGetSettings,
  mockReadSpecFile,
} = vi.hoisted(() => ({
  mockGetCompletedPhases: vi.fn().mockReturnValue([]),
  mockMarkPhaseComplete: vi.fn(),
  mockRecordPhaseStart: vi.fn().mockResolvedValue('timing-456'),
  mockRecordPhaseEnd: vi.fn().mockResolvedValue(undefined),
  mockBuildEvidencePrompt: vi.fn().mockReturnValue('evidence collection prompt'),
  mockBuildEvidenceRetryPrompt: vi.fn().mockReturnValue('evidence retry prompt with feedback'),
  mockParseEvidenceRecords: vi.fn().mockReturnValue([]),
  mockValidateUiEvidenceHasAppProof: vi.fn().mockReturnValue({
    valid: true,
    hasScreenshots: false,
    hasAppScreenshots: false,
    hasOnlyStorybookScreenshots: false,
    warnings: [],
  }),
  mockValidateEvidence: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
  mockIsGraphBubbleUp: vi.fn().mockReturnValue(false),
  mockHasSettings: vi.fn().mockReturnValue(true),
  mockGetSettings: vi.fn().mockReturnValue({ workflow: { commitEvidence: false } }),
  mockReadSpecFile: vi.fn().mockReturnValue(''),
}));

// Mock LangGraph
vi.mock('@langchain/langgraph', () => ({
  isGraphBubbleUp: mockIsGraphBubbleUp,
}));

// Mock node-helpers
vi.mock('@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js', () => ({
  createNodeLogger: () => ({
    activate: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
  getCompletedPhases: mockGetCompletedPhases,
  markPhaseComplete: mockMarkPhaseComplete,
  saveEvidenceManifest: vi.fn(),
  readSpecFile: mockReadSpecFile,
  retryExecute: vi
    .fn()
    .mockImplementation(
      async (executor: { execute: (p: string) => Promise<unknown> }, prompt: string) => {
        return executor.execute(prompt);
      }
    ),
  buildExecutorOptions: vi.fn().mockReturnValue({ cwd: '/tmp/worktree', maxTurns: 5000 }),
}));

// Mock heartbeat
vi.mock('@/infrastructure/services/agents/feature-agent/heartbeat.js', () => ({
  reportNodeStart: vi.fn(),
}));

// Mock phase timing
vi.mock('@/infrastructure/services/agents/feature-agent/phase-timing-context.js', () => ({
  recordPhaseStart: mockRecordPhaseStart,
  recordPhaseEnd: mockRecordPhaseEnd,
  recordApprovalWaitStart: vi.fn().mockResolvedValue(undefined),
}));

// Mock lifecycle context
vi.mock('@/infrastructure/services/agents/feature-agent/lifecycle-context.js', () => ({
  updateNodeLifecycle: vi.fn().mockResolvedValue(undefined),
}));

// Mock evidence prompt builder
vi.mock('@/infrastructure/services/agents/feature-agent/nodes/prompts/evidence-prompts.js', () => ({
  buildEvidencePrompt: mockBuildEvidencePrompt,
  buildEvidenceRetryPrompt: mockBuildEvidenceRetryPrompt,
}));

// Mock evidence output parser
vi.mock('@/infrastructure/services/agents/feature-agent/nodes/evidence-output-parser.js', () => ({
  parseEvidenceRecords: mockParseEvidenceRecords,
  validateUiEvidenceHasAppProof: mockValidateUiEvidenceHasAppProof,
  validateEvidence: mockValidateEvidence,
}));

// Mock settings service
vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: mockHasSettings,
  getSettings: mockGetSettings,
}));

import { createEvidenceNode } from '@/infrastructure/services/agents/feature-agent/nodes/evidence.node.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { EvidenceType, type Evidence } from '@/domain/generated/output.js';
import type { ValidationError } from '@/infrastructure/services/agents/feature-agent/nodes/evidence-output-parser.js';

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as never,
    execute: vi.fn().mockResolvedValue({
      result: 'Captured evidence:\n```json\n[]\n```',
    }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

function baseState(overrides: Partial<FeatureAgentState> = {}): FeatureAgentState {
  return {
    featureId: 'feat-001',
    repositoryPath: '/tmp/repo',
    worktreePath: '/tmp/worktree',
    specDir: '/tmp/specs',
    currentNode: 'implement',
    error: null,
    messages: [],
    approvalGates: undefined,
    validationRetries: 0,
    lastValidationTarget: '',
    lastValidationErrors: [],
    prUrl: null,
    prNumber: null,
    commitHash: null,
    ciStatus: null,
    push: false,
    openPr: false,
    evidence: [],
    evidenceRetries: 0,
    enableEvidence: true,
    commitEvidence: false,
    ...overrides,
  } as FeatureAgentState;
}

const sampleEvidence: Evidence[] = [
  {
    type: EvidenceType.Screenshot,
    capturedAt: '2026-03-09T12:00:00Z',
    description: 'Homepage showing new feature',
    relativePath: '.shep/evidence/homepage.png',
    taskRef: 'task-1',
  },
  {
    type: EvidenceType.TestOutput,
    capturedAt: '2026-03-09T12:01:00Z',
    description: 'Unit tests passing',
    relativePath: '.shep/evidence/test-results.txt',
    taskRef: 'task-2',
  },
];

describe('createEvidenceNode', () => {
  let executor: IAgentExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = createMockExecutor();
  });

  // --- Agent executor calls ---
  describe('agent executor calls', () => {
    it('should call executor.execute with evidence prompt', async () => {
      const node = createEvidenceNode(executor);
      const state = baseState();
      await node(state);

      expect(mockBuildEvidencePrompt).toHaveBeenCalledWith(state, { commitEvidence: false });
      expect(executor.execute).toHaveBeenCalledWith('evidence collection prompt');
    });

    it('should pass executor options from buildExecutorOptions', async () => {
      const { retryExecute } = await import(
        '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js'
      );
      const node = createEvidenceNode(executor);
      await node(baseState());

      expect(retryExecute).toHaveBeenCalledWith(
        executor,
        'evidence collection prompt',
        { cwd: '/tmp/worktree', maxTurns: 5000 },
        expect.objectContaining({ logger: expect.anything() })
      );
    });
  });

  // --- Evidence parsing ---
  describe('evidence parsing', () => {
    it('should parse evidence records from executor result', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(mockParseEvidenceRecords).toHaveBeenCalledWith('Captured evidence:\n```json\n[]\n```');
      expect(result.evidence).toEqual(sampleEvidence);
    });

    it('should return evidence array in state update', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(result.evidence).toHaveLength(2);
      expect(result.evidence![0].type).toBe(EvidenceType.Screenshot);
      expect(result.evidence![1].type).toBe(EvidenceType.TestOutput);
    });

    it('should return empty evidence array when parser returns empty', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce([]);
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(result.evidence).toEqual([]);
    });
  });

  // --- State update shape ---
  describe('state update', () => {
    it('should return currentNode as evidence', async () => {
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(result.currentNode).toBe('evidence');
    });

    it('should return messages array with completion message', async () => {
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(result.messages).toBeDefined();
      expect(result.messages!.length).toBeGreaterThan(0);
      expect(result.messages!.some((m) => m.includes('[evidence]'))).toBe(true);
    });

    it('should include evidence count in completion message', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(result.messages!.some((m) => m.includes('2'))).toBe(true);
    });
  });

  // --- Graceful degradation (FR-8) ---
  describe('graceful degradation', () => {
    it('should return empty evidence when parseEvidenceRecords throws', async () => {
      mockParseEvidenceRecords.mockImplementationOnce(() => {
        throw new Error('JSON parse failure');
      });
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(result.evidence).toEqual([]);
      expect(result.currentNode).toBe('evidence');
    });

    it('should still mark phase complete when parsing fails', async () => {
      mockParseEvidenceRecords.mockImplementationOnce(() => {
        throw new Error('Parse failure');
      });
      const node = createEvidenceNode(executor);
      await node(baseState());

      expect(mockMarkPhaseComplete).toHaveBeenCalledWith(
        '/tmp/specs',
        'evidence',
        expect.anything()
      );
    });

    it('should include warning message when parsing fails', async () => {
      mockParseEvidenceRecords.mockImplementationOnce(() => {
        throw new Error('Parse failure');
      });
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(
        result.messages!.some(
          (m) => m.toLowerCase().includes('warning') || m.toLowerCase().includes('failed')
        )
      ).toBe(true);
    });
  });

  // --- Resume support ---
  describe('resume support', () => {
    it('should skip execution when evidence phase already in completedPhases', async () => {
      mockGetCompletedPhases.mockReturnValueOnce(['evidence']);
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(executor.execute).not.toHaveBeenCalled();
      expect(result.currentNode).toBe('evidence');
    });

    it('should return skip message when already completed', async () => {
      mockGetCompletedPhases.mockReturnValueOnce(['evidence']);
      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(result.messages!.some((m) => m.includes('evidence'))).toBe(true);
    });

    it('should execute normally when other phases are completed but not evidence', async () => {
      mockGetCompletedPhases.mockReturnValueOnce(['analyze', 'requirements', 'implement']);
      const node = createEvidenceNode(executor);
      await node(baseState());

      expect(executor.execute).toHaveBeenCalled();
    });
  });

  // --- Phase marking ---
  describe('phase completion marking', () => {
    it('should mark evidence phase complete after successful execution', async () => {
      const node = createEvidenceNode(executor);
      await node(baseState());

      expect(mockMarkPhaseComplete).toHaveBeenCalledWith(
        '/tmp/specs',
        'evidence',
        expect.anything()
      );
    });

    it('should record phase timing start and end with usage metadata', async () => {
      const node = createEvidenceNode(executor);
      await node(baseState());

      expect(mockRecordPhaseStart).toHaveBeenCalledWith(
        'evidence:attempt-1',
        expect.objectContaining({
          prompt: 'evidence collection prompt',
          agentType: 'claude-code',
        })
      );
      expect(mockRecordPhaseEnd).toHaveBeenCalledWith(
        'timing-456',
        expect.any(Number),
        expect.objectContaining({
          exitCode: 'success',
        })
      );
    });
  });

  // --- Error handling ---
  describe('error handling', () => {
    it('should re-throw GraphBubbleUp errors', async () => {
      const bubbleUpError = new Error('GraphBubbleUp');
      (executor.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(bubbleUpError);
      mockIsGraphBubbleUp.mockReturnValueOnce(true);

      const node = createEvidenceNode(executor);
      await expect(node(baseState())).rejects.toThrow('GraphBubbleUp');
    });

    it('should throw on non-retryable executor errors', async () => {
      (executor.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Process exited with code 1')
      );

      const node = createEvidenceNode(executor);
      await expect(node(baseState())).rejects.toThrow('Process exited with code 1');
    });

    it('should record phase timing even when executor fails', async () => {
      (executor.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Execution failed')
      );

      const node = createEvidenceNode(executor);
      await expect(node(baseState())).rejects.toThrow('Execution failed');

      expect(mockRecordPhaseStart).toHaveBeenCalledWith('evidence:attempt-1', expect.any(Object));
      expect(mockRecordPhaseEnd).toHaveBeenCalledWith(
        'timing-456',
        expect.any(Number),
        expect.objectContaining({
          exitCode: 'error',
          errorMessage: 'Execution failed',
        })
      );
    });

    it('should NOT mark phase complete when executor fails', async () => {
      (executor.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Execution failed')
      );

      const node = createEvidenceNode(executor);
      await expect(node(baseState())).rejects.toThrow('Execution failed');

      expect(mockMarkPhaseComplete).not.toHaveBeenCalled();
    });
  });

  // --- UI evidence app-level proof validation ---
  describe('ui evidence app-level proof validation', () => {
    it('should call validateUiEvidenceHasAppProof with parsed evidence', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      const node = createEvidenceNode(executor);
      await node(baseState());

      expect(mockValidateUiEvidenceHasAppProof).toHaveBeenCalledWith(sampleEvidence);
    });

    it('should include validation warnings in messages when storybook-only evidence detected', async () => {
      const storybookOnlyEvidence: Evidence[] = [
        {
          type: EvidenceType.Screenshot,
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Storybook: toggle component',
          relativePath: '.shep/evidence/storybook-toggle.png',
        },
      ];
      mockParseEvidenceRecords.mockReturnValueOnce(storybookOnlyEvidence);
      mockValidateUiEvidenceHasAppProof.mockReturnValueOnce({
        valid: false,
        hasScreenshots: true,
        hasAppScreenshots: false,
        hasOnlyStorybookScreenshots: true,
        warnings: [
          'UI evidence contains only Storybook screenshots. App-level screenshots from the running application are REQUIRED for UI features.',
        ],
      });

      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      expect(result.messages!.some((m) => m.includes('Storybook'))).toBe(true);
      expect(result.messages!.some((m) => m.includes('REQUIRED'))).toBe(true);
    });

    it('should not include validation warnings when app-level evidence is present', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      mockValidateUiEvidenceHasAppProof.mockReturnValueOnce({
        valid: true,
        hasScreenshots: true,
        hasAppScreenshots: true,
        hasOnlyStorybookScreenshots: false,
        warnings: [],
      });

      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      const validationWarnings = result.messages!.filter(
        (m) => m.includes('Storybook') || m.includes('app-level')
      );
      expect(validationWarnings).toHaveLength(0);
    });

    it('should still return evidence even when validation warns about storybook-only', async () => {
      const storybookEvidence: Evidence[] = [
        {
          type: EvidenceType.Screenshot,
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Storybook: component view',
          relativePath: '.shep/evidence/storybook.png',
        },
      ];
      mockParseEvidenceRecords.mockReturnValueOnce(storybookEvidence);
      mockValidateUiEvidenceHasAppProof.mockReturnValueOnce({
        valid: false,
        hasScreenshots: true,
        hasAppScreenshots: false,
        hasOnlyStorybookScreenshots: true,
        warnings: ['UI evidence contains only Storybook screenshots.'],
      });

      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      // Evidence is still returned (validation is informational, not blocking)
      expect(result.evidence).toEqual(storybookEvidence);
      expect(result.evidence).toHaveLength(1);
    });
  });

  // --- No approval gate ---
  describe('no approval gate', () => {
    it('should not import or use interrupt (evidence always runs automatically)', async () => {
      // Evidence node does not call shouldInterrupt or interrupt — verify by checking
      // that it completes without any interrupt-related state changes
      const node = createEvidenceNode(executor);
      const result = await node(
        baseState({ approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false } })
      );

      // Node should complete normally without interrupting
      expect(result.currentNode).toBe('evidence');
      expect(result._needsReexecution).toBe(false);
      // _approvalAction should not be set (evidence doesn't use approval gates)
      expect(result._approvalAction).toBeUndefined();
    });
  });

  // --- Evidence validation retry loop ---
  describe('evidence validation retry loop', () => {
    const validationErrors: ValidationError[] = [
      {
        type: 'ui',
        taskId: 'task-1',
        taskTitle: 'Add toggle component',
        message: "Missing app-level screenshot for task-1 (UI task 'Add toggle component').",
      },
    ];

    const tasksYaml = `tasks:
  - id: task-1
    title: Add toggle component
    description: Add toggle component to settings page
    acceptanceCriteria: []`;

    beforeEach(() => {
      // Default: tasks.yaml content available for validation
      mockReadSpecFile.mockImplementation((specDir: string, filename: string) => {
        if (filename === 'tasks.yaml') return tasksYaml;
        return '';
      });
    });

    it('should call validateEvidence after parsing evidence on first attempt', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      await node(baseState());

      // The worktree is passed so repo-relative evidence paths resolve against
      // the directory the agent ran in, not the daemon's process.cwd().
      expect(mockValidateEvidence).toHaveBeenCalledWith(
        sampleEvidence,
        expect.any(Array),
        '/tmp/worktree'
      );
    });

    it('should not retry when validation passes on first attempt', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      await node(baseState());

      // Agent should only be called once (no retry)
      expect(executor.execute).toHaveBeenCalledTimes(1);
      // Single phase activity recorded
      expect(mockRecordPhaseStart).toHaveBeenCalledTimes(1);
      expect(mockRecordPhaseStart).toHaveBeenCalledWith('evidence:attempt-1', expect.any(Object));
      expect(mockRecordPhaseEnd).toHaveBeenCalledTimes(1);
    });

    it('should retry when validation fails on first attempt and succeed on second', async () => {
      const attempt1Evidence: Evidence[] = [
        {
          type: EvidenceType.TestOutput,
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Test results only',
          relativePath: '.shep/evidence/tests.txt',
        },
      ];
      const attempt2Evidence: Evidence[] = [
        {
          type: EvidenceType.Screenshot,
          capturedAt: '2026-03-09T12:01:00Z',
          description: 'App: settings page with toggle',
          relativePath: '.shep/evidence/app-settings.png',
        },
      ];

      // First attempt: parse returns insufficient evidence, validation fails
      mockParseEvidenceRecords.mockReturnValueOnce(attempt1Evidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      // Second attempt: parse returns good evidence, validation passes
      mockParseEvidenceRecords.mockReturnValueOnce(attempt2Evidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      await node(baseState());

      // Agent called twice
      expect(executor.execute).toHaveBeenCalledTimes(2);
      // Two phase activities recorded
      expect(mockRecordPhaseStart).toHaveBeenCalledTimes(2);
      expect(mockRecordPhaseStart).toHaveBeenNthCalledWith(
        1,
        'evidence:attempt-1',
        expect.any(Object)
      );
      expect(mockRecordPhaseStart).toHaveBeenNthCalledWith(
        2,
        'evidence:attempt-2',
        expect.any(Object)
      );
      expect(mockRecordPhaseEnd).toHaveBeenCalledTimes(2);
    });

    it('should use buildEvidenceRetryPrompt with validation errors on retry', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce([]);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      const state = baseState();
      await node(state);

      // First attempt uses base prompt
      expect(mockBuildEvidencePrompt).toHaveBeenCalled();
      // Second attempt uses retry prompt with validation errors
      expect(mockBuildEvidenceRetryPrompt).toHaveBeenCalledWith(
        state,
        validationErrors,
        expect.objectContaining({ commitEvidence: false })
      );
      // Second executor call uses the retry prompt
      expect(executor.execute).toHaveBeenNthCalledWith(2, 'evidence retry prompt with feedback');
    });

    it('should gracefully degrade after exhausting all 3 retry attempts', async () => {
      const insufficientEvidence: Evidence[] = [
        {
          type: EvidenceType.TestOutput,
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Test results only',
          relativePath: '.shep/evidence/tests.txt',
        },
      ];

      // All 3 attempts fail validation
      for (let i = 0; i < 3; i++) {
        mockParseEvidenceRecords.mockReturnValueOnce(insufficientEvidence);
        mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });
      }

      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      // Should NOT throw — graceful degradation
      expect(result.currentNode).toBe('evidence');
      // Returns whatever evidence was captured
      expect(result.evidence).toBeDefined();
      // Includes validation warning messages
      expect(result.messages!.some((m) => m.includes('Validation failed'))).toBe(true);
      // Agent called 3 times (initial + 2 retries)
      expect(executor.execute).toHaveBeenCalledTimes(3);
      // 3 phase activities recorded
      expect(mockRecordPhaseStart).toHaveBeenCalledTimes(3);
      expect(mockRecordPhaseStart).toHaveBeenNthCalledWith(
        1,
        'evidence:attempt-1',
        expect.any(Object)
      );
      expect(mockRecordPhaseStart).toHaveBeenNthCalledWith(
        2,
        'evidence:attempt-2',
        expect.any(Object)
      );
      expect(mockRecordPhaseStart).toHaveBeenNthCalledWith(
        3,
        'evidence:attempt-3',
        expect.any(Object)
      );
      expect(mockRecordPhaseEnd).toHaveBeenCalledTimes(3);
    });

    it('should record phase end after each attempt regardless of success or failure', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce([]);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      await node(baseState());

      // recordPhaseEnd called after each attempt
      expect(mockRecordPhaseEnd).toHaveBeenCalledTimes(2);
      // Both calls pass a timing ID, duration, and metadata
      expect(mockRecordPhaseEnd).toHaveBeenNthCalledWith(
        1,
        'timing-456',
        expect.any(Number),
        expect.any(Object)
      );
      expect(mockRecordPhaseEnd).toHaveBeenNthCalledWith(
        2,
        'timing-456',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should update evidenceRetries state with attempt count', async () => {
      mockParseEvidenceRecords.mockReturnValueOnce([]);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      // evidenceRetries should reflect the number of attempts
      expect(result.evidenceRetries).toBe(2);
    });

    it('should preserve evidence from all attempts (accumulate reducer)', async () => {
      const attempt1Evidence: Evidence[] = [
        {
          type: EvidenceType.TestOutput,
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Test results',
          relativePath: '.shep/evidence/tests.txt',
        },
      ];
      const attempt2Evidence: Evidence[] = [
        {
          type: EvidenceType.Screenshot,
          capturedAt: '2026-03-09T12:01:00Z',
          description: 'App: settings page screenshot',
          relativePath: '.shep/evidence/app-settings.png',
        },
      ];

      mockParseEvidenceRecords.mockReturnValueOnce(attempt1Evidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      mockParseEvidenceRecords.mockReturnValueOnce(attempt2Evidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      // Evidence from both attempts should be in the result
      expect(result.evidence).toHaveLength(2);
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ description: 'Test results' }),
          expect.objectContaining({ description: 'App: settings page screenshot' }),
        ])
      );
    });

    it('should deduplicate evidence when retries recapture the same files', async () => {
      const sharedEvidence: Evidence[] = [
        {
          type: EvidenceType.TestOutput,
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Test results',
          relativePath: '.shep/evidence/tests.txt',
        },
      ];
      const attempt2Evidence: Evidence[] = [
        // Same file recaptured with updated description
        {
          type: EvidenceType.TestOutput,
          capturedAt: '2026-03-09T12:01:00Z',
          description: 'Test results (updated)',
          relativePath: '.shep/evidence/tests.txt',
        },
        // New file only in attempt 2
        {
          type: EvidenceType.Screenshot,
          capturedAt: '2026-03-09T12:01:00Z',
          description: 'App screenshot',
          relativePath: '.shep/evidence/app.png',
        },
      ];

      mockParseEvidenceRecords.mockReturnValueOnce(sharedEvidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      mockParseEvidenceRecords.mockReturnValueOnce(attempt2Evidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      // Should have 2 unique entries, not 3 (the duplicate test.txt is deduplicated)
      expect(result.evidence).toHaveLength(2);
      // The later attempt's version wins for the duplicate
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'Test results (updated)',
            relativePath: '.shep/evidence/tests.txt',
          }),
          expect.objectContaining({
            description: 'App screenshot',
            relativePath: '.shep/evidence/app.png',
          }),
        ])
      );
    });

    it('should call markPhaseComplete only once after loop completes', async () => {
      // Two attempts: fail then succeed
      mockParseEvidenceRecords.mockReturnValueOnce([]);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      mockParseEvidenceRecords.mockReturnValueOnce(sampleEvidence);
      mockValidateEvidence.mockResolvedValueOnce({ valid: true, errors: [] });

      const node = createEvidenceNode(executor);
      await node(baseState());

      expect(mockMarkPhaseComplete).toHaveBeenCalledTimes(1);
      expect(mockMarkPhaseComplete).toHaveBeenCalledWith(
        '/tmp/specs',
        'evidence',
        expect.anything()
      );
    });

    it('should call markPhaseComplete after exhausting retries (graceful degradation)', async () => {
      for (let i = 0; i < 3; i++) {
        mockParseEvidenceRecords.mockReturnValueOnce([]);
        mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });
      }

      const node = createEvidenceNode(executor);
      await node(baseState());

      // markPhaseComplete should still be called even after exhausted retries
      expect(mockMarkPhaseComplete).toHaveBeenCalledTimes(1);
      expect(mockMarkPhaseComplete).toHaveBeenCalledWith(
        '/tmp/specs',
        'evidence',
        expect.anything()
      );
    });

    it('should respect configurable max retries from settings', async () => {
      // Configure 2 retries (instead of default 3)
      mockGetSettings.mockReturnValue({ workflow: { commitEvidence: false, evidenceRetries: 2 } });

      mockParseEvidenceRecords.mockReturnValueOnce([]);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      mockParseEvidenceRecords.mockReturnValueOnce([]);
      mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });

      const node = createEvidenceNode(executor);
      await node(baseState());

      // Only 2 attempts (not 3)
      expect(executor.execute).toHaveBeenCalledTimes(2);
      expect(mockRecordPhaseStart).toHaveBeenCalledTimes(2);
    });

    it('should log ERROR level warnings when retries are exhausted', async () => {
      for (let i = 0; i < 3; i++) {
        mockParseEvidenceRecords.mockReturnValueOnce([]);
        mockValidateEvidence.mockResolvedValueOnce({ valid: false, errors: validationErrors });
      }

      const node = createEvidenceNode(executor);
      const result = await node(baseState());

      // Messages should contain error-level validation warnings
      const warningMessages = result.messages!.filter(
        (m) => m.includes('Validation failed') || m.includes('Warning')
      );
      expect(warningMessages.length).toBeGreaterThan(0);
    });
  });
});
