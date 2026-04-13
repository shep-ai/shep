export async function createIntakeItem(
  _input: unknown
): Promise<{ intakeItem?: unknown; error?: string }> {
  return { intakeItem: undefined };
}

export async function listIntakeItems(
  _projectId: string,
  _status?: string
): Promise<{ items?: unknown[]; error?: string }> {
  return { items: [] };
}

export async function acceptIntakeItem(
  _intakeItemId: string
): Promise<{ workItem?: unknown; error?: string }> {
  return { workItem: undefined };
}

export async function declineIntakeItem(
  _intakeItemId: string,
  _reason: string
): Promise<{ error?: string }> {
  return {};
}

export async function autoTriageIntakeItem(
  _intakeItemId: string
): Promise<{ suggestions?: unknown; error?: string }> {
  return { suggestions: {} };
}

export async function detectDuplicates(
  _intakeItemId: string
): Promise<{ candidates?: unknown[]; error?: string }> {
  return { candidates: [] };
}
