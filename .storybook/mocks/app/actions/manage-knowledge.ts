/** Storybook stand-ins for the knowledge source server actions: every call succeeds. */

const ok = async () => ({ ok: true as const });

export const createKnowledgeSource = async (_input: unknown) => ok();
export const setKnowledgeSourceEnabled = async (_id: string, _enabled: boolean) => ok();
export const removeKnowledgeSource = async (_id: string) => ok();
export const syncKnowledge = async (_sourceId?: string) => ok();
