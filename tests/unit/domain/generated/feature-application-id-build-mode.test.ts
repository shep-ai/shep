/**
 * Feature TypeSpec — applicationId + buildMode Field Tests
 *
 * Verifies the generated Feature type from TypeSpec exposes the two new
 * domain fields used by the control-center-sdd-mode flow:
 *
 *  - `applicationId?: UUID` — optional parent Application reference.
 *  - `buildMode: BuildMode` — required SDLC pipeline selector.
 *
 * Both fields drive the canvas parent-edge derivation, the persisted
 * "spec mode" identity of a feature run, and downstream queries.
 */

import { describe, it, expect } from 'vitest';
import { BuildMode, type Feature } from '@/domain/generated/output.js';

describe('Feature TypeSpec model — applicationId + buildMode', () => {
  it('exposes a buildMode field of type BuildMode', () => {
    // Compile-time check: the assignment fails to typecheck if the
    // generated Feature does not include `buildMode: BuildMode`.
    const partial: Pick<Feature, 'buildMode'> = {
      buildMode: BuildMode.Spec,
    };

    expect(partial.buildMode).toBe('spec');
  });

  it('accepts each BuildMode value on the buildMode field', () => {
    const application: Pick<Feature, 'buildMode'> = { buildMode: BuildMode.Application };
    const fast: Pick<Feature, 'buildMode'> = { buildMode: BuildMode.Fast };
    const spec: Pick<Feature, 'buildMode'> = { buildMode: BuildMode.Spec };

    expect(application.buildMode).toBe('application');
    expect(fast.buildMode).toBe('fast');
    expect(spec.buildMode).toBe('spec');
  });

  it('exposes an optional applicationId field that accepts a UUID string', () => {
    // Compile-time check: assignment fails to typecheck if applicationId
    // is missing from the generated Feature type.
    const linked: Pick<Feature, 'applicationId'> = {
      applicationId: '550e8400-e29b-41d4-a716-446655440000',
    };
    const unlinked: Pick<Feature, 'applicationId'> = {};

    expect(linked.applicationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(unlinked.applicationId).toBeUndefined();
  });
});
