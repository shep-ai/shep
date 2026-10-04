import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { expandHome, resolveCliPath } from '../../../../src/presentation/cli/paths.js';

describe('expandHome', () => {
  it('expands a bare tilde', () => {
    expect(expandHome('~')).toBe(homedir());
  });

  it('expands a tilde prefix with either separator', () => {
    expect(expandHome('~/Code')).toBe(join(homedir(), 'Code'));
    expect(expandHome('~\\Code')).toBe(join(homedir(), 'Code'));
  });

  it('leaves other paths alone', () => {
    expect(expandHome('/srv/app')).toBe('/srv/app');
    expect(expandHome('~other/app')).toBe('~other/app');
  });
});

describe('resolveCliPath', () => {
  it('defaults to the working directory', () => {
    expect(resolveCliPath()).toBe(resolve('.'));
    expect(resolveCliPath('  ')).toBe(resolve('.'));
  });

  it('makes relative and tilde paths absolute', () => {
    expect(resolveCliPath('sub')).toBe(resolve('sub'));
    expect(resolveCliPath('~/Code')).toBe(join(homedir(), 'Code'));
  });
});
