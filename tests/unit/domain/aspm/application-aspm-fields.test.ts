/**
 * Application TypeSpec — ASPM Field Extension Tests
 *
 * Verifies the generated Application type from TypeSpec exposes the
 * four optional ASPM context fields:
 *
 *  - criticality?:        Criticality
 *  - exposure?:           Exposure
 *  - dataClassification?: DataClassification
 *  - businessUnit?:       string
 *
 * The fields are explicitly optional — every Application created before
 * feature 098 must continue to typecheck with them absent.
 */
import { describe, it, expect } from 'vitest';
import {
  ApplicationStatus,
  Criticality,
  DataClassification,
  Exposure,
  type Application,
} from '@/domain/generated/output.js';

const baseApplication = (): Pick<
  Application,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'slug'
  | 'description'
  | 'repositoryPath'
  | 'additionalPaths'
  | 'status'
  | 'setupComplete'
> => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  createdAt: '2026-05-19T00:00:00Z',
  updatedAt: '2026-05-19T00:00:00Z',
  name: 'payments',
  slug: 'payments',
  description: 'Payments application',
  repositoryPath: '/repos/payments',
  additionalPaths: [],
  status: ApplicationStatus.Idle,
  setupComplete: true,
});

describe('Application TypeSpec — ASPM fields', () => {
  it('compiles with all four ASPM fields omitted (backward compatibility)', () => {
    const app: Application = baseApplication() as Application;
    expect(app.criticality).toBeUndefined();
    expect(app.exposure).toBeUndefined();
    expect(app.dataClassification).toBeUndefined();
    expect(app.businessUnit).toBeUndefined();
  });

  it('accepts a Criticality enum value on the criticality field', () => {
    const app: Application = {
      ...baseApplication(),
      criticality: Criticality.Tier1,
    } as Application;
    expect(app.criticality).toBe('Tier1');
  });

  it('accepts an Exposure enum value on the exposure field', () => {
    const app: Application = {
      ...baseApplication(),
      exposure: Exposure.Internet,
    } as Application;
    expect(app.exposure).toBe('Internet');
  });

  it('accepts a DataClassification enum value on the dataClassification field', () => {
    const app: Application = {
      ...baseApplication(),
      dataClassification: DataClassification.Restricted,
    } as Application;
    expect(app.dataClassification).toBe('Restricted');
  });

  it('accepts a plain string on the businessUnit field', () => {
    const app: Application = {
      ...baseApplication(),
      businessUnit: 'payments-bu',
    } as Application;
    expect(app.businessUnit).toBe('payments-bu');
  });

  it('accepts every ASPM field set together', () => {
    const app: Application = {
      ...baseApplication(),
      criticality: Criticality.Tier2,
      exposure: Exposure.Internal,
      dataClassification: DataClassification.Confidential,
      businessUnit: 'core-platform',
    } as Application;
    expect(app.criticality).toBe('Tier2');
    expect(app.exposure).toBe('Internal');
    expect(app.dataClassification).toBe('Confidential');
    expect(app.businessUnit).toBe('core-platform');
  });
});
