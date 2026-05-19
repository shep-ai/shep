import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type FeatureRow,
} from '@/infrastructure/persistence/sqlite/mappers/feature.mapper.js';
import {
  PrStatus,
  SdlcLifecycle,
  BuildMode,
  type Feature,
  type Attachment,
} from '@/domain/generated/output.js';

const sampleAttachment: Attachment = {
  id: 'att-001',
  name: 'screenshot.png',
  size: BigInt(150000),
  mimeType: 'image/png',
  path: '.shep/attachments/my-feature/screenshot.png',
  createdAt: new Date('2026-03-08T10:00:00Z'),
};

function createTestFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-abc-123',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test query',
    repositoryPath: '/home/dev/repo',
    branch: 'feature/test-feature',
    lifecycle: 'Started' as Feature['lifecycle'],
    messages: [],
    relatedArtifacts: [],
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    buildMode: BuildMode.Application,
    fast: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2026-03-08T10:00:00Z'),
    updatedAt: new Date('2026-03-08T10:00:00Z'),
    ...overrides,
  };
}

function createTestRow(overrides: Partial<FeatureRow> = {}): FeatureRow {
  return {
    id: 'feat-abc-123',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    user_query: 'test query',
    repository_path: '/home/dev/repo',
    branch: 'feature/test-feature',
    lifecycle: 'Started',
    messages: '[]',
    plan: null,
    related_artifacts: '[]',
    agent_run_id: null,
    spec_path: null,
    push: 0,
    open_pr: 0,
    fork_and_pr: 0,
    commit_specs: 1,
    ci_watch_enabled: 1,
    enable_evidence: 0,
    commit_evidence: 0,
    auto_merge: 0,
    allow_prd: 0,
    allow_plan: 0,
    allow_merge: 0,
    worktree_path: null,
    repository_id: null,
    pr_url: null,
    pr_number: null,
    pr_status: null,
    upstream_pr_url: null,
    upstream_pr_number: null,
    upstream_pr_status: null,
    commit_hash: null,
    ci_status: null,
    ci_fix_attempts: null,
    ci_fix_history: null,
    pr_mergeable: null,
    parent_id: null,
    previous_lifecycle: null,
    fast: 0,
    application_id: null,
    build_mode: 'application',
    attachments: '[]',
    injected_skills: null,
    inject_skills: 0,
    bedrock_enabled: 0,
    deleted_at: null,
    created_at: new Date('2026-03-08T10:00:00Z').getTime(),
    updated_at: new Date('2026-03-08T10:00:00Z').getTime(),
    ...overrides,
  };
}

describe('Feature Mapper — attachments', () => {
  describe('toDatabase()', () => {
    it('serializes attachments array to JSON string', () => {
      const feature = createTestFeature({ attachments: [sampleAttachment] });
      const row = toDatabase(feature);
      // BigInt size is converted to number for JSON serialization
      const expected = JSON.stringify([
        { ...sampleAttachment, size: Number(sampleAttachment.size) },
      ]);
      expect(row.attachments).toBe(expected);
    });

    it('serializes empty attachments to "[]"', () => {
      const feature = createTestFeature({ attachments: [] });
      const row = toDatabase(feature);
      expect(row.attachments).toBe('[]');
    });

    it('serializes undefined attachments to "[]"', () => {
      const feature = createTestFeature();
      const row = toDatabase(feature);
      expect(row.attachments).toBe('[]');
    });
  });

  describe('fromDatabase()', () => {
    it('deserializes JSON string to Attachment array', () => {
      // In the DB, size is stored as number (BigInt converted on write)
      const storedAttachment = { ...sampleAttachment, size: Number(sampleAttachment.size) };
      const row = createTestRow({
        attachments: JSON.stringify([storedAttachment]),
      });
      const feature = fromDatabase(row);
      // JSON roundtrip: Date → ISO string, BigInt → number — consistent with messages/artifacts
      expect(feature.attachments).toEqual([
        { ...storedAttachment, createdAt: '2026-03-08T10:00:00.000Z' },
      ]);
    });

    it('deserializes "[]" to empty array', () => {
      const row = createTestRow({ attachments: '[]' });
      const feature = fromDatabase(row);
      expect(feature.attachments).toEqual([]);
    });

    it('defaults to empty array when attachments column is missing (pre-migration row)', () => {
      const row = createTestRow();
      // Simulate pre-migration row where column doesn't exist
      delete (row as unknown as Record<string, unknown>).attachments;
      const feature = fromDatabase(row);
      expect(feature.attachments).toEqual([]);
    });
  });
});

describe('Feature Mapper — soft delete', () => {
  describe('toDatabase()', () => {
    it('maps deletedAt Date to unix milliseconds', () => {
      const deletedAt = new Date('2026-03-09T12:00:00Z');
      const feature = createTestFeature({ deletedAt });
      const row = toDatabase(feature);
      expect(row.deleted_at).toBe(deletedAt.getTime());
    });

    it('maps undefined deletedAt to null', () => {
      const feature = createTestFeature();
      const row = toDatabase(feature);
      expect(row.deleted_at).toBeNull();
    });
  });

  describe('fromDatabase()', () => {
    it('maps non-null deleted_at to Date', () => {
      const ts = new Date('2026-03-09T12:00:00Z').getTime();
      const row = createTestRow({ deleted_at: ts });
      const feature = fromDatabase(row);
      expect(feature.deletedAt).toEqual(new Date(ts));
    });

    it('omits deletedAt when deleted_at is null', () => {
      const row = createTestRow({ deleted_at: null });
      const feature = fromDatabase(row);
      expect(feature.deletedAt).toBeUndefined();
    });
  });
});

describe('Feature Mapper — previous lifecycle', () => {
  describe('toDatabase()', () => {
    it('maps previousLifecycle to previous_lifecycle column', () => {
      const feature = createTestFeature({
        lifecycle: SdlcLifecycle.Archived,
        previousLifecycle: SdlcLifecycle.Maintain,
      });
      const row = toDatabase(feature);
      expect(row.previous_lifecycle).toBe('Maintain');
    });

    it('maps undefined previousLifecycle to null', () => {
      const feature = createTestFeature();
      const row = toDatabase(feature);
      expect(row.previous_lifecycle).toBeNull();
    });
  });

  describe('fromDatabase()', () => {
    it('maps non-null previous_lifecycle to previousLifecycle', () => {
      const row = createTestRow({ previous_lifecycle: 'Maintain' });
      const feature = fromDatabase(row);
      expect(feature.previousLifecycle).toBe(SdlcLifecycle.Maintain);
    });

    it('omits previousLifecycle when previous_lifecycle is null', () => {
      const row = createTestRow({ previous_lifecycle: null });
      const feature = fromDatabase(row);
      expect(feature.previousLifecycle).toBeUndefined();
    });
  });
});

describe('Feature Mapper — pr mergeable', () => {
  describe('toDatabase()', () => {
    it('maps mergeable true to 1', () => {
      const feature = createTestFeature({
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          mergeable: true,
        },
      });
      const row = toDatabase(feature);
      expect(row.pr_mergeable).toBe(1);
    });

    it('maps mergeable false to 0', () => {
      const feature = createTestFeature({
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          mergeable: false,
        },
      });
      const row = toDatabase(feature);
      expect(row.pr_mergeable).toBe(0);
    });

    it('maps undefined mergeable to null', () => {
      const feature = createTestFeature({
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });
      const row = toDatabase(feature);
      expect(row.pr_mergeable).toBeNull();
    });

    it('maps null when no pr exists', () => {
      const feature = createTestFeature();
      const row = toDatabase(feature);
      expect(row.pr_mergeable).toBeNull();
    });
  });

  describe('fromDatabase()', () => {
    it('maps pr_mergeable 1 to true', () => {
      const row = createTestRow({
        pr_url: 'https://github.com/org/repo/pull/1',
        pr_number: 1,
        pr_status: 'Open',
        pr_mergeable: 1,
      });
      const feature = fromDatabase(row);
      expect(feature.pr?.mergeable).toBe(true);
    });

    it('maps pr_mergeable 0 to false', () => {
      const row = createTestRow({
        pr_url: 'https://github.com/org/repo/pull/1',
        pr_number: 1,
        pr_status: 'Open',
        pr_mergeable: 0,
      });
      const feature = fromDatabase(row);
      expect(feature.pr?.mergeable).toBe(false);
    });

    it('omits mergeable when pr_mergeable is null', () => {
      const row = createTestRow({
        pr_url: 'https://github.com/org/repo/pull/1',
        pr_number: 1,
        pr_status: 'Open',
        pr_mergeable: null,
      });
      const feature = fromDatabase(row);
      expect(feature.pr?.mergeable).toBeUndefined();
    });
  });
});

describe('Feature Mapper — injectedSkills', () => {
  describe('toDatabase()', () => {
    it('serializes injectedSkills to JSON string', () => {
      const feature = createTestFeature({
        injectedSkills: ['architecture-reviewer', 'tsp-model'],
      });
      const row = toDatabase(feature);
      expect(row.injected_skills).toBe(JSON.stringify(['architecture-reviewer', 'tsp-model']));
    });

    it('serializes null when injectedSkills is undefined', () => {
      const feature = createTestFeature({ injectedSkills: undefined });
      const row = toDatabase(feature);
      expect(row.injected_skills).toBeNull();
    });

    it('serializes null when injectedSkills is empty', () => {
      const feature = createTestFeature({ injectedSkills: [] });
      const row = toDatabase(feature);
      expect(row.injected_skills).toBeNull();
    });
  });

  describe('fromDatabase()', () => {
    it('deserializes injected_skills from JSON string', () => {
      const row = createTestRow({
        injected_skills: JSON.stringify(['architecture-reviewer', 'tsp-model']),
      });
      const feature = fromDatabase(row);
      expect(feature.injectedSkills).toEqual(['architecture-reviewer', 'tsp-model']);
    });

    it('omits injectedSkills when injected_skills is null', () => {
      const row = createTestRow({ injected_skills: null });
      const feature = fromDatabase(row);
      expect(feature.injectedSkills).toBeUndefined();
    });
  });
});

describe('Feature Mapper — applicationId + buildMode', () => {
  describe('toDatabase()', () => {
    it('writes application_id and build_mode for a spec-mode feature scoped to an application', () => {
      const feature = createTestFeature({
        applicationId: '1c1f6f3e-3a89-4b48-90fa-9ae0c0e43d11',
        buildMode: BuildMode.Spec,
      });
      const row = toDatabase(feature);
      expect(row.application_id).toBe('1c1f6f3e-3a89-4b48-90fa-9ae0c0e43d11');
      expect(row.build_mode).toBe(BuildMode.Spec);
      // Spec mode is not the legacy `fast` flag.
      expect(row.fast).toBe(0);
    });

    it('writes null application_id and build_mode=application for a non-scoped application-mode feature', () => {
      const feature = createTestFeature({
        applicationId: undefined,
        buildMode: BuildMode.Application,
      });
      const row = toDatabase(feature);
      expect(row.application_id).toBeNull();
      expect(row.build_mode).toBe(BuildMode.Application);
      expect(row.fast).toBe(0);
    });

    it('derives the legacy fast column from buildMode === Fast', () => {
      const feature = createTestFeature({ buildMode: BuildMode.Fast });
      const row = toDatabase(feature);
      expect(row.build_mode).toBe(BuildMode.Fast);
      expect(row.fast).toBe(1);
    });
  });

  describe('fromDatabase()', () => {
    it('reads application_id and build_mode from the row', () => {
      const row = createTestRow({
        application_id: '1c1f6f3e-3a89-4b48-90fa-9ae0c0e43d11',
        build_mode: BuildMode.Spec,
      });
      const feature = fromDatabase(row);
      expect(feature.applicationId).toBe('1c1f6f3e-3a89-4b48-90fa-9ae0c0e43d11');
      expect(feature.buildMode).toBe(BuildMode.Spec);
    });

    it('omits applicationId when application_id is null', () => {
      const row = createTestRow({ application_id: null, build_mode: BuildMode.Application });
      const feature = fromDatabase(row);
      expect(feature.applicationId).toBeUndefined();
      expect(feature.buildMode).toBe(BuildMode.Application);
    });
  });

  describe('round-trip', () => {
    it('round-trips spec-mode + applicationId through toDatabase → fromDatabase', () => {
      const original = createTestFeature({
        applicationId: '1c1f6f3e-3a89-4b48-90fa-9ae0c0e43d11',
        buildMode: BuildMode.Spec,
      });
      const restored = fromDatabase(toDatabase(original));
      expect(restored.applicationId).toBe(original.applicationId);
      expect(restored.buildMode).toBe(BuildMode.Spec);
      expect(restored.fast).toBe(false);
    });

    it('round-trips fast-mode without an application through toDatabase → fromDatabase', () => {
      const original = createTestFeature({
        applicationId: undefined,
        buildMode: BuildMode.Fast,
      });
      const restored = fromDatabase(toDatabase(original));
      expect(restored.applicationId).toBeUndefined();
      expect(restored.buildMode).toBe(BuildMode.Fast);
      expect(restored.fast).toBe(true);
    });
  });
});
