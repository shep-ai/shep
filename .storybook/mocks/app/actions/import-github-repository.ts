export async function importGitHubRepository(input: { url: string; dest?: string }): Promise<{
  repository?: {
    id: string;
    name: string;
    path: string;
    remoteUrl?: string;
    isFork?: boolean;
    upstreamUrl?: string;
  };
  forked?: boolean;
  error?: string;
}> {
  const name = input.url.split('/').pop() ?? 'unknown';
  return {
    repository: {
      id: `repo-${Date.now()}`,
      name,
      path: `/repos/${name}`,
      remoteUrl: input.url.startsWith('http') ? input.url : `https://github.com/${input.url}`,
    },
    forked: false,
  };
}
