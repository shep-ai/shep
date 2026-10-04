/**
 * Feedback intake (spec 127), end to end through a real DI container and
 * SQLite: a key per space, posted feedback deduplicated by external id, and
 * a theme promoted to an opportunity.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { registerSpaces } from '@/infrastructure/di/modules/register-spaces.js';
import { registerOpportunities } from '@/infrastructure/di/modules/register-opportunities.js';
import { registerFeedback } from '@/infrastructure/di/modules/register-feedback.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { ManageFeedbackKeysUseCase } from '@/application/use-cases/feedback/manage-feedback-keys.use-case.js';
import { IngestFeedbackUseCase } from '@/application/use-cases/feedback/ingest-feedback.use-case.js';
import {
  GetFeedbackThemesUseCase,
  PromoteThemeUseCase,
} from '@/application/use-cases/feedback/feedback-themes.use-case.js';
import { FeedbackRejection } from '@/domain/generated/output.js';

describe('Feedback intake (integration)', () => {
  let db: Database.Database;
  let c: DependencyContainer;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    c = rootContainer.createChildContainer();
    c.registerInstance<Database.Database>('Database', db);
    registerRepositories(c);
    registerSpaces(c);
    registerOpportunities(c);
    registerFeedback(c);
    expect((await c.resolve(ManageSpacesUseCase).create({ name: 'Acme' })).ok).toBe(true);
  });

  afterEach(() => {
    c.dispose();
    db.close();
  });

  it('turns posted feedback into a promoted theme', async () => {
    const key = await c
      .resolve(ManageFeedbackKeysUseCase)
      .create({ space: 'acme', name: 'Zendesk' });
    if (!key.ok) throw new Error(key.error);
    expect(db.prepare('SELECT key_hash FROM feedback_keys').pluck().get()).not.toBe(key.secret);

    const ingest = c.resolve(IngestFeedbackUseCase);
    const tickets = [
      ['t-1', 'Guest checkout times out', 'Globex'],
      ['t-2', 'Checkout timeout for guest users', 'Initech'],
      ['t-3', 'Guest checkout timeout again', 'Globex'],
    ];
    for (const [externalId, text, customer] of tickets) {
      const result = await ingest.execute(key.secret, { text, customer, externalId });
      expect(result.ok && result.duplicate).toBe(false);
    }
    const retry = await ingest.execute(key.secret, {
      text: 'Guest checkout times out',
      externalId: 't-1',
    });
    expect(retry.ok && retry.duplicate).toBe(true);
    const wrong = await ingest.execute(`${key.secret}x`, { text: 'x' });
    expect(wrong.ok || wrong.rejection).toBe(FeedbackRejection.Unauthorized);

    const themes = await c.resolve(GetFeedbackThemesUseCase).execute('acme');
    if (!themes.ok) throw new Error(themes.error);
    expect(themes.themes).toHaveLength(1);
    expect(themes.themes[0].evidence.customers).toBe(2);

    const promoted = await c
      .resolve(PromoteThemeUseCase)
      .execute({ space: 'acme', theme: themes.themes[0].key, reviewHours: 5 });
    expect(promoted.ok && promoted.linked).toBe(3);
  });
});
