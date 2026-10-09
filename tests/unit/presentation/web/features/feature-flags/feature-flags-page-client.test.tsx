import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeatureFlagGroup } from '@shepai/core/domain/generated/output';
import type { FeatureFlagState } from '@shepai/core/application/use-cases/settings/list-feature-flags.use-case';

const { setFeatureFlagMock, toastError } = vi.hoisted(() => ({
  setFeatureFlagMock: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('@/app/actions/set-feature-flag', () => ({ setFeatureFlag: setFeatureFlagMock }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));

import { FeatureFlagsPageClient } from '@/components/features/feature-flags/feature-flags-page-client';

const FLAGS: FeatureFlagState[] = [
  {
    key: 'aspm',
    group: FeatureFlagGroup.Platform,
    description: 'ASPM',
    enabled: false,
    defaultEnabled: false,
  },
  {
    key: 'spaces',
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Spaces',
    enabled: true,
    defaultEnabled: true,
  },
];

describe('FeatureFlagsPageClient (spec 133)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists every flag with a switch, its default and how many are on', () => {
    render(<FeatureFlagsPageClient initialFlags={FLAGS} />);

    expect(screen.getByTestId('switch-flag-aspm')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('switch-flag-spaces')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('flag-default-aspm')).toHaveTextContent('Default: off');
    expect(screen.getByTestId('flag-default-spaces')).toHaveTextContent('Default: on');
    expect(screen.getByTestId('feature-flags-count')).toHaveTextContent('1 of 2 on');
  });

  it('saves a toggle through the server action', async () => {
    setFeatureFlagMock.mockResolvedValue({ ok: true });
    render(<FeatureFlagsPageClient initialFlags={FLAGS} />);

    await userEvent.click(screen.getByTestId('switch-flag-aspm'));

    expect(setFeatureFlagMock).toHaveBeenCalledWith('aspm', true);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(screen.getByTestId('switch-flag-aspm')).toHaveAttribute('data-state', 'checked');
  });

  it('puts the switch back and reports the error when saving fails', async () => {
    setFeatureFlagMock.mockResolvedValue({ ok: false, error: 'DB locked' });
    render(<FeatureFlagsPageClient initialFlags={FLAGS} />);

    await userEvent.click(screen.getByTestId('switch-flag-spaces'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('DB locked'));
    expect(screen.getByTestId('switch-flag-spaces')).toHaveAttribute('data-state', 'checked');
  });
});
