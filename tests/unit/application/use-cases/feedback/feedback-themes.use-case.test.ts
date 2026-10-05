import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  GetFeedbackThemesUseCase,
  PromoteThemeUseCase,
} from '@/application/use-cases/feedback/feedback-themes.use-case.js';
import { OpportunitySource, OpportunityStatus } from '@/domain/generated/output.js';
import { feedbackWorld } from './feedback.fixtures.js';

describe('Feedback themes', () => {
  let world: ReturnType<typeof feedbackWorld>;
  let themes: GetFeedbackThemesUseCase;
  let promote: PromoteThemeUseCase;

  beforeEach(async () => {
    world = feedbackWorld();
    themes = new GetFeedbackThemesUseCase(world.signals, world.spaces, world.productLines);
    promote = new PromoteThemeUseCase(themes, world.manageOpportunities, world.manageSignals);
    for (const title of [
      'Checkout times out for guests',
      'Guest checkout timeout',
      'Checkout timeout again for guests',
      'Dark mode please',
    ]) {
      await world.manageSignals.record({ space: 'acme', title });
    }
    await world.manageSignals.record({ title: 'Guest checkout timeout' });
  });

  it('groups the unlinked signals of one space', async () => {
    const result = await themes.execute('acme');
    if (!result.ok) throw new Error(result.error);
    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].signals).toHaveLength(3);
    expect(result.themes[0].label).toContain('checkout');
  });

  it('promotes a theme to an opportunity with every signal linked', async () => {
    const found = await themes.execute('acme');
    if (!found.ok) throw new Error(found.error);
    const key = found.themes[0].key;
    const result = await promote.execute({ space: 'acme', theme: key, reviewHours: 6 });
    if (!result.ok) throw new Error(result.error);
    expect(result.linked).toBe(3);
    expect(result.opportunity.status).toBe(OpportunityStatus.Proposed);
    expect(result.opportunity.source).toBe(OpportunitySource.Theme);
    expect(result.opportunity.title.charAt(0)).toBe(
      result.opportunity.title.charAt(0).toUpperCase()
    );
    const linked = await world.signals.list({ opportunityId: result.opportunity.id });
    expect(linked).toHaveLength(3);
    const after = await themes.execute('acme');
    expect(after.ok && after.themes).toEqual([]);
  });

  it('refuses an unknown theme and a bad estimate', async () => {
    expect((await promote.execute({ space: 'acme', theme: 'nope', reviewHours: 2 })).ok).toBe(
      false
    );
    const found = await themes.execute('acme');
    if (!found.ok) throw new Error(found.error);
    const bad = await promote.execute({
      space: 'acme',
      theme: found.themes[0].key,
      reviewHours: 0,
    });
    expect(bad.ok).toBe(false);
    expect(world.opportunities.rows.size).toBe(0);
  });
});
