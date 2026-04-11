import { describe, it, expect } from 'vitest';
import { filterNpm } from '@/infrastructure/services/subprocess-filter/filters/npm-filter.js';

describe('filterNpm', () => {
  describe('install', () => {
    it('returns ok for clean install', () => {
      const output = 'added 150 packages in 4s\n\n28 packages are looking for funding';
      expect(filterNpm('install', output)).toBe('ok (installed)');
    });

    it('preserves error output', () => {
      const err = 'npm ERR! code ENOENT\nnpm ERR! syscall open';
      const result = filterNpm('install', err);
      expect(result).toContain('ERR!');
    });
  });

  describe('test / run', () => {
    it('strips lifecycle boilerplate', () => {
      const output = [
        '> my-project@1.0.0 test',
        '> vitest run',
        '',
        ' ✓ src/app.test.ts (3 tests) 42ms',
        '',
        'Tests  3 passed',
      ].join('\n');
      const result = filterNpm('test', output);
      expect(result).not.toContain('> my-project');
      expect(result).toContain('3 passed');
    });

    it('deduplicates repeated lines', () => {
      const output = [
        '> project@1.0.0 build',
        'Building...',
        'Building...',
        'Building...',
        'Done.',
      ].join('\n');
      const result = filterNpm('run', output);
      expect(result).toContain('Building... (×3)');
      expect(result).toContain('Done.');
    });
  });

  describe('empty output', () => {
    it('returns ok for empty output', () => {
      expect(filterNpm('install', '')).toBe('ok');
      expect(filterNpm('run', '')).toBe('ok');
    });
  });

  describe('unknown subcommand', () => {
    it('applies basic cleanup', () => {
      expect(filterNpm('unknown', 'some output')).toBe('some output');
    });
  });
});
