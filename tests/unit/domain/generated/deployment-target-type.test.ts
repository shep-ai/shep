/**
 * DeploymentTargetType Generated Enum Tests
 *
 * Spec 108 promotes the raw `'application' | 'feature' | 'repository'` string
 * union — passed through IDeploymentService.start(), setTransientState() and
 * IDevServerAgentService.startDevServer() — to a TypeSpec enum (NFR-7).
 *
 * The member VALUES must stay byte-identical to the strings already persisted
 * in `dev_servers.target_type`; this suite is what stops a rename from
 * silently orphaning existing rows.
 */

import { describe, it, expect } from 'vitest';
import { DeploymentTargetType } from '@/domain/generated/output.js';

describe('DeploymentTargetType enum', () => {
  it('should have exactly 3 values', () => {
    expect(Object.values(DeploymentTargetType)).toHaveLength(3);
  });

  it('should keep the persisted lowercase string values unchanged', () => {
    expect(DeploymentTargetType.Application).toBe('application');
    expect(DeploymentTargetType.Feature).toBe('feature');
    expect(DeploymentTargetType.Repository).toBe('repository');
  });
});
