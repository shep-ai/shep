export type EnableBedrockResult =
  | { ok: true; bedrockEnabled: boolean }
  | { ok: false; code: string; remediation: string };

export async function enableBedrock(_applicationId: string): Promise<EnableBedrockResult> {
  return {
    ok: false,
    code: 'NOT_AVAILABLE',
    remediation: 'enableBedrock is not available in Storybook.',
  };
}
