export async function updateFeaturePinnedConfig(
  _featureId: string,
  _agentType: string,
  _modelId: string
): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}
