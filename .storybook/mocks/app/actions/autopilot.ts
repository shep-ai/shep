/** Storybook stand-ins for the autopilot server actions: every call succeeds. */

const ok = async (..._args: unknown[]) => ({ ok: true as const });

export const setAutopilot = ok;
export const runAutopilot = ok;
