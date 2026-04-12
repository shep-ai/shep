export interface DeleteRepositoryActionOptions {
  deleteFromDisk?: boolean;
}

export async function deleteRepository(
  _repositoryId: string,
  _options?: DeleteRepositoryActionOptions
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Not available in Storybook' };
}
