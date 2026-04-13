export async function logTimeEntry(
  _workItemId: string,
  _durationMinutes: number,
  _note?: string
): Promise<{ timeEntry?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function listTimeEntries(
  _workItemId: string
): Promise<{ timeEntries?: unknown[]; totalMinutes?: number; error?: string }> {
  return { timeEntries: [], totalMinutes: 0 };
}

export async function deleteTimeEntry(_id: string): Promise<{ error?: string }> {
  return {};
}
