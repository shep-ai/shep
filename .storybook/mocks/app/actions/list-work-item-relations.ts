export async function listWorkItemRelations(
  _workItemId: string
): Promise<{ relations?: unknown[]; error?: string }> {
  return { relations: [] };
}
