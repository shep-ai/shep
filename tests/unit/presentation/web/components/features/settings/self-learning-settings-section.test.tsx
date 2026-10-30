import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  HarnessAdoptionPolicy,
  HarnessRecursion,
  LearningMode,
} from '@shepai/core/domain/generated/output';
import { SelfLearningSettingsSection } from '@/components/features/settings/self-learning-settings-section';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }));
vi.mock('@/app/actions/update-settings', () => ({ updateSettingsAction: vi.fn() }));

const STORED = {
  mode: LearningMode.Reflect,
  exploreK: 2,
  exploreRecursion: HarnessRecursion.Sequential,
  exploreMaxCostUsd: 30,
  adoptionPolicy: HarnessAdoptionPolicy.AutoTextOnly,
  alwaysOnCharCap: 3000,
  regressionMinSample: 7,
};

describe('SelfLearningSettingsSection', () => {
  const save = vi.fn();
  beforeEach(() => {
    save.mockReset();
    save.mockResolvedValue({ success: true });
    toastError.mockReset();
  });

  const field = (key: string) => screen.getByTestId(`learning-${key}`) as HTMLInputElement;
  const commit = (key: string, value: string) => {
    fireEvent.change(field(key), { target: { value } });
    fireEvent.blur(field(key));
  };

  it('shows the opt-in defaults when nothing is stored', () => {
    render(<SelfLearningSettingsSection saveSettings={save} />);
    expect(screen.getByTestId('self-learning-settings-section')).toBeDefined();
    expect(field('exploreK').value).toBe('1');
    expect(field('exploreMaxCostUsd').value).toBe('20');
    expect(field('alwaysOnCharCap').value).toBe('4000');
    expect(field('regressionMinSample').value).toBe('5');
  });

  it('reloads every stored value', () => {
    render(<SelfLearningSettingsSection learning={STORED} saveSettings={save} />);
    expect(field('exploreK').value).toBe('2');
    expect(field('exploreMaxCostUsd').value).toBe('30');
    expect(field('alwaysOnCharCap').value).toBe('3000');
    expect(field('regressionMinSample').value).toBe('7');
  });

  it('saves a changed number with every other field kept', async () => {
    render(
      <SelfLearningSettingsSection
        learning={{ ...STORED, futureField: 'kept' } as never}
        saveSettings={save}
      />
    );
    commit('exploreMaxCostUsd', '45');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].learning).toEqual({
      ...STORED,
      exploreMaxCostUsd: 45,
      futureField: 'kept',
    });
  });

  it('clamps k to the supported range and ignores invalid input', async () => {
    render(<SelfLearningSettingsSection saveSettings={save} />);
    commit('exploreK', '-1');
    expect(field('exploreK').value).toBe('1');
    expect(save).not.toHaveBeenCalled();
    commit('exploreK', '9');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].learning.exploreK).toBe(5);
    expect(field('exploreK').value).toBe('5');
  });

  it('reports a failed save', async () => {
    save.mockResolvedValue({ success: false, error: 'disk full' });
    render(<SelfLearningSettingsSection saveSettings={save} />);
    commit('regressionMinSample', '9');
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('disk full'));
  });
});
