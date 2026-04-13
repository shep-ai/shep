export async function bulkUpdateWorkItems(_input: unknown): Promise<{
  ok: boolean;
  succeeded: string[];
  failed: { id: string; error: string }[];
  error?: string;
}> {
  return { ok: false, succeeded: [], failed: [], error: 'Not available in Storybook' };
}
