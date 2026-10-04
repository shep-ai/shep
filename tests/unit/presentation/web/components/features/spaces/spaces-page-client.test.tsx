import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SpaceResolutionSource,
  SpaceRuleKind,
  type ProductLine,
  type Space,
  type SpaceRule,
} from '@shepai/core/domain/generated/output';
import type { SpacesOverview } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import { SpacesPageClient } from '@/components/features/spaces/spaces-page-client';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const actions = {
  createSpace: vi.fn(),
  updateSpace: vi.fn(),
  setDefaultSpace: vi.fn(),
  deleteSpace: vi.fn(),
  createProductLine: vi.fn(),
  deleteProductLine: vi.fn(),
  addSpaceRule: vi.fn(),
  removeSpaceRule: vi.fn(),
  assignRepository: vi.fn(),
  unassignRepository: vi.fn(),
};
vi.mock('@/app/actions/manage-spaces', () => ({
  createSpace: (...a: unknown[]) => actions.createSpace(...a),
  updateSpace: (...a: unknown[]) => actions.updateSpace(...a),
  setDefaultSpace: (...a: unknown[]) => actions.setDefaultSpace(...a),
  deleteSpace: (...a: unknown[]) => actions.deleteSpace(...a),
  createProductLine: (...a: unknown[]) => actions.createProductLine(...a),
  deleteProductLine: (...a: unknown[]) => actions.deleteProductLine(...a),
  addSpaceRule: (...a: unknown[]) => actions.addSpaceRule(...a),
  removeSpaceRule: (...a: unknown[]) => actions.removeSpaceRule(...a),
  assignRepository: (...a: unknown[]) => actions.assignRepository(...a),
  unassignRepository: (...a: unknown[]) => actions.unassignRepository(...a),
}));

const T = new Date('2026-10-01T00:00:00Z');
const PERSONAL: Space = {
  id: 's-me',
  name: 'Personal',
  slug: 'personal',
  isDefault: true,
  createdAt: T,
  updatedAt: T,
};
const ACME: Space = {
  id: 's-acme',
  name: 'Acme',
  slug: 'acme',
  color: '#3456c4',
  isDefault: false,
  createdAt: T,
  updatedAt: T,
};
const PAYMENTS: ProductLine = {
  id: 'l-pay',
  spaceId: ACME.id,
  name: 'Payments',
  slug: 'payments',
  createdAt: T,
  updatedAt: T,
};
const RULE: SpaceRule = {
  id: 'r1',
  spaceId: ACME.id,
  kind: SpaceRuleKind.Remote,
  pattern: 'github.com/acme/*',
  priority: 100,
  createdAt: T,
  updatedAt: T,
};

const OVERVIEW: SpacesOverview = {
  spaces: [
    { space: PERSONAL, productLines: [], rules: [], memoryCount: 1, repositoryCount: 1 },
    { space: ACME, productLines: [PAYMENTS], rules: [RULE], memoryCount: 4, repositoryCount: 1 },
  ],
  repositories: [
    {
      repositoryPath: '/code/me/blog',
      name: 'blog',
      spaceId: PERSONAL.id,
      source: SpaceResolutionSource.Default,
    },
    {
      repositoryPath: '/work/acme/api',
      name: 'api',
      spaceId: ACME.id,
      productLineId: PAYMENTS.id,
      source: SpaceResolutionSource.Rule,
      ruleId: RULE.id,
    },
    {
      repositoryPath: '/oss/fork',
      name: 'fork',
      spaceId: ACME.id,
      source: SpaceResolutionSource.Assignment,
    },
  ],
};

const card = (name: string) => screen.getByTestId(`space-card-${name}`);

describe('SpacesPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: true });
  });

  it('shows each space with its lines, rules and counts', () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    const acme = within(card('acme'));
    expect(acme.getByText('Acme')).toBeInTheDocument();
    expect(acme.getByRole('button', { name: 'Remove Payments' })).toBeInTheDocument();
    expect(acme.getByText('github.com/acme/*')).toBeInTheDocument();
    expect(acme.getByText(/Memory entries: 4/)).toBeInTheDocument();
    expect(within(card('personal')).getByText('Default')).toBeInTheDocument();
  });

  it('creates a space and refreshes', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    await userEvent.type(screen.getByTestId('create-space-name'), 'Globex');
    await userEvent.click(screen.getByTestId('create-space-submit'));
    expect(actions.createSpace).toHaveBeenCalledWith({
      name: 'Globex',
      description: '',
      color: '',
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows a refusal next to the page and does not refresh', async () => {
    actions.createSpace.mockResolvedValue({
      ok: false,
      error: 'A space with the slug "acme" already exists.',
    });
    render(<SpacesPageClient overview={OVERVIEW} />);
    await userEvent.type(screen.getByTestId('create-space-name'), 'Acme');
    await userEvent.click(screen.getByTestId('create-space-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('adds a product line to a space', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    const acme = within(card('acme'));
    await userEvent.type(acme.getByTestId('add-product-line-name'), 'Web');
    await userEvent.click(acme.getByTestId('add-product-line-submit'));
    expect(actions.createProductLine).toHaveBeenCalledWith(ACME.id, { name: 'Web' });
  });

  it('removes a product line', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    await userEvent.click(within(card('acme')).getByTestId('remove-product-line-payments'));
    expect(actions.deleteProductLine).toHaveBeenCalledWith(ACME.id, PAYMENTS.id);
  });

  it('adds a rule with an optional product line', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    const acme = within(card('acme'));
    await userEvent.type(acme.getByTestId('add-rule-pattern'), '/work/acme');
    await userEvent.selectOptions(acme.getByTestId('add-rule-line'), PAYMENTS.id);
    await userEvent.click(acme.getByTestId('add-rule-submit'));
    expect(actions.addSpaceRule).toHaveBeenCalledWith({
      space: ACME.id,
      pattern: '/work/acme',
      productLine: PAYMENTS.id,
    });
  });

  it('removes a rule', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    await userEvent.click(within(card('acme')).getByTestId('remove-rule-r1'));
    expect(actions.removeSpaceRule).toHaveBeenCalledWith('r1');
  });

  it('makes a space the default; the default space offers neither default nor delete', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    expect(within(card('personal')).queryByTestId('space-make-default')).not.toBeInTheDocument();
    expect(within(card('personal')).queryByTestId('space-delete')).not.toBeInTheDocument();
    await userEvent.click(within(card('acme')).getByTestId('space-make-default'));
    expect(actions.setDefaultSpace).toHaveBeenCalledWith(ACME.id);
  });

  it('edits a space name, description and colour', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    const acme = within(card('acme'));
    await userEvent.click(acme.getByTestId('space-edit'));
    const name = acme.getByTestId('edit-space-name');
    expect(name).toHaveValue('Acme');
    await userEvent.clear(name);
    await userEvent.type(name, 'Acme Corp');
    await userEvent.type(acme.getByTestId('edit-space-description'), 'Client work');
    await userEvent.click(acme.getByTestId('edit-space-submit'));
    expect(actions.updateSpace).toHaveBeenCalledWith(ACME.id, {
      name: 'Acme Corp',
      description: 'Client work',
      color: '#3456c4',
    });
    await waitFor(() => expect(acme.queryByTestId('edit-space-name')).not.toBeInTheDocument());
  });

  it('deletes a space after confirmation', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    await userEvent.click(within(card('acme')).getByTestId('space-delete'));
    await userEvent.click(await screen.findByTestId('space-delete-confirm'));
    expect(actions.deleteSpace).toHaveBeenCalledWith(ACME.id);
  });

  it('explains where each repository lands', () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    const api = within(screen.getByTestId('repository-placement-/work/acme/api'));
    expect(api.getByText('github.com/acme/*')).toBeInTheDocument();
    expect(api.getByText('Payments')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('repository-placement-/oss/fork')).getByText('Pinned')
    ).toBeInTheDocument();
  });

  it('pins a repository to another space', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    const blog = within(screen.getByTestId('repository-placement-/code/me/blog'));
    await userEvent.selectOptions(blog.getByTestId('repository-pin'), ACME.id);
    expect(actions.assignRepository).toHaveBeenCalledWith({
      repositoryPath: '/code/me/blog',
      space: ACME.id,
    });
  });

  it('unpins a pinned repository', async () => {
    render(<SpacesPageClient overview={OVERVIEW} />);
    await userEvent.click(
      within(screen.getByTestId('repository-placement-/oss/fork')).getByTestId('repository-unpin')
    );
    expect(actions.unassignRepository).toHaveBeenCalledWith('/oss/fork');
  });
});
