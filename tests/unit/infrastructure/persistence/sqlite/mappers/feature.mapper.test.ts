import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type FeatureRow,
} from '@/infrastructure/persistence/sqlite/mappers/feature.mapper.js';
import {
  PrStatus,
  SdlcLifecycle,
  FeatureMode,
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
    mode: FeatureMode.Regular,
    iterationCount: 0,
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
    mode: 'Regular',
    iteration_count: 0,
    max_iterations: null,
    attachments: '[]',
    injected_skills: null,
    inject_skills: 0,
    deleted_at: null,
    created_at: new Date('2026-03-08T10:00:00Z').getTime(),
    updated_at: new Date('2026-03-08T10:00:00Z').getTime(),
    ...overrides,
  };
}

describe('Feature Mapper — mode field', () => {
  describe('toDatabase()', () => {
    it('maps FeatureMode.Fast to string "Fast"', () => {
      const feature = createTestFeature({ mode: FeatureMode.Fast });
      const row = toDatabase(feature);
      expect(row.mode).toBe('Fast');
    });

    it('maps FeatureMode.Regular to string "Regular"', () => {
      const feature = createTestFeature({ mode: FeatureMode.Regular });
      const row = toDatabase(feature);
      expect(row.mode).toBe('Regular');
    });

    it('maps FeatureMode.Exploration to string "Exploration"', () => {
      const feature = createTestFeature({ mode: FeatureMode.Exploration });
      const row = toDatabase(feature);
      expect(row.mode).toBe('Exploration');
    });
  });

  describe('fromDatabase()', () => {
    it('casts string "Fast" to FeatureMode.Fast', () => {
      const row = createTestRow({ mode: 'Fast' });
      const feature = fromDatabase(row);
      expect(feature.mode).toBe(FeatureMode.Fast);
    });

    it('casts string "Regular" to FeatureMode.Regular', () => {
      const row = createTestRow({ mode: 'Regular' });
      const feature = fromDatabase(row);
      expect(feature.mode).toBe(FeatureMode.Regular);
    });

    it('casts string "Exploration" to FeatureMode.Exploration', () => {
      const row = createTestRow({ mode: 'Exploration' });
      const feature = fromDatabase(row);
      expect(feature.mode).toBe(FeatureMode.Exploration);
    });
  });
});

describe('Feature Mapper — iteration tracking', () => {
  describe('toDatabase()', () => {
    it('maps iterationCount to iteration_count', () => {
      const feature = createTestFeature({ iterationCount: 5 });
      const row = toDatabase(feature);
      expect(row.iteration_count).toBe(5);
    });

    it('maps maxIterations to max_iterations', () => {
      const feature = createTestFeature({ maxIterations: 10 });
      const row = toDatabase(feature);
      expect(row.max_iterations).toBe(10);
    });

    it('maps undefined maxIterations to null', () => {
      const feature = createTestFeature();
      const row = toDatabase(feature);
      expect(row.max_iterations).toBeNull();
    });
  });

  describe('fromDatabase()', () => {
    it('maps iteration_count to iterationCount', () => {
      const row = createTestRow({ iteration_count: 7 });
      const feature = fromDatabase(row);
      expect(feature.iterationCount).toBe(7);
    });

    it('defaults iterationCount to 0 when iteration_count is null', () => {
      const row = createTestRow();
      (row as unknown as Record<string, unknown>).iteration_count = null;
      const feature = fromDatabase(row);
      expect(feature.iterationCount).toBe(0);
    });

    it('maps non-null max_iterations to maxIterations', () => {
      const row = createTestRow({ max_iterations: 15 });
      const feature = fromDatabase(row);
      expect(feature.maxIterations).toBe(15);
    });

    it('omits maxIterations when max_iterations is null', () => {
      const row = createTestRow({ max_iterations: null });
      const feature = fromDatabase(row);
      expect(feature.maxIterations).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('preserves mode and iteration fields through toDatabase → fromDatabase', () => {
      const feature = createTestFeature({
        mode: FeatureMode.Exploration,
        iterationCount: 3,
        maxIterations: 10,
      });
      const row = toDatabase(feature);
      const restored = fromDatabase(row);

      expect(restored.mode).toBe(FeatureMode.Exploration);
      expect(restored.iterationCount).toBe(3);
      expect(restored.maxIterations).toBe(10);
    });
  });
});

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
