/**
 * Delta-Context Service — Unit Tests
 *
 * TDD Phase: RED
 *
 * Tests for hash-based spec file change detection. The service computes
 * SHA-256 hashes of spec file contents, compares against previous phase
 * hashes, and replaces unchanged files with compact summaries.
 */

import { describe, it, expect } from 'vitest';
import { DeltaContextService } from '@/infrastructure/services/token-optimization/delta-context.service.js';
import type { SpecFileEntry } from '@/application/ports/output/services/delta-context.interface.js';
import { createHash } from 'node:crypto';

/** Helper to compute SHA-256 hash matching the service's expected output. */
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

describe('DeltaContextService', () => {
  const service = new DeltaContextService();

  describe('first phase (no prior hashes)', () => {
    it('should return all files with full content when previous hashes are empty', () => {
      const files: SpecFileEntry[] = [
        { fileName: 'spec.yaml', content: 'name: test\nsummary: a spec' },
        { fileName: 'research.yaml', content: 'decisions:\n  - title: foo' },
      ];

      const result = service.diff(files, {});

      expect(result.optimizedFiles['spec.yaml']).toBe(files[0].content);
      expect(result.optimizedFiles['research.yaml']).toBe(files[1].content);
      expect(result.filesSkipped).toBe(0);
    });

    it('should return current hashes for all files even on first phase', () => {
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content: 'name: test' }];

      const result = service.diff(files, {});

      expect(result.currentHashes['spec.yaml']).toBe(sha256('name: test'));
    });
  });

  describe('unchanged file detection', () => {
    it('should replace unchanged file with compact summary', () => {
      const content = 'name: test\nsummary: a spec\nphase: requirements';
      const hash = sha256(content);
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content }];
      const previousHashes: Record<string, string> = {
        'spec.yaml': hash,
      };

      const result = service.diff(files, previousHashes, 'requirements');

      // Should NOT contain the original content
      expect(result.optimizedFiles['spec.yaml']).not.toBe(content);
      // Should be a summary string
      expect(result.optimizedFiles['spec.yaml']).toContain('unchanged');
      expect(result.filesSkipped).toBe(1);
    });

    it('should include file name in the summary', () => {
      const content = 'some content here';
      const hash = sha256(content);
      const files: SpecFileEntry[] = [{ fileName: 'research.yaml', content }];

      const result = service.diff(files, { 'research.yaml': hash }, 'analyze');

      expect(result.optimizedFiles['research.yaml']).toContain('research.yaml');
    });

    it('should include line count in the summary', () => {
      const content = 'line1\nline2\nline3\nline4\nline5';
      const hash = sha256(content);
      const files: SpecFileEntry[] = [{ fileName: 'plan.yaml', content }];

      const result = service.diff(files, { 'plan.yaml': hash }, 'research');

      expect(result.optimizedFiles['plan.yaml']).toContain('5 lines');
    });

    it('should include short hash prefix in the summary', () => {
      const content = 'name: delta test';
      const hash = sha256(content);
      const shortHash = hash.slice(0, 8);
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content }];

      const result = service.diff(files, { 'spec.yaml': hash }, 'plan');

      expect(result.optimizedFiles['spec.yaml']).toContain(shortHash);
    });

    it('should include previous phase name in the summary', () => {
      const content = 'content for phase test';
      const hash = sha256(content);
      const files: SpecFileEntry[] = [{ fileName: 'tasks.yaml', content }];

      const result = service.diff(files, { 'tasks.yaml': hash }, 'implement');

      expect(result.optimizedFiles['tasks.yaml']).toContain('implement');
    });

    it('should use summary format: [file unchanged since {phase} - {lineCount} lines, hash {shortHash}]', () => {
      const content = 'line1\nline2\nline3';
      const hash = sha256(content);
      const shortHash = hash.slice(0, 8);
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content }];

      const result = service.diff(files, { 'spec.yaml': hash }, 'requirements');

      expect(result.optimizedFiles['spec.yaml']).toBe(
        `[spec.yaml unchanged since requirements - 3 lines, hash ${shortHash}]`
      );
    });
  });

  describe('changed file detection', () => {
    it('should return full content for a file with different hash', () => {
      const oldContent = 'old content';
      const newContent = 'new content that is different';
      const oldHash = sha256(oldContent);
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content: newContent }];

      const result = service.diff(files, { 'spec.yaml': oldHash }, 'plan');

      expect(result.optimizedFiles['spec.yaml']).toBe(newContent);
      expect(result.filesSkipped).toBe(0);
    });

    it('should return full content for a file not in previous hashes', () => {
      const content = 'brand new file content';
      const files: SpecFileEntry[] = [{ fileName: 'feature.yaml', content }];

      const result = service.diff(files, { 'spec.yaml': 'somehash' }, 'plan');

      expect(result.optimizedFiles['feature.yaml']).toBe(content);
      expect(result.filesSkipped).toBe(0);
    });
  });

  describe('hash state management', () => {
    it('should return current hashes for all files', () => {
      const files: SpecFileEntry[] = [
        { fileName: 'spec.yaml', content: 'spec content' },
        { fileName: 'plan.yaml', content: 'plan content' },
        { fileName: 'tasks.yaml', content: 'tasks content' },
      ];

      const result = service.diff(files, {});

      expect(Object.keys(result.currentHashes)).toHaveLength(3);
      expect(result.currentHashes['spec.yaml']).toBe(sha256('spec content'));
      expect(result.currentHashes['plan.yaml']).toBe(sha256('plan content'));
      expect(result.currentHashes['tasks.yaml']).toBe(sha256('tasks content'));
    });

    it('should update hashes even for unchanged files', () => {
      const content = 'unchanged content';
      const hash = sha256(content);
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content }];

      const result = service.diff(files, { 'spec.yaml': hash }, 'plan');

      // Hash should still be present in current hashes
      expect(result.currentHashes['spec.yaml']).toBe(hash);
    });

    it('should update hashes for changed files', () => {
      const newContent = 'updated content';
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content: newContent }];

      const result = service.diff(files, { 'spec.yaml': 'oldhash' }, 'plan');

      expect(result.currentHashes['spec.yaml']).toBe(sha256(newContent));
    });
  });

  describe('mixed changed and unchanged files', () => {
    it('should handle multiple files with mixed change status', () => {
      const unchangedContent = 'this stays the same';
      const unchangedHash = sha256(unchangedContent);
      const changedContent = 'this is brand new content';

      const files: SpecFileEntry[] = [
        { fileName: 'spec.yaml', content: unchangedContent },
        { fileName: 'research.yaml', content: changedContent },
        { fileName: 'plan.yaml', content: unchangedContent },
      ];

      const previousHashes: Record<string, string> = {
        'spec.yaml': unchangedHash,
        'research.yaml': sha256('old research content'),
        'plan.yaml': unchangedHash,
      };

      const result = service.diff(files, previousHashes, 'implement');

      // Unchanged files get summaries
      expect(result.optimizedFiles['spec.yaml']).toContain('unchanged');
      expect(result.optimizedFiles['plan.yaml']).toContain('unchanged');

      // Changed file gets full content
      expect(result.optimizedFiles['research.yaml']).toBe(changedContent);

      // 2 files skipped
      expect(result.filesSkipped).toBe(2);

      // All hashes present
      expect(Object.keys(result.currentHashes)).toHaveLength(3);
    });
  });

  describe('edge cases', () => {
    it('should handle empty file list', () => {
      const result = service.diff([], {});

      expect(result.optimizedFiles).toEqual({});
      expect(result.currentHashes).toEqual({});
      expect(result.filesSkipped).toBe(0);
    });

    it('should handle file with empty content', () => {
      const files: SpecFileEntry[] = [{ fileName: 'empty.yaml', content: '' }];

      const result = service.diff(files, {});

      expect(result.optimizedFiles['empty.yaml']).toBe('');
      expect(result.currentHashes['empty.yaml']).toBe(sha256(''));
    });

    it('should handle single-line file for line count', () => {
      const content = 'single line';
      const hash = sha256(content);
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content }];

      const result = service.diff(files, { 'spec.yaml': hash }, 'plan');

      expect(result.optimizedFiles['spec.yaml']).toContain('1 lines');
    });

    it('should default previous phase name when not provided', () => {
      const content = 'some content';
      const hash = sha256(content);
      const files: SpecFileEntry[] = [{ fileName: 'spec.yaml', content }];

      const result = service.diff(files, { 'spec.yaml': hash });

      // Should still produce a valid summary without throwing
      expect(result.optimizedFiles['spec.yaml']).toContain('unchanged');
      expect(result.optimizedFiles['spec.yaml']).toContain('spec.yaml');
    });
  });
});
