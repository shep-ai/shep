/**
 * Harness web components (spec 119): the effect-oriented permission prompt,
 * the per-turn plan table, the sessions list and the settings section.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GrantScope, HarnessSessionOrigin } from '@shepai/core/domain/generated/output';
import { HarnessPermissionCard } from '@/components/features/harness/harness-permission-card';
import { HarnessPlanTable } from '@/components/features/harness/harness-plan-table';
import { HarnessSessionsTable } from '@/components/features/harness/harness-sessions-table';
import { HarnessUsageSummaryView } from '@/components/features/harness/harness-usage-summary';
import {
  fixturePermission,
  fixturePermissionItem,
  fixturePlan,
  fixtureSession,
  fixtureSessionDetail,
  fixtureSessionList,
} from '@/components/features/harness/harness-fixtures';

const mockResolve = vi.fn();
vi.mock('@/app/actions/harness-commands', () => ({
  resolveHarnessPermission: (...args: unknown[]) => mockResolve(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('HarnessPermissionCard', () => {
  beforeEach(() => {
    mockResolve.mockReset();
    mockResolve.mockResolvedValue({ ok: true, data: { id: 'perm-1' } });
  });

  it('shows the agent reason and predicted effects, with feature-run scopes', () => {
    render(<HarnessPermissionCard item={fixturePermissionItem} />);
    expect(screen.getByText('pnpm add jsonwebtoken@9')).toBeDefined();
    expect(screen.getByText(/verify the refresh token/)).toBeDefined();
    expect(screen.getByText('download packages from registry.npmjs.org')).toBeDefined();
    for (const label of ['Allow once', 'Allow for this phase', 'Allow for this feature', 'Deny']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }
  });

  it('allows for the phase and sends the note back to the agent', async () => {
    const onResolved = vi.fn();
    render(<HarnessPermissionCard item={fixturePermissionItem} onResolved={onResolved} />);
    fireEvent.change(screen.getByTestId('harness-permission-note'), {
      target: { value: 'pin to v9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Allow for this phase' }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('perm-1'));
    expect(mockResolve).toHaveBeenCalledWith({
      id: 'perm-1',
      allow: true,
      scope: GrantScope.Task,
      note: 'pin to v9',
    });
  });

  it('denies without a scope', async () => {
    render(<HarnessPermissionCard item={fixturePermissionItem} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith({ id: 'perm-1', allow: false }));
  });

  it('uses session vocabulary for standalone runs', () => {
    render(
      <HarnessPermissionCard
        item={{
          ...fixturePermissionItem,
          session: { ...fixtureSession, origin: HarnessSessionOrigin.Standalone },
          scopes: [GrantScope.Once, GrantScope.Session],
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'Allow for this session' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Allow for this phase' })).toBeNull();
  });

  it('never offers a hard deny as approvable', () => {
    render(
      <HarnessPermissionCard
        item={{
          ...fixturePermissionItem,
          approvable: false,
          decision: { ...fixturePermission, hard: true },
        }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Allow once' })).toBeNull();
    expect(screen.getByText(/cannot be approved/)).toBeDefined();
  });
});

describe('HarnessPlanTable', () => {
  it('lists every candidate with visibility, shown/raw tokens and relevance', () => {
    const onView = vi.fn();
    const onWhy = vi.fn();
    render(<HarnessPlanTable plan={fixturePlan} onView={onView} onWhy={onWhy} />);
    expect(screen.getByText(/2.9k of 56.0k tokens/)).toBeDefined();
    expect(screen.getByText('0.71')).toBeDefined();
    expect(screen.getByText('180/1.2k')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Why?' })[2]);
    expect(onWhy).toHaveBeenCalledWith('c-search');
    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[3]);
    expect(onView).toHaveBeenCalledWith('c-file', 'src/auth/refresh.ts');
  });
});

describe('HarnessSessionsTable and usage', () => {
  it('links sessions and flags pending approvals', () => {
    render(<HarnessSessionsTable items={fixtureSessionList} />);
    expect(screen.getByText('Fix refresh token expiry').closest('a')?.getAttribute('href')).toBe(
      `/harness/${fixtureSession.id}`
    );
    expect(screen.getByText('1 waiting')).toBeDefined();
  });

  it('shows how much raw tool output the model actually saw', () => {
    render(<HarnessUsageSummaryView usage={fixtureSessionDetail.usage} />);
    expect(screen.getByText('12%')).toBeDefined();
    expect(screen.getByText('$0.0412')).toBeDefined();
  });
});
