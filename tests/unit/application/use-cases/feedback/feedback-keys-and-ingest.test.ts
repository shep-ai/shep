import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { ManageFeedbackKeysUseCase } from '@/application/use-cases/feedback/manage-feedback-keys.use-case.js';
import { IngestFeedbackUseCase } from '@/application/use-cases/feedback/ingest-feedback.use-case.js';
import { FeedbackRejection, SignalKind } from '@/domain/generated/output.js';
import { ACME } from '../opportunities/opportunity.fixtures.js';
import { feedbackWorld } from './feedback.fixtures.js';

describe('Feedback keys and ingestion', () => {
  let world: ReturnType<typeof feedbackWorld>;
  let keys: ManageFeedbackKeysUseCase;
  let ingest: IngestFeedbackUseCase;
  let secret: string;
  let keyId: string;

  beforeEach(async () => {
    world = feedbackWorld();
    keys = new ManageFeedbackKeysUseCase(
      world.keys,
      world.generator,
      world.spaces,
      world.productLines
    );
    ingest = new IngestFeedbackUseCase(world.keys, world.generator, world.manageSignals);
    const created = await keys.create({ space: 'acme', name: 'Zendesk' });
    if (!created.ok) throw new Error(created.error);
    secret = created.secret;
    keyId = created.key.id;
  });

  it('shows a new key once and stores only its hash', async () => {
    const [stored] = world.keys.rows.values();
    expect(stored.spaceId).toBe(ACME.id);
    expect(JSON.stringify(stored)).not.toContain(secret);
    const listed = await keys.list('acme');
    expect(listed.ok && listed.keys).toEqual([
      expect.not.objectContaining({ keyHash: expect.anything() }),
    ]);
    expect((await keys.create({ name: ' ' })).ok).toBe(false);
  });

  it('records feedback as a signal in the key space and marks the key used', async () => {
    const result = await ingest.execute(secret, {
      text: 'Export to CSV\nWe need it for month-end.',
      detail: 'Finance team',
      customer: 'Globex',
      monthlyRevenue: 1200,
      url: 'https://support.acme.com/t/9',
      urgent: true,
      externalId: 'ticket-9',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.duplicate).toBe(false);
    expect(result.signal).toMatchObject({
      spaceId: ACME.id,
      kind: SignalKind.Feedback,
      title: 'Export to CSV',
      detail: 'We need it for month-end.\n\nFinance team',
      customer: 'Globex',
      monthlyRevenue: 1200,
      urgent: true,
      externalId: 'ticket-9',
    });
    expect(world.keys.rows.get(keyId)?.lastUsedAt).toBeInstanceOf(Date);

    const again = await ingest.execute(secret, { text: 'Export to CSV', externalId: 'ticket-9' });
    expect(again.ok && again.duplicate).toBe(true);
    expect(world.signals.rows.size).toBe(1);
  });

  it('refuses unknown and revoked keys', async () => {
    const unknown = await ingest.execute('shep_fb_nope', { text: 'x' });
    expect(unknown.ok || unknown.rejection).toBe(FeedbackRejection.Unauthorized);
    expect((await ingest.execute('', { text: 'x' })).ok).toBe(false);
    await keys.revoke(keyId);
    const revoked = await ingest.execute(secret, { text: 'x' });
    expect(revoked.ok || revoked.rejection).toBe(FeedbackRejection.Unauthorized);
    expect((await keys.revoke('nope')).ok).toBe(false);
  });

  it('refuses bad payloads', async () => {
    for (const payload of [
      {},
      { text: '  ' },
      { text: 42 },
      { text: 'x', url: 'javascript:alert(1)' },
      { text: 'x', monthlyRevenue: '1000' },
      { text: 'x', monthlyRevenue: -5 },
      { text: 'x', urgent: 'yes' },
      { text: 'x', customer: 'c'.repeat(501) },
    ]) {
      const result = await ingest.execute(secret, payload);
      expect(result.ok || result.rejection).toBe(FeedbackRejection.Invalid);
    }
    expect(world.signals.rows.size).toBe(0);
  });
});
