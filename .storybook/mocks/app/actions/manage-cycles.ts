export async function createCycle(_input: unknown): Promise<{ cycle?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function updateCycle(
  _cycleId: string,
  _fields: Record<string, unknown>
): Promise<{ cycle?: unknown; error?: string }> {
  return { error: 'Not available in Storybook' };
}

export async function deleteCycle(_cycleId: string): Promise<{ error?: string }> {
  return {};
}

export async function addItemsToCycle(
  _cycleId: string,
  _workItemIds: string[]
): Promise<{ added?: number; error?: string }> {
  return { added: 0 };
}

export async function removeItemsFromCycle(
  _cycleId: string,
  _workItemIds: string[]
): Promise<{ error?: string }> {
  return {};
}

export async function transferCycleItems(
  _sourceCycleId: string,
  _targetCycleId?: string
): Promise<{ transferred?: number; kept?: number; error?: string }> {
  return { transferred: 0, kept: 0 };
}
