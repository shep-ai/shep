import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectMemoryPanel } from '@/components/features/project-memory/project-memory-panel';
import type { MemorySpaceOption } from '@/components/features/project-memory/memory-space-option';
import {
  MemoryCategory,
  MemoryScope,
  type ProjectMemory,
} from '@shepai/core/domain/generated/output';

const updateProjectMemory = vi.fn();
const deleteProjectMemory = vi.fn();
const setProjectMemoryScope = vi.fn();

vi.mock('@/app/actions/manage-project-memory', () => ({
  updateProjectMemory: (...args: unknown[]) => updateProjectMemory(...args),
  deleteProjectMemory: (...args: unknown[]) => deleteProjectMemory(...args),
  setProjectMemoryScope: (...args: unknown[]) => setProjectMemoryScope(...args),
}));

const NOW = new Date('2026-06-01T10:00:00Z');

const SPACES: MemorySpaceOption[] = [
  { id: 'space-default', name: 'Default', productLines: [] },
  {
    id: 'space-acme',
    name: 'Acme',
    color: '#3456c4',
    productLines: [{ id: 'line-pay', name: 'Payments' }],
  },
];

async function chooseScope(scope: MemoryScope): Promise<void> {
  await userEvent.click(screen.getByTestId('project-memory-scope-toggle'));
  await userEvent.click(await screen.findByTestId(`project-memory-scope-option-${scope}`));
}

function entry(over: Partial<ProjectMemory>): ProjectMemory {
  return {
    id: 'm-1',
    repositoryPath: '/home/user/shep',
    category: MemoryCategory.Convention,
    entryKey: 'k-1',
    content: 'Use use-cases as the only entry point.',
    sourceFeatureId: 'feat-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('ProjectMemoryPanel', () => {
  beforeEach(() => {
    updateProjectMemory.mockReset();
    deleteProjectMemory.mockReset();
    setProjectMemoryScope.mockReset();
  });

  it('keeps an edit available and announces a transport error', async () => {
    updateProjectMemory.mockRejectedValueOnce(new Error('Connection lost'));
    render(<ProjectMemoryPanel entries={[entry({})]} />);
    await userEvent.click(screen.getByTestId('project-memory-edit'));
    await userEvent.click(screen.getByTestId('project-memory-save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.getByTestId('project-memory-edit-input')).toBeInTheDocument();
  });

  it('preserves an entry when deletion cannot reach the server', async () => {
    deleteProjectMemory.mockRejectedValueOnce(new Error('Connection lost'));
    render(<ProjectMemoryPanel entries={[entry({})]} />);
    await userEvent.click(screen.getByTestId('project-memory-delete'));
    await userEvent.click(await screen.findByTestId('project-memory-delete-confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.getByText(entry({}).content)).toBeInTheDocument();
  });

  it('preserves scope and announces a failed scope change', async () => {
    setProjectMemoryScope.mockRejectedValueOnce(new Error('Connection lost'));
    render(<ProjectMemoryPanel entries={[entry({ scope: MemoryScope.Project })]} />);
    await chooseScope(MemoryScope.Space);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.queryByTestId('project-memory-scope-badge')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no entries', () => {
    render(<ProjectMemoryPanel entries={[]} />);
    expect(screen.getByTestId('project-memory-empty')).toBeInTheDocument();
  });

  it('keeps the page heading when the memory list is empty', () => {
    render(<ProjectMemoryPanel entries={[]} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Project Memory' })).toBeInTheDocument();
  });

  it('groups entries into labelled category sections', () => {
    render(
      <ProjectMemoryPanel
        entries={[
          entry({ id: 'c', category: MemoryCategory.Convention, content: 'Convention one.' }),
          entry({ id: 'l', category: MemoryCategory.Library, content: 'Use better-sqlite3.' }),
        ]}
      />
    );
    expect(screen.getByText('Conventions')).toBeInTheDocument();
    expect(screen.getByText('Preferred Libraries & Tools')).toBeInTheDocument();
    expect(screen.getByText('Convention one.')).toBeInTheDocument();
    expect(screen.getByText('Use better-sqlite3.')).toBeInTheDocument();
  });

  it('edits an entry and updates the list on success', async () => {
    const user = userEvent.setup();
    updateProjectMemory.mockResolvedValue({
      memory: entry({ content: 'Edited content.' }),
    });

    render(<ProjectMemoryPanel entries={[entry({})]} />);

    await user.click(screen.getByTestId('project-memory-edit'));
    const input = screen.getByTestId('project-memory-edit-input');
    await user.clear(input);
    await user.type(input, 'Edited content.');
    await user.click(screen.getByTestId('project-memory-save'));

    expect(updateProjectMemory).toHaveBeenCalledWith('m-1', 'Edited content.');
    await waitFor(() => expect(screen.getByText('Edited content.')).toBeInTheDocument());
  });

  it('deletes an entry after confirmation', async () => {
    const user = userEvent.setup();
    deleteProjectMemory.mockResolvedValue({});

    render(<ProjectMemoryPanel entries={[entry({ content: 'To be removed.' })]} />);

    await user.click(screen.getByTestId('project-memory-delete'));
    const confirm = await screen.findByTestId('project-memory-delete-confirm');
    await user.click(confirm);

    expect(deleteProjectMemory).toHaveBeenCalledWith('m-1');
    await waitFor(() => expect(screen.queryByText('To be removed.')).not.toBeInTheDocument());
  });

  it('names the space on a Space-scoped entry', () => {
    render(
      <ProjectMemoryPanel
        spaces={SPACES}
        entries={[entry({ scope: MemoryScope.Space, spaceId: 'space-acme', content: 'Rule.' })]}
      />
    );
    expect(screen.getByTestId('project-memory-scope-badge')).toHaveTextContent('Acme');
  });

  it('shows legacy Organization entries as space-wide', () => {
    render(
      <ProjectMemoryPanel
        spaces={SPACES}
        entries={[entry({ scope: MemoryScope.Organization, spaceId: 'space-acme' })]}
      />
    );
    expect(screen.getByTestId('project-memory-scope-badge')).toHaveTextContent('Acme');
  });

  it('names the product line on a ProductLine-scoped entry', () => {
    render(
      <ProjectMemoryPanel
        spaces={SPACES}
        entries={[
          entry({
            scope: MemoryScope.ProductLine,
            spaceId: 'space-acme',
            productLineId: 'line-pay',
          }),
        ]}
      />
    );
    expect(screen.getByTestId('project-memory-scope-badge')).toHaveTextContent('Payments');
  });

  it('shares a project entry with its whole space', async () => {
    setProjectMemoryScope.mockResolvedValue({
      memory: entry({ scope: MemoryScope.Space, spaceId: 'space-acme' }),
    });
    render(
      <ProjectMemoryPanel
        spaces={SPACES}
        entries={[entry({ scope: MemoryScope.Project, spaceId: 'space-acme' })]}
      />
    );

    await chooseScope(MemoryScope.Space);

    expect(setProjectMemoryScope).toHaveBeenCalledWith('m-1', MemoryScope.Space);
    await waitFor(() =>
      expect(screen.getByTestId('project-memory-scope-badge')).toHaveTextContent('Acme')
    );
  });

  it('shares a project entry with its product line', async () => {
    setProjectMemoryScope.mockResolvedValue({
      memory: entry({
        scope: MemoryScope.ProductLine,
        spaceId: 'space-acme',
        productLineId: 'line-pay',
      }),
    });
    render(
      <ProjectMemoryPanel
        spaces={SPACES}
        entries={[entry({ scope: MemoryScope.Project, spaceId: 'space-acme' })]}
      />
    );

    await chooseScope(MemoryScope.ProductLine);

    expect(setProjectMemoryScope).toHaveBeenCalledWith('m-1', MemoryScope.ProductLine);
    await waitFor(() =>
      expect(screen.getByTestId('project-memory-scope-badge')).toHaveTextContent('Payments')
    );
  });

  it('narrows the list to one space', async () => {
    render(
      <ProjectMemoryPanel
        spaces={SPACES}
        entries={[
          entry({ id: 'a', spaceId: 'space-acme', content: 'Acme rule.' }),
          entry({ id: 'b', spaceId: 'space-default', content: 'Personal rule.' }),
        ]}
      />
    );
    expect(screen.getByText('Personal rule.')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('project-memory-space-filter-space-acme'));

    expect(screen.getByText('Acme rule.')).toBeInTheDocument();
    expect(screen.queryByText('Personal rule.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('project-memory-space-filter-all'));
    expect(screen.getByText('Personal rule.')).toBeInTheDocument();
  });

  it('hides the space filter when there is only one space', () => {
    render(<ProjectMemoryPanel spaces={[SPACES[0]]} entries={[entry({})]} />);
    expect(screen.queryByTestId('project-memory-space-filter-all')).not.toBeInTheDocument();
  });

  it('surfaces an error when an edit is saved empty', async () => {
    const user = userEvent.setup();
    render(<ProjectMemoryPanel entries={[entry({})]} />);

    await user.click(screen.getByTestId('project-memory-edit'));
    await user.clear(screen.getByTestId('project-memory-edit-input'));
    await user.click(screen.getByTestId('project-memory-save'));

    expect(updateProjectMemory).not.toHaveBeenCalled();
    expect(screen.getByTestId('project-memory-error')).toBeInTheDocument();
  });
});
