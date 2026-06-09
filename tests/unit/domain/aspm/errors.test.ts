/**
 * ASPM Domain Error Tests
 *
 * Asserts every ASPM domain error class:
 *  - is an instance of Error
 *  - has a stable .name matching the class
 *  - has a stable .code identifying the error category
 *  - includes its identifying argument(s) in .message
 */
import { describe, it, expect } from 'vitest';
import { FindingNotFoundError } from '@/domain/aspm/errors/finding-not-found.error.js';
import { CampaignClosedError } from '@/domain/aspm/errors/campaign-closed.error.js';
import { OwnerOrphanedFindingError } from '@/domain/aspm/errors/owner-orphaned-finding.error.js';
import { ExceptionExpiredError } from '@/domain/aspm/errors/exception-expired.error.js';
import { AiSignalAlreadyGraduatedError } from '@/domain/aspm/errors/ai-signal-already-graduated.error.js';
import { IngestionTooLargeError } from '@/domain/aspm/errors/ingestion-too-large.error.js';

describe('FindingNotFoundError', () => {
  it('is an Error with stable name + code and contains the finding id', () => {
    const err = new FindingNotFoundError('finding-1');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FindingNotFoundError');
    expect(err.code).toBe('ASPM_FINDING_NOT_FOUND');
    expect(err.message).toContain('finding-1');
    expect(err.findingId).toBe('finding-1');
  });
});

describe('CampaignClosedError', () => {
  it('includes campaignId + status in the message', () => {
    const err = new CampaignClosedError('campaign-1', 'Completed');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CampaignClosedError');
    expect(err.code).toBe('ASPM_CAMPAIGN_CLOSED');
    expect(err.message).toContain('campaign-1');
    expect(err.message).toContain('Completed');
  });
});

describe('OwnerOrphanedFindingError', () => {
  it('includes owner id + finding count', () => {
    const err = new OwnerOrphanedFindingError('owner-1', 42);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OwnerOrphanedFindingError');
    expect(err.code).toBe('ASPM_OWNER_ORPHANED_FINDING');
    expect(err.message).toContain('owner-1');
    expect(err.message).toContain('42');
    expect(err.findingCount).toBe(42);
  });
});

describe('ExceptionExpiredError', () => {
  it('includes exception id + expiry timestamp', () => {
    const err = new ExceptionExpiredError('exc-1', '2026-04-01T00:00:00Z');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ExceptionExpiredError');
    expect(err.code).toBe('ASPM_EXCEPTION_EXPIRED');
    expect(err.message).toContain('exc-1');
    expect(err.message).toContain('2026-04-01T00:00:00Z');
  });
});

describe('AiSignalAlreadyGraduatedError', () => {
  it('includes signal id and (optionally) the graduated finding id', () => {
    const withFinding = new AiSignalAlreadyGraduatedError('sig-1', 'finding-9');
    expect(withFinding).toBeInstanceOf(Error);
    expect(withFinding.name).toBe('AiSignalAlreadyGraduatedError');
    expect(withFinding.code).toBe('ASPM_AI_SIGNAL_ALREADY_GRADUATED');
    expect(withFinding.message).toContain('sig-1');
    expect(withFinding.message).toContain('finding-9');

    const withoutFinding = new AiSignalAlreadyGraduatedError('sig-2');
    expect(withoutFinding.message).toContain('sig-2');
  });
});

describe('IngestionTooLargeError', () => {
  it('includes actual + limit byte counts', () => {
    const err = new IngestionTooLargeError(150_000_000, 100_000_000);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('IngestionTooLargeError');
    expect(err.code).toBe('ASPM_INGESTION_TOO_LARGE');
    expect(err.message).toContain('150000000');
    expect(err.message).toContain('100000000');
  });
});
