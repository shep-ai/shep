import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DOCS_PATHS,
  docsFirstInstructions,
  docsPathsOf,
  documentationChanges,
  normalizeDocsPath,
} from '@/domain/shared/docs-first.js';

describe('docs first (spec 131)', () => {
  it('uses docs/ and README.md unless the space chose its own paths', () => {
    expect(DEFAULT_DOCS_PATHS).toEqual(['docs/', 'README.md']);
    expect(docsPathsOf({ docsFirst: true })).toEqual(DEFAULT_DOCS_PATHS);
    expect(docsPathsOf({ docsFirst: true, docsPaths: ['guide/'] })).toEqual(['guide/']);
  });

  it('accepts relative prefixes and refuses absolute or escaping ones', () => {
    expect(normalizeDocsPath(' docs\\guides/ ')).toBe('docs/guides/');
    expect(normalizeDocsPath('./README.md')).toBe('README.md');
    expect(normalizeDocsPath('/etc/')).toBeUndefined();
    expect(normalizeDocsPath('C:/docs/')).toBeUndefined();
    expect(normalizeDocsPath('../docs/')).toBeUndefined();
    expect(normalizeDocsPath('docs/../src/')).toBeUndefined();
    expect(normalizeDocsPath('  ')).toBeUndefined();
  });

  it('counts a changed file as documentation when it equals or sits under a prefix', () => {
    expect(
      documentationChanges(
        ['src/a.ts', 'docs/guides/refunds.md', 'README.md', 'README.md.bak', 'docsite/x.md'],
        ['docs/', 'README.md']
      )
    ).toEqual(['docs/guides/refunds.md', 'README.md']);
    expect(documentationChanges(['docs\\x.md'], ['docs/'])).toEqual(['docs/x.md']);
  });

  it('tells the plan and implement phases, and no other', () => {
    const plan = docsFirstInstructions('plan', ['docs/', 'README.md']);
    expect(plan).toContain('docs/, README.md');
    expect(plan).toMatch(/before/i);
    expect(docsFirstInstructions('implement', ['docs/'])).toMatch(/contract/i);
    expect(docsFirstInstructions('research', ['docs/'])).toBe('');
    expect(docsFirstInstructions('merge', ['docs/'])).toBe('');
  });
});
