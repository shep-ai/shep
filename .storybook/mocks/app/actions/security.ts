export async function getSecurityStateAction(
  _repositoryPath: string
): Promise<{ state?: unknown; error?: string }> {
  return { state: undefined };
}

export async function enforceSecurityAction(
  _repositoryPath: string
): Promise<{ result?: unknown; error?: string }> {
  return { result: undefined };
}

export async function updateSecurityModeAction(
  _mode: string
): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}
