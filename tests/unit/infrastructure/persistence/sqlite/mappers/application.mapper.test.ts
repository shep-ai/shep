import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type ApplicationRow,
} from '@/infrastructure/persistence/sqlite/mappers/application.mapper.js';
import { ApplicationStatus, ScanStageName, type Application } from '@/domain/generated/output.js';

function createTestApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-abc-123',
    name: 'My Application',
    slug: 'my-application',
    description: 'A test application',
    repositoryPath: '/Users/test/my-project',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: false,
    bedrockEnabled: false,
    createdAt: new Date('2025-06-01T10:00:00Z'),
    updatedAt: new Date('2025-06-01T12:00:00Z'),
    ...overrides,
  };
}

function createTestRow(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: 'app-abc-123',
    name: 'My Application',
    slug: 'my-application',
    description: 'A test application',
    repository_path: '/Users/test/my-project',
    additional_paths: '[]',
    agent_type: null,
    model_override: null,
    status: 'Idle',
    setup_complete: 0,
    agent_session_id: null,
    git_remote_url: null,
    cloud_deployment_provider: null,
    cloud_deployment_status: null,
    cloud_deployment_id: null,
    cloud_deployment_url: null,
    cloud_deployment_error: null,
    last_deployed_at: null,
    bedrock_enabled: 0,
    criticality: null,
    exposure: null,
    data_classification: null,
    business_unit: null,
    scanner_profile_json: '{}',
    last_scanned_at: null,
    created_at: new Date('2025-06-01T10:00:00Z').getTime(),
    updated_at: new Date('2025-06-01T12:00:00Z').getTime(),
    deleted_at: null,
    ...overrides,
  };
}

describe('Application Mapper', () => {
  describe('toDatabase', () => {
    it('should map all fields to snake_case columns', () => {
      const app = createTestApplication();
      const row = toDatabase(app);

      expect(row.id).toBe('app-abc-123');
      expect(row.name).toBe('My Application');
      expect(row.slug).toBe('my-application');
      expect(row.description).toBe('A test application');
      expect(row.repository_path).toBe('/Users/test/my-project');
      expect(row.additional_paths).toBe('[]');
      expect(row.status).toBe('Idle');
      expect(row.created_at).toBe(new Date('2025-06-01T10:00:00Z').getTime());
      expect(row.updated_at).toBe(new Date('2025-06-01T12:00:00Z').getTime());
    });

    it('should convert Date objects to unix milliseconds', () => {
      const date = new Date('2025-01-15T08:30:00Z');
      const app = createTestApplication({ createdAt: date });
      const row = toDatabase(app);

      expect(row.created_at).toBe(date.getTime());
    });

    it('should serialize additionalPaths as JSON string', () => {
      const app = createTestApplication({ additionalPaths: ['/path/a', '/path/b'] });
      const row = toDatabase(app);

      expect(row.additional_paths).toBe('["/path/a","/path/b"]');
    });

    it('should serialize empty additionalPaths as empty JSON array', () => {
      const app = createTestApplication({ additionalPaths: [] });
      const row = toDatabase(app);

      expect(row.additional_paths).toBe('[]');
    });

    it('should map undefined additionalPaths to empty JSON array', () => {
      const app = createTestApplication({ additionalPaths: undefined });
      const row = toDatabase(app);

      expect(row.additional_paths).toBe('[]');
    });

    it('should map undefined agentType to null', () => {
      const app = createTestApplication();
      const row = toDatabase(app);

      expect(row.agent_type).toBeNull();
    });

    it('should map agentType to agent_type column', () => {
      const app = createTestApplication({ agentType: 'claude' });
      const row = toDatabase(app);

      expect(row.agent_type).toBe('claude');
    });

    it('should map undefined modelOverride to null', () => {
      const app = createTestApplication();
      const row = toDatabase(app);

      expect(row.model_override).toBeNull();
    });

    it('should map modelOverride to model_override column', () => {
      const app = createTestApplication({ modelOverride: 'claude-opus-4' });
      const row = toDatabase(app);

      expect(row.model_override).toBe('claude-opus-4');
    });
  });

  describe('fromDatabase', () => {
    it('should map all columns to camelCase fields', () => {
      const row = createTestRow();
      const app = fromDatabase(row);

      expect(app.id).toBe('app-abc-123');
      expect(app.name).toBe('My Application');
      expect(app.slug).toBe('my-application');
      expect(app.description).toBe('A test application');
      expect(app.repositoryPath).toBe('/Users/test/my-project');
      expect(app.additionalPaths).toEqual([]);
      expect(app.status).toBe('Idle');
      expect(app.createdAt).toBeInstanceOf(Date);
      expect(app.updatedAt).toBeInstanceOf(Date);
    });

    it('should convert unix milliseconds back to Date objects', () => {
      const date = new Date('2025-01-15T08:30:00Z');
      const row = createTestRow({ created_at: date.getTime() });
      const app = fromDatabase(row);

      expect(app.createdAt).toEqual(date);
    });

    it('should deserialize additionalPaths from JSON string', () => {
      const row = createTestRow({ additional_paths: '["/path/a","/path/b"]' });
      const app = fromDatabase(row);

      expect(app.additionalPaths).toEqual(['/path/a', '/path/b']);
    });

    it('should deserialize empty JSON array to empty additionalPaths', () => {
      const row = createTestRow({ additional_paths: '[]' });
      const app = fromDatabase(row);

      expect(app.additionalPaths).toEqual([]);
    });

    it('should map null agent_type to undefined agentType', () => {
      const row = createTestRow({ agent_type: null });
      const app = fromDatabase(row);

      expect(app.agentType).toBeUndefined();
    });

    it('should map agent_type to agentType', () => {
      const row = createTestRow({ agent_type: 'claude' });
      const app = fromDatabase(row);

      expect(app.agentType).toBe('claude');
    });

    it('should map null model_override to undefined modelOverride', () => {
      const row = createTestRow({ model_override: null });
      const app = fromDatabase(row);

      expect(app.modelOverride).toBeUndefined();
    });

    it('should map model_override to modelOverride', () => {
      const row = createTestRow({ model_override: 'claude-opus-4' });
      const app = fromDatabase(row);

      expect(app.modelOverride).toBe('claude-opus-4');
    });
  });

  describe('bedrockEnabled (project-bedrock integration)', () => {
    it('toDatabase maps bedrockEnabled=false to bedrock_enabled=0', () => {
      const app = createTestApplication({ bedrockEnabled: false });
      const row = toDatabase(app);

      expect(row.bedrock_enabled).toBe(0);
    });

    it('toDatabase maps bedrockEnabled=true to bedrock_enabled=1', () => {
      const app = createTestApplication({ bedrockEnabled: true });
      const row = toDatabase(app);

      expect(row.bedrock_enabled).toBe(1);
    });

    it('fromDatabase maps bedrock_enabled=0 to bedrockEnabled=false', () => {
      const row = createTestRow({ bedrock_enabled: 0 });
      const app = fromDatabase(row);

      expect(app.bedrockEnabled).toBe(false);
    });

    it('fromDatabase maps bedrock_enabled=1 to bedrockEnabled=true', () => {
      const row = createTestRow({ bedrock_enabled: 1 });
      const app = fromDatabase(row);

      expect(app.bedrockEnabled).toBe(true);
    });

    it('round-trips bedrockEnabled=true through toDatabase -> fromDatabase', () => {
      const original = createTestApplication({ bedrockEnabled: true });
      const restored = fromDatabase(toDatabase(original));

      expect(restored.bedrockEnabled).toBe(true);
    });
  });

  describe('Phase 11 — scanner profile + last scanned', () => {
    it('serializes a populated scannerProfile to JSON and back', () => {
      const app = createTestApplication({
        scannerProfile: {
          enabledStages: [ScanStageName.Sbom, ScanStageName.Secrets],
          pathExcludes: ['**/node_modules/**'],
          autoRescan: false,
        },
      });
      const row = toDatabase(app);

      expect(row.scanner_profile_json).toBe(
        '{"enabledStages":["sbom","secrets"],"pathExcludes":["**/node_modules/**"],"autoRescan":false}'
      );

      const roundTripped = fromDatabase(row);
      expect(roundTripped.scannerProfile).toEqual(app.scannerProfile);
    });

    it('maps an absent scannerProfile to the empty-object sentinel', () => {
      const row = toDatabase(createTestApplication());

      expect(row.scanner_profile_json).toBe('{}');
      expect(fromDatabase(row).scannerProfile).toBeUndefined();
    });

    it('round-trips lastScannedAt as unix milliseconds', () => {
      const at = new Date('2026-05-20T16:00:00Z');
      const app = createTestApplication({ lastScannedAt: at });
      const row = toDatabase(app);

      expect(row.last_scanned_at).toBe(at.getTime());
      expect(fromDatabase(row).lastScannedAt).toEqual(at);
    });

    it('maps an absent lastScannedAt to null and back to undefined', () => {
      const row = toDatabase(createTestApplication());
      expect(row.last_scanned_at).toBeNull();
      expect(fromDatabase(row).lastScannedAt).toBeUndefined();
    });
  });

  describe('soft delete (deletedAt)', () => {
    it('toDatabase should map deletedAt Date to unix milliseconds', () => {
      const deletedAt = new Date('2025-06-02T09:00:00Z');
      const app = createTestApplication({ deletedAt });
      const row = toDatabase(app);

      expect(row.deleted_at).toBe(deletedAt.getTime());
    });

    it('toDatabase should map undefined deletedAt to null', () => {
      const app = createTestApplication();
      const row = toDatabase(app);

      expect(row.deleted_at).toBeNull();
    });

    it('fromDatabase should map deleted_at integer to Date', () => {
      const deletedAt = new Date('2025-06-02T09:00:00Z');
      const row = createTestRow({ deleted_at: deletedAt.getTime() });
      const app = fromDatabase(row);

      expect(app.deletedAt).toEqual(deletedAt);
    });

    it('fromDatabase should map null deleted_at to undefined', () => {
      const row = createTestRow({ deleted_at: null });
      const app = fromDatabase(row);

      expect(app.deletedAt).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('should preserve all fields through toDatabase -> fromDatabase', () => {
      const original = createTestApplication({
        additionalPaths: ['/extra/path'],
        agentType: 'claude',
        modelOverride: 'claude-opus-4',
        status: ApplicationStatus.Active,
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.slug).toBe(original.slug);
      expect(restored.description).toBe(original.description);
      expect(restored.repositoryPath).toBe(original.repositoryPath);
      expect(restored.additionalPaths).toEqual(original.additionalPaths);
      expect(restored.agentType).toBe(original.agentType);
      expect(restored.modelOverride).toBe(original.modelOverride);
      expect(restored.status).toBe(original.status);
      expect(restored.createdAt).toEqual(original.createdAt);
      expect(restored.updatedAt).toEqual(original.updatedAt);
      expect(restored.deletedAt).toBeUndefined();
    });

    it('should preserve deletedAt through round-trip', () => {
      const deletedAt = new Date('2025-06-02T09:00:00Z');
      const original = createTestApplication({ deletedAt });
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.deletedAt).toEqual(deletedAt);
    });

    it('should preserve undefined optional fields through round-trip', () => {
      const original = createTestApplication();
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.agentType).toBeUndefined();
      expect(restored.modelOverride).toBeUndefined();
      expect(restored.deletedAt).toBeUndefined();
    });
  });
});
