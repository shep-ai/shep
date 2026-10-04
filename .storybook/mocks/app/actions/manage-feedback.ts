/** Storybook stand-ins for the feedback server actions: every call succeeds. */

export const createFeedbackKey = async (_space: string, _name: string) => ({
  ok: true as const,
  secret: 'shep_fb_example-key-shown-once',
});
export const revokeFeedbackKey = async (_id: string) => ({ ok: true as const });
export const promoteTheme = async (_input: unknown) => ({ ok: true as const });
