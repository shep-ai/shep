/**
 * isAbsolutePath Unit Tests
 *
 * Cross-platform behaviour is mandatory (src/CLAUDE.md): CI runs on both
 * ubuntu-latest and windows-latest, and a naive startsWith('/') check would
 * reject every normalized Windows path.
 */

import { describe, it, expect } from 'vitest';
import { isAbsolutePath } from '@/domain/shared/absolute-path.js';

describe('isAbsolutePath', () => {
  it('accepts POSIX absolute paths', () => {
    expect(isAbsolutePath('/home/dev/project')).toBe(true);
    expect(isAbsolutePath('/')).toBe(true);
  });

  it('accepts normalized Windows drive-letter paths', () => {
    expect(isAbsolutePath('C:/Users/dev/project')).toBe(true);
    expect(isAbsolutePath('c:/users/dev/project')).toBe(true);
  });

  it('accepts raw Windows paths with backslashes', () => {
    expect(isAbsolutePath('C:\\Users\\dev\\project')).toBe(true);
  });

  it('accepts normalized UNC paths', () => {
    expect(isAbsolutePath('//server/share/project')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(isAbsolutePath('relative/dir')).toBe(false);
    expect(isAbsolutePath('./relative')).toBe(false);
    expect(isAbsolutePath('../up')).toBe(false);
    expect(isAbsolutePath('project')).toBe(false);
  });

  it('rejects a bare drive letter without a separator', () => {
    expect(isAbsolutePath('C:')).toBe(false);
  });

  it('rejects empty and nullish input', () => {
    expect(isAbsolutePath('')).toBe(false);
    expect(isAbsolutePath(null)).toBe(false);
    expect(isAbsolutePath(undefined)).toBe(false);
  });
});
