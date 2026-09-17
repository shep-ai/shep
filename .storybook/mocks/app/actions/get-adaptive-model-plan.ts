export interface GetAdaptiveModelPlanResult {
  plan?: {
    enabled: boolean;
    agentType: string;
    baseModel: string;
    tiers: { high: string; medium: string; low: string };
    overrides: { high?: string; medium?: string; low?: string };
    supportedModels: string[];
    degradesToSingleModel: boolean;
  };
  error?: string;
}

export async function getAdaptiveModelPlan(
  _previewModel?: string
): Promise<GetAdaptiveModelPlanResult> {
  return {
    plan: {
      enabled: true,
      agentType: 'claude-code',
      baseModel: 'claude-opus-5',
      tiers: {
        high: 'claude-opus-5',
        medium: 'claude-sonnet-5',
        low: 'claude-haiku-4-5',
      },
      overrides: {},
      supportedModels: [
        'claude-opus-5',
        'claude-sonnet-5',
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ],
      degradesToSingleModel: false,
    },
  };
}
