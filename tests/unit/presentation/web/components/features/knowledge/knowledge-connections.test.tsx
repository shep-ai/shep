/**
 * Notion on the Connections page (spec 125): a knowledge connection shows its
 * sources instead of sync rules, and sources are added, paused, synced and
 * removed through the knowledge server actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ConnectionProvider,
  ConnectionStatus,
  KnowledgeScopeKind,
} from '@shepai/core/domain/generated/output';
import type { TrackerOverview } from '@shepai/core/application/use-cases/trackers/get-tracker-overview.use-case';
import { TrackersPageClient } from '@/components/features/trackers/trackers-page-client';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const actions = vi.hoisted(() => ({
  createConnection: vi.fn(),
  testConnection: vi.fn(),
  removeConnection: vi.fn(),
  createTrackerSyncRule: vi.fn(),
  setTrackerSyncRuleEnabled: vi.fn(),
  removeTrackerSyncRule: vi.fn(),
  runTrackerSync: vi.fn(),
  createKnowledgeSource: vi.fn(),
  setKnowledgeSourceEnabled: vi.fn(),
  removeKnowledgeSource: vi.fn(),
  syncKnowledge: vi.fn(),
}));
const forward = vi.hoisted(
  () => (names: Record<string, (...a: unknown[]) => unknown>) =>
    Object.fromEntries(
      Object.keys(names).map((name) => [name, (...a: unknown[]) => names[name](...a)])
    )
);
vi.mock('@/app/actions/manage-trackers', () => forward(actions));
vi.mock('@/app/actions/manage-knowledge', () => forward(actions));

const T = new Date('2026-10-01T10:00:00Z');
const NOTION = {
  id: 'c-notion',
  provider: ConnectionProvider.Notion,
  name: 'Acme Notion',
  slug: 'acme-notion',
  spaceId: 's-acme',
  accountName: 'Acme',
  status: ConnectionStatus.Connected,
  createdAt: T,
  updatedAt: T,
};
const OVERVIEW: TrackerOverview = {
  connections: [
    {
      connection: NOTION,
      spaceName: 'Acme',
      rules: [],
      sources: [
        {
          source: {
            id: 'src-1',
            connectionId: 'c-notion',
            spaceId: 's-acme',
            productLineId: 'pl-pay',
            scopeId: 'page',
            scopeKind: KnowledgeScopeKind.Page,
            scopeTitle: 'Engineering handbook',
            intervalMinutes: 60,
            enabled: true,
            lastRunAt: T,
            lastRun: { added: 12, updated: 1, removed: 0, failed: 0 },
            createdAt: T,
            updatedAt: T,
          },
          connection: NOTION,
          documents: 13,
        },
      ],
    },
  ],
  spaces: [
    { id: 's-me', name: 'Personal' },
    { id: 's-acme', name: 'Acme' },
  ],
  productLines: [
    { id: 'pl-pay', spaceId: 's-acme', name: 'Payments' },
    { id: 'pl-blog', spaceId: 's-me', name: 'Blog' },
  ],
  projects: [],
};

const card = () => within(screen.getByTestId('tracker-connection-acme-notion'));

describe('Knowledge sources on the Connections page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: true });
  });

  it('shows the sources of a Notion connection instead of sync rules', () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    expect(card().getByText('Engineering handbook')).toBeInTheDocument();
    expect(card().getByText(/13 documents/)).toBeInTheDocument();
    expect(card().getByText(/12 added/)).toBeInTheDocument();
    expect(card().getByText('Payments only')).toBeInTheDocument();
    expect(card().queryByTestId('add-rule-scope')).not.toBeInTheDocument();
  });

  it("adds a source for one of the space's product lines", async () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    const lines = card().getByTestId('add-source-product-line');
    expect(within(lines).queryByText('Blog')).not.toBeInTheDocument();
    await userEvent.type(card().getByTestId('add-source-scope'), 'https://notion.so/Runbooks-abc');
    await userEvent.selectOptions(lines, 'pl-pay');
    await userEvent.clear(card().getByTestId('add-source-every'));
    await userEvent.type(card().getByTestId('add-source-every'), '120');
    await userEvent.click(card().getByTestId('add-source-submit'));
    expect(actions.createKnowledgeSource).toHaveBeenCalledWith({
      connection: 'c-notion',
      scope: 'https://notion.so/Runbooks-abc',
      productLine: 'pl-pay',
      intervalMinutes: 120,
    });
  });

  it('pauses, syncs and removes a source', async () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.click(card().getByTestId('knowledge-source-toggle-src-1'));
    expect(actions.setKnowledgeSourceEnabled).toHaveBeenCalledWith('src-1', false);
    await userEvent.click(card().getByTestId('knowledge-source-sync-src-1'));
    expect(actions.syncKnowledge).toHaveBeenCalledWith('src-1');
    await userEvent.click(card().getByTestId('knowledge-source-remove-src-1'));
    expect(actions.removeKnowledgeSource).toHaveBeenCalledWith('src-1');
  });

  it('connects Notion with only a name, space and integration token', async () => {
    render(<TrackersPageClient overview={OVERVIEW} />);
    await userEvent.selectOptions(
      screen.getByTestId('add-connection-provider'),
      ConnectionProvider.Notion
    );
    expect(screen.queryByTestId('add-connection-site')).not.toBeInTheDocument();
    expect(screen.getByText('Notion integration token')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('add-connection-name'), 'Acme Notion');
    await userEvent.type(screen.getByTestId('add-connection-secret'), 'ntn_x');
    await userEvent.click(screen.getByTestId('add-connection-submit'));
    expect(actions.createConnection).toHaveBeenCalledWith({
      provider: ConnectionProvider.Notion,
      name: 'Acme Notion',
      space: 's-me',
      secret: 'ntn_x',
    });
  });
});
