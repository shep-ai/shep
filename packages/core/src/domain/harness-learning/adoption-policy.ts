/**
 * When a candidate harness may be adopted without a person (spec 150).
 *
 * Scripts and hooks execute in every later run, so they ALWAYS need a person,
 * whatever the policy. AutoTextOnly additionally requires the candidate to
 * come from a probed Explore run, where edits have real execution contrasts.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import { HarnessAdoptionPolicy, HarnessOrigin, type HarnessComponent } from '../generated/output';
import { EXECUTABLE_KINDS } from './harness-surfaces';

export function needsHumanAdoption(components: readonly HarnessComponent[]): boolean {
  return components.some((c) => EXECUTABLE_KINDS.has(c.kind));
}

export function canAutoAdopt(
  policy: HarnessAdoptionPolicy,
  origin: HarnessOrigin,
  components: readonly HarnessComponent[]
): boolean {
  if (needsHumanAdoption(components)) return false;
  switch (policy) {
    case HarnessAdoptionPolicy.Manual:
      return false;
    case HarnessAdoptionPolicy.AutoTextOnly:
      return origin === HarnessOrigin.Explore;
    case HarnessAdoptionPolicy.Auto:
      return true;
  }
}
