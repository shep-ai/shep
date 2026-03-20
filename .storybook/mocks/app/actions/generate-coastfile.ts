export async function generateCoastfileAction(
  _repositoryPath: string
): Promise<{ success: boolean; coastfilePath?: string; error?: string }> {
  return { success: false, error: 'Not available in Storybook' };
}
