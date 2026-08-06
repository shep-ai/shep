// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSettings = vi.fn();
vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  getSettings: mockGetSettings,
}));

const { getWorkflowDefaults } = await import(
  '../../../../../src/presentation/web/app/actions/get-workflow-defaults.js'
);

describe('getWorkflowDefaults server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps workflow settings to drawer defaults', async () => {
    mockGetSettings.mockReturnValue({
      workflow: {
        openPrOnImplementationComplete: true,
        defaultMode: 'Fast',
        ciWatchEnabled: true,
        enableEvidence: true,
        commitEvidence: true,
        approvalGateDefaults: {
          allowPrd: true,
          allowPlan: false,
          allowMerge: true,
          pushOnImplementationComplete: true,
        },
        skillInjection: { enabled: true, skills: [] },
      },
    });

    const result = await getWorkflowDefaults();

    expect(result).toEqual({
      approvalGates: {
        allowPrd: true,
        allowPlan: false,
        allowMerge: true,
      },
      push: true,
      openPr: true,
      ciWatchEnabled: true,
      enableEvidence: true,
      commitEvidence: true,
      defaultMode: 'fast',
      injectSkills: true,
    });
  });

  it('normalizes the legacy Regular label onto the spec BuildMode', async () => {
    mockGetSettings.mockReturnValue({
      workflow: {
        openPrOnImplementationComplete: false,
        defaultMode: 'Regular',
        ciWatchEnabled: false,
        enableEvidence: false,
        commitEvidence: false,
        approvalGateDefaults: {
          allowPrd: false,
          allowPlan: false,
          allowMerge: false,
          pushOnImplementationComplete: false,
        },
        skillInjection: { enabled: false, skills: [] },
      },
    });

    const result = await getWorkflowDefaults();

    expect(result).toEqual({
      approvalGates: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
      },
      push: false,
      openPr: false,
      ciWatchEnabled: false,
      enableEvidence: false,
      commitEvidence: false,
      defaultMode: 'spec',
      injectSkills: false,
    });
  });

  it('falls back to the fast BuildMode when defaultMode is missing or unknown', async () => {
    const workflow = {
      openPrOnImplementationComplete: false,
      ciWatchEnabled: false,
      enableEvidence: false,
      commitEvidence: false,
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
    };

    mockGetSettings.mockReturnValue({ workflow });
    expect((await getWorkflowDefaults()).defaultMode).toBe('fast');

    mockGetSettings.mockReturnValue({ workflow: { ...workflow, defaultMode: 'Nonsense' } });
    expect((await getWorkflowDefaults()).defaultMode).toBe('fast');
  });

  it('passes canonical BuildMode values through untouched', async () => {
    mockGetSettings.mockReturnValue({
      workflow: {
        openPrOnImplementationComplete: false,
        defaultMode: 'exploration',
        ciWatchEnabled: false,
        enableEvidence: false,
        commitEvidence: false,
        approvalGateDefaults: {
          allowPrd: false,
          allowPlan: false,
          allowMerge: false,
          pushOnImplementationComplete: false,
        },
      },
    });

    expect((await getWorkflowDefaults()).defaultMode).toBe('exploration');
  });

  it('maps pushOnImplementationComplete to push field', async () => {
    mockGetSettings.mockReturnValue({
      workflow: {
        openPrOnImplementationComplete: false,
        approvalGateDefaults: {
          allowPrd: false,
          allowPlan: false,
          allowMerge: false,
          pushOnImplementationComplete: true,
        },
        ciWatchEnabled: false,
        enableEvidence: false,
        commitEvidence: false,
      },
    });

    const result = await getWorkflowDefaults();

    expect(result.push).toBe(true);
    expect(result.openPr).toBe(false);
  });

  it('maps openPrOnImplementationComplete to openPr field', async () => {
    mockGetSettings.mockReturnValue({
      workflow: {
        openPrOnImplementationComplete: true,
        approvalGateDefaults: {
          allowPrd: false,
          allowPlan: false,
          allowMerge: false,
          pushOnImplementationComplete: false,
        },
        ciWatchEnabled: false,
        enableEvidence: false,
        commitEvidence: false,
      },
    });

    const result = await getWorkflowDefaults();

    expect(result.push).toBe(false);
    expect(result.openPr).toBe(true);
  });
});
