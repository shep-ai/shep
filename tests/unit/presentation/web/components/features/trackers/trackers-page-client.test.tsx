import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ConnectionStatus,
  ConnectionProvider,
  TrackerSyncDirection,
} from '@shepai/core/domain/generated/output';
import type { TrackerOverview } from '@shepai/core/application/use-cases/trackers/get-tracker-overview.use-case';
import { TrackersPageClient } from '@/components/features/trackers/trackers-page-client';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const actions = vi.hoisted(() => ({
  createConnection: vi.fn(),
  testConnection: vi.fn(),
  removeConnection: vi.fn(),
  createTrackerSyncRule: vi.fn(),
  setTrackerSyncRuleEnabled: vi.fn(),
  removeTrackerSyncRule: vi.fn(),
  runTrackerSync: vi.fn(),
}));
vi.mock('@/app/actions/manage-trackers', () =>
  Object.fromEntries(
    Object.keys(actions).map((name) => [
      name,
      (...a: unknown[]) => actions[name as keyof typeof actions](...a),
    ])
  )
);

const T = new Date('2026-10-01T10:00:00Z');
const OVERVIEW: TrackerOverview = {
  connections: [
    {
      connection: {
        id: 'c1',
        provider: ConnectionProvider.Jira,
        name: 'Acme Jira',
        slug: 'acme-jira',
        spaceId: 's-acme',
        siteUrl: 'https://acme.atlassian.net',
        accountEmail: 'me@acme.com',
        accountName: 'Ada',
        status: ConnectionStatus.Connected,
        createdAt: T,
        updatedAt: T,
      },
      spaceName: 'Acme',
      rules: [
        {
          rule: {
            id: 'r1',
            connectionId: 'c1',
            projectId: 'p1',
            scope: 'project = PAY',
            direction: TrackerSyncDirection.TwoWay,
            intervalMinutes: 15,
            enabled: true,
            lastRunAt: T,
            lastRun: {
              created: 2,
              updated: 1,
              pushed: 1,
              conflicts: 0,
              failed: 0,
              rateLimited: false,
            },
            createdAt: T,
            updatedAt: T,
          },
          connection: { name: 'Acme Jira', slug: 'acme-jira', provider: ConnectionProvider.Jira },
          project: { name: 'Payments', slug: 'pay' },
        },
      ],
    },
  ],
  spaces: [
    { id: 's-me', name: 'Personal' },
    { id: 's-acme', name: 'Acme' },
  ],
  projects: [{ id: 'p1', name: 'Payments', slug: 'pay' }],
};

const card = () => within(screen.getByTestId('tracker-connection-acme-jira'));

describe('TrackersPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: true });
  });

  it('shows each connection with its account, space and rules', () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    expect(card().getByText('Acme Jira')).toBeInTheDocument();
    expect(card().getByText(/Ada/)).toBeInTheDocument();
    expect(
      card().getByText(/Acme/, { selector: '[data-testid="tracker-connection-space"]' })
    ).toBeInTheDocument();
    expect(card().getByText('project = PAY')).toBeInTheDocument();
    expect(card().getByText(/2 created/)).toBeInTheDocument();
  });

  it('adds a Linear connection without Jira fields', async () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.type(screen.getByTestId('add-connection-name'), 'Me Linear');
    await userEvent.selectOptions(screen.getByTestId('add-connection-space'), 's-me');
    expect(screen.queryByTestId('add-connection-site')).not.toBeInTheDocument();
    await userEvent.type(screen.getByTestId('add-connection-secret'), 'lin_api_x');
    await userEvent.click(screen.getByTestId('add-connection-submit'));

    expect(actions.createConnection).toHaveBeenCalledWith({
      provider: ConnectionProvider.Linear,
      name: 'Me Linear',
      space: 's-me',
      secret: 'lin_api_x',
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByTestId('add-connection-secret')).toHaveValue('');
  });

  it('asks Jira for its site and email', async () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.selectOptions(
      screen.getByTestId('add-connection-provider'),
      ConnectionProvider.Jira
    );
    await userEvent.type(screen.getByTestId('add-connection-name'), 'J');
    await userEvent.type(screen.getByTestId('add-connection-site'), 'https://x.atlassian.net');
    await userEvent.type(screen.getByTestId('add-connection-email'), 'a@x.com');
    await userEvent.type(screen.getByTestId('add-connection-secret'), 't');
    await userEvent.click(screen.getByTestId('add-connection-submit'));
    expect(actions.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ConnectionProvider.Jira,
        siteUrl: 'https://x.atlassian.net',
        accountEmail: 'a@x.com',
      })
    );
  });

  it('shows a refusal and keeps the form', async () => {
    actions.createConnection.mockResolvedValue({
      ok: false,
      error: 'Linear: Authentication required',
    });
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.type(screen.getByTestId('add-connection-name'), 'L');
    await userEvent.type(screen.getByTestId('add-connection-secret'), 'bad');
    await userEvent.click(screen.getByTestId('add-connection-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication required');
    expect(screen.getByTestId('add-connection-name')).toHaveValue('L');
    expect(screen.getByTestId('add-connection-secret')).toHaveValue('');
  });

  it('tests and removes a connection', async () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.click(card().getByTestId('tracker-connection-test'));
    expect(actions.testConnection).toHaveBeenCalledWith('c1');
    await userEvent.click(card().getByTestId('tracker-connection-remove'));
    await userEvent.click(await screen.findByTestId('tracker-connection-remove-confirm'));
    expect(actions.removeConnection).toHaveBeenCalledWith('c1');
  });

  it('adds a two-way rule into a project', async () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.selectOptions(card().getByTestId('add-rule-project'), 'p1');
    await userEvent.type(card().getByTestId('add-rule-scope'), 'project = OPS');
    await userEvent.click(card().getByTestId('add-rule-two-way'));
    await userEvent.clear(card().getByTestId('add-rule-every'));
    await userEvent.type(card().getByTestId('add-rule-every'), '30');
    await userEvent.click(card().getByTestId('add-rule-submit'));
    expect(actions.createTrackerSyncRule).toHaveBeenCalledWith({
      connection: 'c1',
      project: 'p1',
      scope: 'project = OPS',
      direction: TrackerSyncDirection.TwoWay,
      intervalMinutes: 30,
    });
  });

  it('pauses, runs and removes a rule', async () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.click(card().getByTestId('tracker-rule-toggle-r1'));
    expect(actions.setTrackerSyncRuleEnabled).toHaveBeenCalledWith('r1', false);
    await userEvent.click(card().getByTestId('tracker-rule-run-r1'));
    expect(actions.runTrackerSync).toHaveBeenCalledWith('r1');
    await userEvent.click(card().getByTestId('tracker-rule-remove-r1'));
    expect(actions.removeTrackerSyncRule).toHaveBeenCalledWith('r1');
  });

  it('syncs everything now and reports an error', async () => {
    actions.runTrackerSync.mockResolvedValue({ ok: false, error: 'Jira: rate limited' });
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.click(screen.getByTestId('trackers-sync-all'));
    expect(actions.runTrackerSync).toHaveBeenCalledWith(undefined);
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limited');
  });

  it('shows the empty state', () => {
    render(<TrackersPageClient overview={{ ...OVERVIEW, connections: [] }} />);
    expect(screen.getByTestId('trackers-empty')).toBeInTheDocument();
  });
});
