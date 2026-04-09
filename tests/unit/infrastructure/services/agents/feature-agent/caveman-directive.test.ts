import { describe, it, expect } from 'vitest';
import {
  resolveCavemanDirective,
  DEFAULT_CAVEMAN_DIRECTIVE,
  CAVEMAN_EXEMPT_NODES,
} from '@/infrastructure/services/agents/feature-agent/caveman-directive.js';

describe('resolveCavemanDirective', () => {
  it('returns undefined when caveman mode is disabled', () => {
    expect(resolveCavemanDirective('fast-implement', false)).toBeUndefined();
    expect(resolveCavemanDirective('implement', false, 'custom text')).toBeUndefined();
  });

  it('returns the default directive for non-exempt nodes when enabled with no custom text', () => {
    expect(resolveCavemanDirective('fast-implement', true)).toBe(DEFAULT_CAVEMAN_DIRECTIVE);
    expect(resolveCavemanDirective('plan', true)).toBe(DEFAULT_CAVEMAN_DIRECTIVE);
    expect(resolveCavemanDirective('implement', true)).toBe(DEFAULT_CAVEMAN_DIRECTIVE);
    expect(resolveCavemanDirective('evidence', true)).toBe(DEFAULT_CAVEMAN_DIRECTIVE);
  });

  it('returns the custom directive when one is provided and mode is enabled', () => {
    const custom = 'be terse. output valid json. nothing else.';
    expect(resolveCavemanDirective('fast-implement', true, custom)).toBe(custom);
  });

  it('returns undefined for the merge node even when enabled', () => {
    // Regression: merge writes commit messages and PR bodies that humans
    // read. Caveman style there produces unreadable commits.
    expect(resolveCavemanDirective('merge', true)).toBeUndefined();
    expect(resolveCavemanDirective('merge', true, 'custom')).toBeUndefined();
  });

  it('exempts every node in CAVEMAN_EXEMPT_NODES', () => {
    for (const exempt of CAVEMAN_EXEMPT_NODES) {
      expect(resolveCavemanDirective(exempt, true)).toBeUndefined();
    }
  });

  it('DEFAULT_CAVEMAN_DIRECTIVE is non-empty and includes the terse instruction', () => {
    expect(DEFAULT_CAVEMAN_DIRECTIVE.length).toBeGreaterThan(50);
    expect(DEFAULT_CAVEMAN_DIRECTIVE.toLowerCase()).toContain('caveman');
  });
});
