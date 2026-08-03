import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockAdopt = vi.fn();
const mockResume = vi.fn();
const mockDescribe = vi.fn();

vi.mock('@/app/actions/adopt-agent-session', () => ({
  adoptAgentSession: (...args: unknown[]) => mockAdopt(...args),
  resumeAgentSession: (...args: unknown[]) => mockResume(...args),
  describeResumeCommand: (...args: unknown[]) => mockDescribe(...args),
}));

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SessionRow } from '@/components/common/feature-node/session-row';
import type { SessionSummary } from '@/components/common/feature-node/session-summary';

const REPO_PATH = '/Users/dev/project';

const session: SessionSummary = {
  id: 'sess-abc',
  agentType: 'claude-code',
  preview: 'refactor billing',
  messageCount: 5,
  firstMessageAt: '2026-08-01T00:00:00Z',
  lastMessageAt: '2026-08-02T00:00:00Z',
  createdAt: '2026-08-01T00:00:00Z',
  projectPath: REPO_PATH,
  filePath: `${REPO_PATH}/sess-abc.jsonl`,
};

function renderRow(overrides: Partial<SessionSummary> = {}, callbacks = {}) {
  return render(
    <DropdownMenu modal={false} defaultOpen>
      <DropdownMenuTrigger>open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <SessionRow
          session={{ ...session, ...overrides }}
          repositoryPath={REPO_PATH}
          {...callbacks}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The actions live in a submenu, so open it before asserting. */
async function openActions() {
  const trigger = await screen.findByText('refactor billing');
  await userEvent.hover(trigger);
  return waitFor(() => screen.getByTestId('session-action-adopt'));
}

describe('SessionRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdopt.mockResolvedValue({ featureId: 'feat-1', featureName: 'Adopted' });
    mockResume.mockResolvedValue({ terminalId: 'term-1', command: 'claude --resume sess-abc' });
    mockDescribe.mockResolvedValue({ command: 'claude --resume sess-abc' });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('adopts through the server action, passing identifiers only', async () => {
    const onAdopted = vi.fn();
    renderRow({}, { onAdopted });

    await openActions();
    await userEvent.click(screen.getByTestId('session-action-adopt'));

    await waitFor(() => {
      expect(mockAdopt).toHaveBeenCalledWith({
        sessionId: 'sess-abc',
        agentType: 'claude-code',
        repositoryPath: REPO_PATH,
      });
    });
    // No prompt is assembled in the component — only ids cross the boundary.
    const payload = mockAdopt.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['agentType', 'repositoryPath', 'sessionId']);
  });

  it('reports the new feature id after adoption', async () => {
    const onAdopted = vi.fn();
    renderRow({}, { onAdopted });

    await openActions();
    await userEvent.click(screen.getByTestId('session-action-adopt'));

    await waitFor(() => expect(onAdopted).toHaveBeenCalledWith('feat-1'));
  });

  it('surfaces an adoption error inline instead of navigating', async () => {
    const onAdopted = vi.fn();
    mockAdopt.mockResolvedValue({ error: 'session not found' });
    renderRow({}, { onAdopted });

    await openActions();
    await userEvent.click(screen.getByTestId('session-action-adopt'));

    await waitFor(() => expect(screen.getByText('session not found')).toBeInTheDocument());
    expect(onAdopted).not.toHaveBeenCalled();
  });

  it('resumes through the server action', async () => {
    const onResumed = vi.fn();
    renderRow({}, { onResumed });

    await openActions();
    await userEvent.click(screen.getByTestId('session-action-resume'));

    await waitFor(() => {
      expect(mockResume).toHaveBeenCalledWith({
        sessionId: 'sess-abc',
        agentType: 'claude-code',
        cwd: REPO_PATH,
      });
      expect(onResumed).toHaveBeenCalledWith('term-1');
    });
  });

  it('gets the copyable command from the server, not from local string building', async () => {
    renderRow();

    await openActions();
    await userEvent.click(screen.getByTestId('session-action-copy-command'));

    await waitFor(() => expect(mockDescribe).toHaveBeenCalled());
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('claude --resume sess-abc')
    );
  });

  it('never copies a command containing --project', async () => {
    renderRow();

    await openActions();
    await userEvent.click(screen.getByTestId('session-action-copy-command'));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(copied).not.toContain('--project');
  });

  it('passes the cursor agent type through for a Cursor session', async () => {
    renderRow({ agentType: 'cursor' }, { onAdopted: vi.fn() });

    await openActions();
    await userEvent.click(screen.getByTestId('session-action-adopt'));

    await waitFor(() =>
      expect(mockAdopt).toHaveBeenCalledWith(expect.objectContaining({ agentType: 'cursor' }))
    );
  });

  it('offers an open-in-IDE action', async () => {
    renderRow();

    await openActions();

    expect(screen.getByTestId('session-action-ide')).toBeInTheDocument();
  });
});
