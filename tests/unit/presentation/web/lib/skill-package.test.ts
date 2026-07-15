import { describe, it, expect } from 'vitest';
import { derivePackage, UNGROUPED_PACKAGE_LABEL } from '@/lib/skill-package';

describe('derivePackage', () => {
  it('derives the package from a namespace prefix in the name', () => {
    expect(derivePackage('shep-kit:plan', 'Planning skill')).toBe('shep-kit');
    expect(derivePackage('shep:ui-component', 'UI component skill')).toBe('shep');
    expect(derivePackage('pm-toolkit:draft-nda', 'Draft an NDA')).toBe('pm-toolkit');
  });

  it('derives the package from a trailing (pkg) tag in the description', () => {
    expect(derivePackage('browse', 'Fast headless browser. (gstack)')).toBe('gstack');
    expect(derivePackage('benchmark-models', 'Cross-model benchmark for skills. (gstack)')).toBe(
      'gstack'
    );
  });

  it('prefers the namespace prefix over the description tag', () => {
    expect(derivePackage('shep-kit:plan', 'Planning skill (gstack)')).toBe('shep-kit');
  });

  it('returns null for a standalone skill with no package signal', () => {
    expect(derivePackage('tsp-model', 'Create TypeSpec domain models')).toBeNull();
    expect(derivePackage('shadcn-ui', 'shadcn/ui component library patterns')).toBeNull();
  });

  it('ignores multi-word trailing parentheticals that are not package slugs', () => {
    expect(
      derivePackage('plan-tune', 'Self-tuning question sensitivity (v1: observational)')
    ).toBeNull();
  });

  it('only matches a package tag at the very end of the description', () => {
    expect(derivePackage('some-skill', '(gstack) tooling for something')).toBeNull();
  });
});

describe('UNGROUPED_PACKAGE_LABEL', () => {
  it('is the label used for skills with no package', () => {
    expect(UNGROUPED_PACKAGE_LABEL).toBe('Ungrouped');
  });
});
