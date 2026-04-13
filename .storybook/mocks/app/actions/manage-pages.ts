export async function createPage(_input: unknown): Promise<{ page?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function listPages(
  _projectId: string
): Promise<{ pages?: unknown[]; error?: string }> {
  return { pages: [] };
}

export async function getPage(_pageId: string): Promise<{ page?: unknown; error?: string }> {
  return { page: undefined };
}

export async function updatePage(
  _pageId: string,
  _fields: Record<string, unknown>
): Promise<{ page?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function deletePage(_pageId: string): Promise<{ error?: string }> {
  return {};
}
