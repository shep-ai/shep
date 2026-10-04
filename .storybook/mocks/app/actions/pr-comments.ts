/** Storybook stand-ins for the Review comments server actions. */

export async function getPrComments(_featureId: string) {
  return { ok: true as const, comments: [], rounds: [] };
}
export async function refreshPrComments(_featureId: string) {
  return { ok: true as const, comments: [], rounds: [] };
}
export async function addressPrComments(_featureId: string, _commentIds?: string[]) {
  return { ok: false as const, error: 'Rounds do not run in Storybook.' };
}
