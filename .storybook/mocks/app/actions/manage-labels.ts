export async function listLabels(
  _projectId: string
): Promise<{ labels?: unknown[]; error?: string }> {
  return { labels: [] };
}

export async function createLabel(_input: unknown): Promise<{ label?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function updateLabel(
  _labelId: string,
  _fields: Record<string, unknown>
): Promise<{ error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function deleteLabel(_labelId: string): Promise<{ error?: string }> {
  return {};
}
