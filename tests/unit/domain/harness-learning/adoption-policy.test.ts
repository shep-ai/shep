import { describe, it, expect } from 'vitest';
import { canAutoAdopt, needsHumanAdoption } from '@/domain/harness-learning/adoption-policy.js';
import {
  HarnessAdoptionPolicy,
  HarnessComponentKind,
  HarnessOrigin,
  type HarnessComponent,
} from '@/domain/generated/output.js';

const c = (kind: HarnessComponentKind): HarnessComponent => ({
  kind,
  path: 'p',
  content: 'x',
  sha256: 'h',
});
const TEXT = [c(HarnessComponentKind.Instructions), c(HarnessComponentKind.Skill)];
const EXEC = [...TEXT, c(HarnessComponentKind.Script)];

describe('adoption policy', () => {
  it('needs a person for any script or hook', () => {
    expect(needsHumanAdoption(TEXT)).toBe(false);
    expect(needsHumanAdoption(EXEC)).toBe(true);
    expect(needsHumanAdoption([c(HarnessComponentKind.Hook)])).toBe(true);
  });

  it.each<[HarnessAdoptionPolicy, HarnessOrigin, HarnessComponent[], boolean]>([
    [HarnessAdoptionPolicy.Manual, HarnessOrigin.Explore, TEXT, false],
    [HarnessAdoptionPolicy.AutoTextOnly, HarnessOrigin.Explore, TEXT, true],
    [HarnessAdoptionPolicy.AutoTextOnly, HarnessOrigin.Reflect, TEXT, false],
    [HarnessAdoptionPolicy.AutoTextOnly, HarnessOrigin.Explore, EXEC, false],
    [HarnessAdoptionPolicy.Auto, HarnessOrigin.Reflect, TEXT, true],
    [HarnessAdoptionPolicy.Auto, HarnessOrigin.Explore, EXEC, false],
  ])('%s + %s → auto-adopt %s', (policy, origin, components, expected) => {
    expect(canAutoAdopt(policy, origin, components)).toBe(expected);
  });
});
