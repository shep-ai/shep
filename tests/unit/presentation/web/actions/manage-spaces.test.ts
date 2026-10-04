import { describe, it, expect, vi, beforeEach } from 'vitest';

const spaces = {
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  setDefault: vi.fn(),
  createProductLine: vi.fn(),
  deleteProductLine: vi.fn(),
};
const membership = {
  addRule: vi.fn(),
  removeRule: vi.fn(),
  assign: vi.fn(),
  unassign: vi.fn(),
};
const overview = { execute: vi.fn() };

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'ManageSpacesUseCase') return spaces;
    if (token === 'ManageSpaceMembershipUseCase') return membership;
    if (token === 'GetSpacesOverviewUseCase') return overview;
    throw new Error(`Unknown token: ${token}`);
  },
}));

const actions = await import('../../../../../src/presentation/web/app/actions/manage-spaces.js');

describe('manage-spaces server actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes a use-case result through unchanged', async () => {
    spaces.create.mockResolvedValue({
      ok: false,
      error: 'A space with the slug "acme" already exists.',
    });
    const result = await actions.createSpace({ name: 'Acme' });
    expect(spaces.create).toHaveBeenCalledWith({ name: 'Acme' });
    expect(result).toEqual({ ok: false, error: 'A space with the slug "acme" already exists.' });
  });

  it('turns a thrown error into a failed result', async () => {
    spaces.delete.mockRejectedValue(new Error('database is locked'));
    expect(await actions.deleteSpace('acme')).toEqual({ ok: false, error: 'database is locked' });
  });

  it('routes each action to its use-case method', async () => {
    for (const fn of [...Object.values(spaces), ...Object.values(membership)]) {
      fn.mockResolvedValue({ ok: true });
    }
    await actions.updateSpace('acme', { name: 'Acme Corp' });
    await actions.setDefaultSpace('acme');
    await actions.createProductLine('acme', { name: 'Payments' });
    await actions.deleteProductLine('acme', 'payments');
    await actions.addSpaceRule({ space: 'acme', pattern: 'github.com/acme/*' });
    await actions.removeSpaceRule('r1');
    await actions.assignRepository({ repositoryPath: '/work/api', space: 'acme' });
    await actions.unassignRepository('/work/api');

    expect(spaces.update).toHaveBeenCalledWith('acme', { name: 'Acme Corp' });
    expect(spaces.setDefault).toHaveBeenCalledWith('acme');
    expect(spaces.createProductLine).toHaveBeenCalledWith('acme', { name: 'Payments' });
    expect(spaces.deleteProductLine).toHaveBeenCalledWith('acme', 'payments');
    expect(membership.addRule).toHaveBeenCalledWith({
      space: 'acme',
      pattern: 'github.com/acme/*',
    });
    expect(membership.removeRule).toHaveBeenCalledWith('r1');
    expect(membership.assign).toHaveBeenCalledWith({ repositoryPath: '/work/api', space: 'acme' });
    expect(membership.unassign).toHaveBeenCalledWith('/work/api');
  });

  it('loads the overview', async () => {
    overview.execute.mockResolvedValue({ spaces: [], repositories: [] });
    expect(await actions.getSpacesOverview()).toEqual({
      overview: { spaces: [], repositories: [] },
    });
  });

  it('reports an overview that cannot load', async () => {
    overview.execute.mockRejectedValue(new Error('no database'));
    expect(await actions.getSpacesOverview()).toEqual({ error: 'no database' });
  });
});
