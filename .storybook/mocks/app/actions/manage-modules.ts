export async function createModule(_input: unknown): Promise<{ module?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function updateModule(
  _moduleId: string,
  _fields: Record<string, unknown>
): Promise<{ module?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function deleteModule(_moduleId: string): Promise<{ error?: string }> {
  return {};
}

export async function addItemsToModule(
  _moduleId: string,
  _workItemIds: string[]
): Promise<{ added?: number; error?: string }> {
  return { added: 0 };
}

export async function removeItemsFromModule(
  _moduleId: string,
  _workItemIds: string[]
): Promise<{ error?: string }> {
  return {};
}
