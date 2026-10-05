import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IncidentSeverity, RuntimeActionKind } from '@shepai/core/domain/generated/output';
import { IncidentDetail } from '@/components/features/incidents/incident-detail';
import { RuntimeActionRow } from '@/components/features/incidents/runtime-action-row';
import { ActForm } from '@/components/features/incidents/act-form';
import { OpenIncidentForm } from '@/components/features/incidents/open-incident-form';
import { ResolveForm } from '@/components/features/incidents/resolve-form';
import { NoteForm } from '@/components/features/incidents/note-form';
import {
  CHECKOUT,
  DETAIL,
  PROPOSED,
  RESOLVED,
  SUCCEEDED,
} from '@/components/features/incidents/incidents-fixtures';

const actions = vi.hoisted(() => ({
  openIncident: vi.fn(),
  noteIncident: vi.fn(),
  resolveIncident: vi.fn(),
  triageIncident: vi.fn(),
  actOnIncident: vi.fn(),
  approveRuntimeAction: vi.fn(),
  rejectRuntimeAction: vi.fn(),
}));
vi.mock('@/app/actions/incidents', () =>
  Object.fromEntries(
    Object.entries(actions).map(([name, fn]) => [name, (...a: unknown[]) => fn(...a)])
  )
);

const run = vi.fn(async (action: () => Promise<{ ok: boolean }>) => (await action()).ok);

describe('Incident components (spec 129)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: true });
  });

  it('opens an incident with only the filled fields', async () => {
    render(<OpenIncidentForm spaceId="space-acme" run={run} />);
    expect(screen.getByTestId('open-incident-submit')).toBeDisabled();
    await userEvent.type(screen.getByTestId('open-incident-title'), 'Checkout 5xx');
    await userEvent.selectOptions(
      screen.getByTestId('open-incident-severity'),
      IncidentSeverity.Critical
    );
    await userEvent.type(screen.getByTestId('open-incident-workload'), 'checkout');
    await userEvent.click(screen.getByTestId('open-incident-submit'));
    expect(actions.openIncident).toHaveBeenCalledWith({
      space: 'space-acme',
      severity: IncidentSeverity.Critical,
      title: 'Checkout 5xx',
      workload: 'checkout',
    });
    expect(screen.getByTestId('open-incident-title')).toHaveValue('');
  });

  it('triages an open incident and shows its actions and timeline', async () => {
    render(<IncidentDetail detail={DETAIL} run={run} />);
    expect(screen.getByText(CHECKOUT.title)).toBeInTheDocument();
    expect(screen.getByText(/deployment\/checkout in shop \(prod\)/)).toBeInTheDocument();
    expect(screen.getByTestId(`runtime-action-${PROPOSED.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('incident-event-ev-3')).toHaveTextContent('release 4.12.0');
    await userEvent.click(screen.getByTestId('incident-triage'));
    expect(actions.triageIncident).toHaveBeenCalledWith(CHECKOUT.id);
  });

  it('shows a resolved incident with its postmortem and no more actions', () => {
    render(<IncidentDetail detail={{ incident: RESOLVED, events: [], actions: [] }} run={run} />);
    expect(screen.getByTestId('incident-postmortem-text')).toHaveTextContent('Login timeouts');
    expect(screen.queryByTestId('incident-triage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('act-kind')).not.toBeInTheDocument();
    expect(screen.queryByTestId('incident-note-text')).not.toBeInTheDocument();
  });

  it('offers no runtime actions without a workload', () => {
    const incident = { ...CHECKOUT, runtimeWorkload: undefined, runtimeNamespace: undefined };
    render(<IncidentDetail detail={{ incident, events: [], actions: [] }} run={run} />);
    expect(screen.getByText(/No workload/)).toBeInTheDocument();
    expect(screen.queryByTestId('act-kind')).not.toBeInTheDocument();
  });

  it('approves or rejects a proposed action, and shows recovery for a done one', async () => {
    const { rerender } = render(<RuntimeActionRow action={PROPOSED} run={run} />);
    await userEvent.click(screen.getByTestId(`approve-${PROPOSED.id}`));
    expect(actions.approveRuntimeAction).toHaveBeenCalledWith(PROPOSED.id);
    await userEvent.click(screen.getByTestId(`reject-${PROPOSED.id}`));
    expect(actions.rejectRuntimeAction).toHaveBeenCalledWith(PROPOSED.id);

    rerender(<RuntimeActionRow action={SUCCEEDED} run={run} />);
    expect(screen.queryByTestId(`approve-${SUCCEEDED.id}`)).not.toBeInTheDocument();
    expect(screen.getByText('Not recovered')).toBeInTheDocument();
  });

  it('scales with a replica count and restarts without one', async () => {
    render(<ActForm incidentId="inc-1" run={run} />);
    expect(screen.queryByTestId('act-replicas')).not.toBeInTheDocument();
    await userEvent.type(screen.getByTestId('act-reason'), 'stuck pool');
    await userEvent.click(screen.getByTestId('act-submit'));
    expect(actions.actOnIncident).toHaveBeenLastCalledWith(
      'inc-1',
      RuntimeActionKind.Restart,
      'stuck pool',
      undefined
    );

    await userEvent.selectOptions(screen.getByTestId('act-kind'), RuntimeActionKind.Scale);
    expect(screen.getByTestId('act-submit')).toBeDisabled();
    await userEvent.type(screen.getByTestId('act-replicas'), '6');
    await userEvent.click(screen.getByTestId('act-submit'));
    expect(actions.actOnIncident).toHaveBeenLastCalledWith('inc-1', RuntimeActionKind.Scale, '', 6);
  });

  it('resolves with a written postmortem, or none for a draft', async () => {
    render(<ResolveForm incidentId="inc-1" run={run} />);
    await userEvent.click(screen.getByTestId('incident-resolve'));
    expect(actions.resolveIncident).toHaveBeenLastCalledWith('inc-1', undefined);
    await userEvent.type(screen.getByTestId('incident-postmortem'), 'Bad deploy');
    await userEvent.click(screen.getByTestId('incident-resolve'));
    expect(actions.resolveIncident).toHaveBeenLastCalledWith('inc-1', 'Bad deploy');
  });

  it('adds a note and clears the field', async () => {
    render(<NoteForm incidentId="inc-1" run={run} />);
    await userEvent.type(screen.getByTestId('incident-note-text'), 'Paged the DBA');
    await userEvent.click(screen.getByTestId('incident-note-submit'));
    expect(actions.noteIncident).toHaveBeenCalledWith('inc-1', 'Paged the DBA');
    expect(screen.getByTestId('incident-note-text')).toHaveValue('');
  });
});
