import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  IncidentEventKind,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  SignalKind,
} from '@/domain/generated/output.js';
import { ACME } from '../opportunities/opportunity.fixtures.js';
import { incidentWorld } from './incident.fixtures.js';

describe('Opening and managing incidents', () => {
  let world: ReturnType<typeof incidentWorld>;

  beforeEach(() => {
    world = incidentWorld();
  });

  it('opens an incident on a workload with an Opened event and an urgent Incident signal', async () => {
    const result = await world.open.execute({
      space: 'acme',
      title: 'Checkout 5xx',
      severity: IncidentSeverity.Critical,
      namespace: 'shop',
      workload: 'checkout',
      context: 'prod',
      url: 'https://grafana.acme.com/d/1',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.duplicate).toBe(false);
    expect(result.incident).toMatchObject({
      spaceId: ACME.id,
      status: IncidentStatus.Open,
      source: IncidentSource.Manual,
      runtimeNamespace: 'shop',
      runtimeWorkload: 'checkout',
      runtimeContext: 'prod',
    });
    const signal = await world.signals.findById(result.incident.signalId ?? '');
    expect(signal).toMatchObject({
      kind: SignalKind.Incident,
      urgent: true,
      title: 'Checkout 5xx',
    });
    expect(world.events.rows.map((e) => e.kind)).toEqual([IncidentEventKind.Opened]);
    expect(world.events.rows[0]?.text).toMatch(/^A person opened a \w+ incident: Checkout 5xx$/);
  });

  it('turns a repeat alert into a note while the incident is open', async () => {
    const first = await world.open.execute({
      space: 'acme',
      title: 'Checkout 5xx',
      source: IncidentSource.Alert,
      externalId: 'alert-9',
    });
    const again = await world.open.execute({
      space: 'acme',
      title: 'Checkout 5xx still firing',
      source: IncidentSource.Alert,
      externalId: 'alert-9',
    });
    if (!first.ok || !again.ok) throw new Error('open failed');
    expect(again).toMatchObject({ duplicate: true, incident: { id: first.incident.id } });
    expect(world.incidents.rows.size).toBe(1);
    expect(world.events.rows.map((e) => e.kind)).toEqual([
      IncidentEventKind.Opened,
      IncidentEventKind.Note,
    ]);
    expect(world.events.rows[0]?.text).toBe('An alert opened a Major incident: Checkout 5xx');
    expect(first.incident.severity).toBe(IncidentSeverity.Major);
  });

  it('refuses a missing title and workload names kubectl would misread', async () => {
    expect((await world.open.execute({ title: ' ' })).ok).toBe(false);
    expect((await world.open.execute({ title: 'x', workload: '--all' })).ok).toBe(false);
    expect(
      (await world.open.execute({ title: 'x', workload: 'web', namespace: 'Bad NS' })).ok
    ).toBe(false);
    expect((await world.open.execute({ title: 'x', workload: 'web', context: '-x' })).ok).toBe(
      false
    );
    expect(world.incidents.rows.size).toBe(0);
  });

  it('notes, resolves with a drafted postmortem, and lists and shows incidents', async () => {
    const opened = await world.open.execute({
      space: 'acme',
      title: 'Slow search',
      severity: IncidentSeverity.Minor,
    });
    if (!opened.ok) throw new Error(opened.error);
    const id = opened.incident.id;
    expect((await world.manage.note(id, 'Index rebuild running')).ok).toBe(true);
    const resolved = await world.manage.resolve(id);
    if (!resolved.ok) throw new Error(resolved.error);
    expect(resolved.incident.status).toBe(IncidentStatus.Resolved);
    expect(resolved.incident.postmortem).toContain('# Postmortem: Slow search');
    expect(resolved.incident.postmortem).toContain('Index rebuild running');
    expect((await world.manage.resolve(id)).ok).toBe(false);

    const own = await world.open.execute({ space: 'acme', title: 'Other' });
    if (!own.ok) throw new Error(own.error);
    const custom = await world.manage.resolve(own.incident.id, '# Ours');
    expect(custom.ok && custom.incident.postmortem).toBe('# Ours');

    const listed = await world.manage.list({ space: ACME.id, open: false });
    expect(listed.map((i) => i.title).sort()).toEqual(['Other', 'Slow search']);
    expect(await world.manage.list({ space: ACME.id, open: true })).toEqual([]);
    const shown = await world.manage.get(id);
    expect(shown.ok && shown.detail.events.map((e) => e.kind)).toEqual([
      IncidentEventKind.Opened,
      IncidentEventKind.Note,
      IncidentEventKind.Resolved,
    ]);
    expect((await world.manage.get('nope')).ok).toBe(false);
  });
});
