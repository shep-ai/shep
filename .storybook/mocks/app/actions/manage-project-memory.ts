export async function listProjectMemory(
  _repositoryPath?: string
): Promise<{ entries?: unknown[]; error?: string }> {
  return { entries: [] };
}

export async function updateProjectMemory(
  _id: string,
  content: string
): Promise<{ memory?: unknown; error?: string }> {
  return { memory: { id: 'mock', content } };
}

export async function setProjectMemoryScope(
  _id: string,
  scope: string
): Promise<{ memory?: unknown; error?: string }> {
  return { memory: { id: 'mock', scope } };
}

export async function deleteProjectMemory(_id: string): Promise<{ error?: string }> {
  return {};
}
