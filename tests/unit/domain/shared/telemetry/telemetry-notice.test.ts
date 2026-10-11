import { describe, it, expect } from 'vitest';
import {
  TELEMETRY_ANONYMOUS_FIELDS,
  TELEMETRY_IDENTITY_FIELDS,
  TELEMETRY_NOTICE_FIELDS,
} from '@/domain/shared/telemetry/telemetry-notice.js';

describe('telemetry notice fields', () => {
  it('keeps the identity fields apart from what is always sent', () => {
    expect(TELEMETRY_IDENTITY_FIELDS).toEqual([
      'agentAccountHash',
      'githubUsername',
      'githubOwners',
    ]);
    expect(TELEMETRY_ANONYMOUS_FIELDS).toEqual([
      'installId',
      'usage',
      'platform',
      'contactConsent',
    ]);
  });

  it('names every field exactly once', () => {
    expect([...TELEMETRY_NOTICE_FIELDS].sort()).toEqual(
      [...TELEMETRY_ANONYMOUS_FIELDS, ...TELEMETRY_IDENTITY_FIELDS].sort()
    );
  });
});
