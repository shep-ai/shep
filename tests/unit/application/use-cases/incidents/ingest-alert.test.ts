import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { ManageFeedbackKeysUseCase } from '@/application/use-cases/feedback/manage-feedback-keys.use-case.js';
import { IngestAlertUseCase } from '@/application/use-cases/incidents/ingest-alert.use-case.js';
import { IncidentSeverity, IncidentSource, IntakeRejection } from '@/domain/generated/output.js';
import { ACME } from '../opportunities/opportunity.fixtures.js';
import { incidentWorld } from './incident.fixtures.js';

describe('IngestAlertUseCase', () => {
  let world: ReturnType<typeof incidentWorld>;
  let ingest: IngestAlertUseCase;
  let secret: string;

  beforeEach(async () => {
    world = incidentWorld();
    const keys = new ManageFeedbackKeysUseCase(
      world.keys,
      world.generator,
      world.spaces,
      world.productLines
    );
    const created = await keys.create({ space: 'acme', name: 'Alertmanager' });
    if (!created.ok) throw new Error(created.error);
    secret = created.secret;
    ingest = new IngestAlertUseCase(world.keys, world.generator, world.open);
  });

  it('opens an incident from an alert in the key space, once per open external id', async () => {
    const payload = {
      title: 'CheckoutErrorRate',
      severity: 'Critical',
      detail: 'Error rate 8% over 5m',
      url: 'https://alerts.acme.com/1',
      externalId: 'fp-123',
      namespace: 'shop',
      workload: 'checkout',
    };
    const first = await ingest.execute(secret, payload);
    if (!first.ok) throw new Error(first.error);
    expect(first.duplicate).toBe(false);
    expect(first.incident).toMatchObject({
      spaceId: ACME.id,
      source: IncidentSource.Alert,
      severity: IncidentSeverity.Critical,
      runtimeWorkload: 'checkout',
    });
    const again = await ingest.execute(secret, payload);
    expect(again.ok && again.duplicate).toBe(true);
    expect(world.incidents.rows.size).toBe(1);
    expect([...world.keys.rows.values()][0].lastUsedAt).toBeInstanceOf(Date);
  });

  it('refuses bad keys and bad payloads', async () => {
    const unknown = await ingest.execute('shep_fb_nope', { title: 'x' });
    expect(unknown.ok || unknown.rejection).toBe(IntakeRejection.Unauthorized);
    for (const payload of [
      {},
      { title: 42 },
      { title: 'x', severity: 'Apocalyptic' },
      { title: 'x', url: 'ftp://x' },
      { title: 'x', workload: '--all' },
    ]) {
      const result = await ingest.execute(secret, payload);
      expect(result.ok || result.rejection).toBe(IntakeRejection.Invalid);
    }
    expect(world.incidents.rows.size).toBe(0);
  });
});
