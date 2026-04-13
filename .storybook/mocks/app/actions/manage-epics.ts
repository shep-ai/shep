export async function createEpic(_input: unknown): Promise<{ epic?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function listEpics(
  _projectId: string
): Promise<{ epics?: unknown[]; error?: string }> {
  return { epics: [] };
}

export async function updateEpic(
  _epicId: string,
  _fields: Record<string, unknown>
): Promise<{ epic?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function deleteEpic(_epicId: string): Promise<{ error?: string }> {
  return {};
}
