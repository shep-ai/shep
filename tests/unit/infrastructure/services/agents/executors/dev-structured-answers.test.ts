/**
 * The dev agent answers the factory's structured prompts (specs 123, 128,
 * 129) with fixtures, so investigations, discovery and incident triage can
 * run locally without an agent account.
 */

import { describe, it, expect } from 'vitest';
import { devStructuredAnswer } from '@/infrastructure/services/agents/common/executors/dev-structured-answers.js';

const DISCOVERY = `You are the product discovery agent for the "Acme" space. Read the evidence below.

## Signals not linked to any opportunity

- [sig-1] Guest checkout times out (Feedback, Globex, 4000/month, urgent)
- [sig-2] Checkout timeout for guests (Feedback, Initech)
- [sig-3] Invoices should show the PO number (Feedback, Hooli)

## Themes among them

- checkout guest timeout: sig-1, sig-2

## Open opportunities

(none)`;

describe('devStructuredAnswer', () => {
  it('proposes one opportunity per theme, citing its signals', () => {
    const answer = JSON.parse(devStructuredAnswer(DISCOVERY) ?? '{}');
    expect(answer.proposals).toHaveLength(1);
    expect(answer.proposals[0]).toMatchObject({ signalIds: ['sig-1', 'sig-2'] });
    expect(answer.proposals[0].title).toContain('checkout guest timeout');
  });

  it('falls back to the loose signals when there are no themes', () => {
    const prompt = DISCOVERY.replace('- checkout guest timeout: sig-1, sig-2', '(none)');
    const answer = JSON.parse(devStructuredAnswer(prompt) ?? '{}');
    expect(answer.proposals[0].signalIds).toEqual(['sig-1']);
  });

  it('triages an incident with ranked causes and a rollback', () => {
    const answer = JSON.parse(
      devStructuredAnswer(
        'You are triaging a production incident. Read what is known.\n\nIncident: Checkout 5xx\nWorkload (Kubernetes deployment): shop/checkout'
      ) ?? '{}'
    );
    expect(answer.summary).toContain('Checkout 5xx');
    expect(answer.hypotheses[0].confidence).toBe('High');
    expect(answer.action.kind).toBe('Rollback');
  });

  it('proposes no action for an incident without a workload', () => {
    const answer = JSON.parse(
      devStructuredAnswer(
        'You are triaging a production incident.\n\nIncident: Slow\nWorkload (Kubernetes deployment): not named'
      ) ?? '{}'
    );
    expect(answer.action.kind).toBe('None');
  });

  it('investigates a bug with a High-confidence top hypothesis', () => {
    const answer = JSON.parse(
      devStructuredAnswer(
        'You are investigating a bug report against the repository in your current directory.\n\nKey: PAY-42\nTitle: Refund fails for guests'
      ) ?? '{}'
    );
    expect(answer.summary).toContain('PAY-42');
    expect(answer.hypotheses[0].confidence).toBe('High');
    expect(answer.hypotheses[0].evidence[0].file).toBeTruthy();
  });

  it('leaves other prompts alone', () => {
    expect(devStructuredAnswer('Write your research to: /x')).toBeUndefined();
  });
});
