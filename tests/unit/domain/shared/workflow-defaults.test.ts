/**
 * Feature workflow defaults (spec 149): the build mode, approval gates, push
 * and PR choices a user set in Settings, as feature-creation input. One place,
 * shared by `shep feat new` and creators that opt in (A2A, MCP).
 */

import { describe, it, expect } from 'vitest';
import { BuildMode } from '@/domain/generated/output.js';
import type { Settings } from '@/domain/generated/output.js';
import { featureWorkflowDefaults } from '@/domain/shared/workflow-defaults.js';

function settings(workflow: Record<string, unknown>): Settings {
  return {
    workflow: {
      openPrOnImplementationComplete: false,
      defaultMode: 'Fast',
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
      ...workflow,
    },
  } as unknown as Settings;
}

describe('featureWorkflowDefaults', () => {
  it("reads the user's gates, push and PR choices", () => {
    expect(
      featureWorkflowDefaults(
        settings({
          openPrOnImplementationComplete: true,
          approvalGateDefaults: {
            allowPrd: true,
            allowPlan: false,
            allowMerge: true,
            pushOnImplementationComplete: true,
          },
        })
      )
    ).toEqual({
      approvalGates: { allowPrd: true, allowPlan: false, allowMerge: true },
      push: true,
      openPr: true,
      buildMode: BuildMode.Fast,
    });
  });

  it('normalizes the legacy mode labels settings persist', () => {
    expect(featureWorkflowDefaults(settings({ defaultMode: 'Fast' })).buildMode).toBe(
      BuildMode.Fast
    );
    expect(featureWorkflowDefaults(settings({ defaultMode: 'Regular' })).buildMode).toBe(
      BuildMode.Spec
    );
    expect(featureWorkflowDefaults(settings({ defaultMode: 'Exploration' })).buildMode).toBe(
      BuildMode.Exploration
    );
  });
});
