import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LearningPageClient } from '@/components/features/learning/learning-page-client';
import { learningHref } from '@/components/features/learning/learning-types';
import {
  ADOPTED,
  CANDIDATE_DETAIL,
  EMPTY_HISTORY,
  HISTORY,
  REPOSITORIES,
} from '@/components/features/learning/learning-fixtures';
import { LearnedHarnessStatus } from '@shepai/core/domain/generated/output';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const actions = vi.hoisted(() => ({
  adoptHarnessVersion: vi.fn(),
  rejectHarnessVersion: vi.fn(),
  rollbackHarness: vi.fn(),
}));
vi.mock('@/app/actions/learning', () => actions);

describe('LearningPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const a of Object.values(actions)) a.mockResolvedValue({ ok: true });
  });

  const renderPage = () =>
    render(
      <LearningPageClient repositories={REPOSITORIES} history={HISTORY} detail={CANDIDATE_DETAIL} />
    );

  it('shows the versions with their status, the regression flag, the diff and the lessons', () => {
    renderPage();
    expect(screen.getByTestId('learning-current').textContent).toContain(ADOPTED.id.slice(0, 8));
    expect(screen.getByTestId('harness-version-list').querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByTestId('version-regressed')).toBeDefined();
    expect(screen.getByTestId('harness-diff-text').textContent).toContain('check_migrations.sh');
    expect(screen.getByTestId('harness-runs-code')).toBeDefined();
    expect(screen.getByTestId('harness-lessons').textContent).toContain('backfill');
  });

  it('links each version to its own URL, keeping the repository', () => {
    renderPage();
    const link = screen.getByTestId(`harness-version-${ADOPTED.id.slice(0, 8)}`);
    expect(link.getAttribute('href')).toBe(learningHref(HISTORY.repositoryPath, ADOPTED.id));
  });

  it('adopts the candidate and refreshes the page', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('harness-adopt'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(actions.adoptHarnessVersion).toHaveBeenCalledWith(CANDIDATE_DETAIL.version.id);
  });

  it('rejects the candidate with the feedback typed', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('harness-reject-feedback'), {
      target: { value: ' too noisy ' },
    });
    fireEvent.click(screen.getByTestId('harness-reject'));
    await waitFor(() =>
      expect(actions.rejectHarnessVersion).toHaveBeenCalledWith(
        CANDIDATE_DETAIL.version.id,
        'too noisy'
      )
    );
  });

  it('rolls back only after confirmation, and reports a refusal', async () => {
    actions.rollbackHarness.mockResolvedValue({ ok: false, error: 'nothing adopted' });
    renderPage();
    fireEvent.click(screen.getByTestId('learning-rollback'));
    expect(actions.rollbackHarness).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('learning-rollback-confirm'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nothing adopted'));
    expect(actions.rollbackHarness).toHaveBeenCalledWith(HISTORY.repositoryPath);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('offers no actions on the adopted version and no rollback without one', () => {
    render(
      <LearningPageClient
        repositories={REPOSITORIES}
        history={EMPTY_HISTORY}
        detail={{
          ...CANDIDATE_DETAIL,
          version: { ...ADOPTED, status: LearnedHarnessStatus.Adopted },
        }}
      />
    );
    expect(screen.queryByTestId('harness-adopt')).toBeNull();
    expect(screen.queryByTestId('learning-rollback')).toBeNull();
    expect(screen.getByTestId('learning-no-versions')).toBeDefined();
    expect(screen.getByTestId('learning-no-lessons')).toBeDefined();
  });

  it('shows a load error and the no-repository state', () => {
    render(<LearningPageClient repositories={[]} loadError="database locked" />);
    expect(screen.getByRole('alert').textContent).toContain('database locked');
    render(<LearningPageClient repositories={[]} />);
    expect(screen.getByTestId('learning-no-repositories')).toBeDefined();
  });
});
