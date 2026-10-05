/** Storybook stand-ins for the outcome server actions: every call succeeds. */

const ok = async (..._args: unknown[]) => ({ ok: true as const });

export const checkOutcomes = ok;
export const shipOpportunity = ok;
export const tellCustomers = ok;
export const recordOutcomeHours = ok;
