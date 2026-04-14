import { describe, it, expect } from 'vitest';
import { normalizePath } from '@/domain/shared/normalize-path.js';

describe('normalizePath', () => {
  describe('forward slash normalization', () => {
    it('converts backslashes to forward slashes', () => {
      expect(normalizePath('C:\\Users\\mk\\workspaces\\my-project')).toBe(
        'C:/Users/mk/workspaces/my-project'
      );
    });

    it('leaves already-forward-slash paths unchanged', () => {
      expect(normalizePath('/repos/test/project')).toBe('/repos/test/project');
    });

    it('handles mixed separators', () => {
      expect(normalizePath('C:\\Users/mk\\workspaces/project')).toBe(
        'C:/Users/mk/workspaces/project'
      );
    });
  });

  describe('trailing slash handling', () => {
    it('strips a single trailing slash', () => {
      expect(normalizePath('/repos/test/')).toBe('/repos/test');
    });

    it('strips multiple trailing slashes', () => {
      expect(normalizePath('/repos/test///')).toBe('/repos/test');
    });

    it('strips trailing slash after backslash normalization', () => {
      expect(normalizePath('C:\\Users\\mk\\')).toBe('C:/Users/mk');
    });

    it('preserves the root "/"', () => {
      expect(normalizePath('/')).toBe('/');
    });

    it('strips a trailing backslash (windows root should not collapse)', () => {
      // "C:\\" normalizes to "C:/", trailing slash stripped to "C:".
      // This is the canonical form this project stores paths in.
      expect(normalizePath('C:\\')).toBe('C:');
    });
  });

  describe('empty and nullish input', () => {
    it('returns empty string for empty input', () => {
      expect(normalizePath('')).toBe('');
    });

    it('returns empty string for null input', () => {
      expect(normalizePath(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(normalizePath(undefined)).toBe('');
    });
  });

  describe('Windows drive-letter handling', () => {
    it('preserves the drive-letter prefix', () => {
      expect(normalizePath('D:\\data\\repo')).toBe('D:/data/repo');
    });

    it('normalizes a drive-relative path with mixed separators', () => {
      expect(normalizePath('E:/projects\\shep-ai\\cli')).toBe('E:/projects/shep-ai/cli');
    });
  });

  describe('leading slash preservation', () => {
    it('keeps a leading forward slash', () => {
      expect(normalizePath('/home/user/repo')).toBe('/home/user/repo');
    });

    it('keeps a leading slash after normalizing backslashes', () => {
      expect(normalizePath('\\\\server\\share\\repo')).toBe('//server/share/repo');
    });
  });
});
