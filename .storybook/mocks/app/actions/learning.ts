/** Storybook stand-ins for the Learning page server actions: every call succeeds. */

const ok = async (..._args: unknown[]) => ({ ok: true as const });

export const adoptHarnessVersion = ok;
export const rejectHarnessVersion = ok;
export const rollbackHarness = ok;
