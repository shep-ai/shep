export async function listWorkItemStates(
  _projectId: string
): Promise<{ states?: unknown[]; error?: string }> {
  return { states: [] };
}

export async function createWorkItemState(
  _input: unknown
): Promise<{ state?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function updateWorkItemState(
  _stateId: string,
  _fields: Record<string, unknown>
): Promise<{ error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function deleteWorkItemState(_stateId: string): Promise<{ error?: string }> {
  return {};
}

export async function reorderWorkItemStates(
  _states: { id: string; displayOrder: number }[]
): Promise<{ error?: string }> {
  return {};
}
