/** Storybook stand-ins for the incident server actions: every call succeeds. */

const ok = async (..._args: unknown[]) => ({ ok: true as const });

export const openIncident = ok;
export const noteIncident = ok;
export const resolveIncident = ok;
export const triageIncident = ok;
export const actOnIncident = ok;
export const approveRuntimeAction = ok;
export const rejectRuntimeAction = ok;
