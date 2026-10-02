import { describe, it, expect } from 'vitest';
import { PermissionEffect as E } from '@/domain/generated/output.js';
import {
  applyGrant,
  combineRuleEffects,
  resolveAsk,
} from '@/domain/harness/permission-precedence.js';

describe('permission precedence', () => {
  it('falls back to the unknown default when no rule matches', () => {
    expect(combineRuleEffects([], E.Ask)).toEqual({
      effect: E.Ask,
      hard: false,
      matchedRuleIds: [],
    });
  });

  it('deny beats ask beats allow', () => {
    const r = combineRuleEffects(
      [
        { ruleId: 'a', effect: E.Allow, hard: false },
        { ruleId: 'b', effect: E.Ask, hard: false },
        { ruleId: 'c', effect: E.Deny, hard: false },
      ],
      E.Ask
    );
    expect(r.effect).toBe(E.Deny);
    expect(r.matchedRuleIds).toEqual(['a', 'b', 'c']);
  });

  it('a hard deny is reported as hard', () => {
    const r = combineRuleEffects([{ ruleId: 'ssh', effect: E.Deny, hard: true }], E.Ask);
    expect(r).toMatchObject({ effect: E.Deny, hard: true });
  });

  it('a grant turns ask into allow', () => {
    expect(applyGrant({ effect: E.Ask, hard: false, matchedRuleIds: [] }, true)).toBe(E.Allow);
  });

  it('a grant never lifts a deny, hard or not', () => {
    expect(applyGrant({ effect: E.Deny, hard: true, matchedRuleIds: [] }, true)).toBe(E.Deny);
    expect(applyGrant({ effect: E.Deny, hard: false, matchedRuleIds: [] }, true)).toBe(E.Deny);
  });

  it('ask becomes the non-interactive effect when nobody can answer', () => {
    expect(resolveAsk(E.Ask, false, E.Deny)).toBe(E.Deny);
    expect(resolveAsk(E.Ask, true, E.Deny)).toBe(E.Ask);
    expect(resolveAsk(E.Allow, false, E.Deny)).toBe(E.Allow);
  });
});
