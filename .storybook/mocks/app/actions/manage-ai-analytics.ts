export async function getAiCycleSummary(
  _cycleId: string
): Promise<{ summary?: unknown; error?: string }> {
  return { summary: {} };
}

export async function getAiProjectHealth(
  _projectId: string
): Promise<{ health?: unknown; error?: string }> {
  return { health: {} };
}
