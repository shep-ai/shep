/** Storybook stand-ins for the Connections server actions: every call succeeds. */

const ok = async () => ({ ok: true as const });

export async function getTrackerOverview() {
  return { overview: { connections: [], spaces: [], projects: [] } };
}
export const createConnection = async (_input: unknown) => ok();
export const testConnection = async (_ref: string) => ok();
export const removeConnection = async (_ref: string) => ok();
export const createTrackerSyncRule = async (_input: unknown) => ok();
export const setTrackerSyncRuleEnabled = async (_id: string, _enabled: boolean) => ok();
export const removeTrackerSyncRule = async (_id: string) => ok();
export const runTrackerSync = async (_ruleId?: string) => ok();
