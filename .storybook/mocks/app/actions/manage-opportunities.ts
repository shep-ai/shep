/** Storybook stand-ins for the Opportunities server actions: every call succeeds. */

const ok = async () => ({ ok: true as const });

export const recordSignal = async (_input: unknown) => ok();
export const linkSignal = async (_signalId: string, _opportunityId: string | null) => ok();
export const removeSignal = async (_signalId: string) => ok();
export const createOpportunity = async (_input: unknown) => ok();
export const estimateOpportunity = async (_id: string, _estimate: unknown) => ok();
export const acceptOpportunity = async (_id: string) => ok();
export const dropOpportunity = async (_id: string, _reason: string) => ok();
export const buildOpportunity = async (_id: string, _project: string) => ok();
export const setOpportunityWeights = async (_space: string, _change: unknown) => ok();
