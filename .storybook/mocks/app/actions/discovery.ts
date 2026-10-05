/** Storybook stand-ins for the discovery server actions: every call succeeds. */

export const runDiscovery = async (_space: string) => ({ ok: true as const });
export const setDiscoverySchedule = async (_space: string, _everyHours: number | null) => ({
  ok: true as const,
});
