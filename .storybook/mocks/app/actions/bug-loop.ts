/** Storybook stand-ins for the Investigation panel server actions. */

export async function getLatestInvestigation(_workItemId: string) {
  return {};
}
export async function startInvestigation(_input: unknown) {
  return { ok: false as const, error: 'Investigations do not run in Storybook.' };
}
export async function approveHypothesis(_input: unknown) {
  return { ok: true as const, featureId: 'feature-storybook' };
}
