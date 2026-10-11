/** Parse an `owner/repo` slug; `null` when either half is missing. */
export function parseRepositorySlug(slug: string): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = slug.split('/');
  if (!owner || !repo || rest.length > 0) return null;
  return { owner, repo };
}
