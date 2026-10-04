/** Storybook stand-ins for the Spaces server actions: every mutation succeeds. */

type Ok = { ok: true } & Record<string, unknown>;

const ok = async (extra: Record<string, unknown> = {}): Promise<Ok> => ({ ok: true, ...extra });

export async function getSpacesOverview(): Promise<{ overview?: unknown; error?: string }> {
  return { overview: { spaces: [], repositories: [] } };
}

export async function createSpace(input: { name: string }) {
  return ok({ space: { id: 'mock', name: input.name, slug: 'mock', isDefault: false } });
}

export async function updateSpace(_ref: string, _input: unknown) {
  return ok({ space: { id: 'mock' } });
}

export async function setDefaultSpace(_ref: string) {
  return ok({ space: { id: 'mock' } });
}

export async function deleteSpace(_ref: string) {
  return ok();
}

export async function createProductLine(_spaceRef: string, input: { name: string }) {
  return ok({ productLine: { id: 'mock', name: input.name } });
}

export async function deleteProductLine(_spaceRef: string, _lineRef: string) {
  return ok();
}

export async function addSpaceRule(_input: unknown) {
  return ok({ rule: { id: 'mock' } });
}

export async function removeSpaceRule(_id: string) {
  return ok();
}

export async function assignRepository(_input: unknown) {
  return ok({ assignment: {} });
}

export async function unassignRepository(_repositoryPath: string) {
  return ok();
}
