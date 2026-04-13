export async function listWorkItems(
  _projectId: string,
  _filters?: unknown
): Promise<{ workItems?: unknown[]; error?: string }> {
  return { workItems: [] };
}
