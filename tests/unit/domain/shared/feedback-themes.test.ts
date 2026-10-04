import { describe, it, expect } from 'vitest';
import { groupIntoThemes } from '@/domain/shared/feedback-themes.js';
import { textTerms } from '@/domain/shared/text-terms.js';
import { SignalKind, type Signal } from '@/domain/generated/output.js';

const T = new Date('2026-10-05T10:00:00Z');

function signal(id: string, title: string, minutes: number, extra: Partial<Signal> = {}): Signal {
  const at = new Date(T.getTime() + minutes * 60_000);
  return {
    id,
    spaceId: 's',
    kind: SignalKind.Feedback,
    title,
    urgent: false,
    createdAt: at,
    updatedAt: at,
    ...extra,
  };
}

describe('textTerms', () => {
  it('keeps meaningful words, folds plurals and drops stopwords', () => {
    expect([...textTerms('The invoices should show PO numbers, and the dates!')]).toEqual([
      'invoice',
      'show',
      'number',
      'date',
    ]);
  });
});

describe('groupIntoThemes', () => {
  const signals = [
    signal('a', 'Checkout times out for guest users', 0, {
      customer: 'Globex',
      monthlyRevenue: 3000,
    }),
    signal('b', 'Guest checkout timeout on mobile', 1, { customer: 'Initech', urgent: true }),
    signal('c', 'Checkout timeout again for guests', 2, {
      customer: 'Globex',
      monthlyRevenue: 5000,
    }),
    signal('d', 'Invoices should show the PO number', 3),
    signal('e', 'Show PO number on invoice PDF', 4),
    signal('f', 'Dark mode please', 5),
  ];

  it('groups similar signals, biggest first, and leaves loners out', () => {
    const themes = groupIntoThemes(signals);
    expect(themes.map((t) => t.signals.map((s) => s.id))).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });

  it('labels a theme by its most common terms and keys it by its oldest signal', () => {
    const [checkout, invoices] = groupIntoThemes(signals);
    expect(checkout.key).toBe('a');
    expect(checkout.label.split(' ')).toContain('checkout');
    expect(checkout.label.split(' ')).toContain('guest');
    expect(invoices.label.split(' ')).toEqual(expect.arrayContaining(['invoice', 'number']));
    expect(checkout.evidence).toEqual({
      signals: 3,
      customers: 2,
      revenueAtStake: 5000,
      urgentSignals: 1,
    });
  });

  it('is deterministic whatever the input order', () => {
    const shuffled = [signals[4], signals[0], signals[5], signals[2], signals[3], signals[1]];
    expect(groupIntoThemes(shuffled)).toEqual(groupIntoThemes(signals));
  });

  it('finds nothing in an empty or unrelated list', () => {
    expect(groupIntoThemes([])).toEqual([]);
    expect(groupIntoThemes([signals[0], signals[3], signals[5]])).toEqual([]);
  });
});

describe('textTerms plurals', () => {
  it('folds common plurals and leaves singular words ending in s alone', () => {
    expect([...textTerms('stories boxes classes invoices status analysis guests')]).toEqual([
      'story',
      'box',
      'class',
      'invoice',
      'status',
      'analysis',
      'guest',
    ]);
  });
});
