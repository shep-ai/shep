import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectMemoryPanel } from '@/components/features/project-memory/project-memory-panel';
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

  it('renders the empty state when there are no entries', () => {
    render(<ProjectMemoryPanel entries={[]} />);
    expect(screen.getByTestId('project-memory-empty')).toBeInTheDocument();
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

  it('shows an Organization badge for organization-scoped entries', () => {
    render(
      <ProjectMemoryPanel
        entries={[entry({ scope: MemoryScope.Organization, content: 'Org-wide rule.' })]}
      />
    );
    expect(screen.getByTestId('project-memory-org-badge')).toBeInTheDocument();
  });

  it('promotes a project entry to organization-wide', async () => {
    const user = userEvent.setup();
    setProjectMemoryScope.mockResolvedValue({
      memory: entry({ scope: MemoryScope.Organization }),
    });

    render(<ProjectMemoryPanel entries={[entry({ scope: MemoryScope.Project })]} />);

    await user.click(screen.getByTestId('project-memory-scope-toggle'));

    expect(setProjectMemoryScope).toHaveBeenCalledWith('m-1', MemoryScope.Organization);
    await waitFor(() => expect(screen.getByTestId('project-memory-org-badge')).toBeInTheDocument());
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
