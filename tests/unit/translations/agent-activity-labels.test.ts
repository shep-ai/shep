/**
 * Every agent-activity state and reason (spec 148) has a label in every CLI
 * locale, so a new enum member cannot ship as a raw key.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AgentActivityState, FeatureStateReason } from '@/domain/generated/output.js';

const TRANSLATIONS = join(process.cwd(), 'translations');

describe('agent activity labels', () => {
  const locales = readdirSync(TRANSLATIONS);

  it('covers nine locales', () => {
    expect(locales).toHaveLength(9);
  });

  for (const locale of locales) {
    it(`${locale} labels every state and reason`, () => {
      const cli = JSON.parse(readFileSync(join(TRANSLATIONS, locale, 'cli.json'), 'utf8'));
      const status = cli.commands.feat.status;
      for (const state of Object.values(AgentActivityState)) {
        expect(status.states[state], `${locale} states.${state}`).toBeTruthy();
      }
      for (const reason of Object.values(FeatureStateReason)) {
        expect(status.reasons[reason], `${locale} reasons.${reason}`).toBeTruthy();
      }
    });
  }
});
