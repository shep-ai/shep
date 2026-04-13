export async function getModuleProgress(
  _projectId: string
): Promise<{ modules?: unknown[]; error?: string }> {
  return { modules: [] };
}
