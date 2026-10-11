import { describe, it, expect } from 'vitest';
import { toRouteView } from '@/lib/telemetry-route';

describe('toRouteView', () => {
  it('replaces every dynamic segment with its parameter name', () => {
    expect(toRouteView('/feature/feat-1234/overview', { featureId: 'feat-1234' })).toEqual({
      area: '/feature',
      route: '/feature/[featureId]/overview',
    });
  });

  it('keeps static routes unchanged', () => {
    expect(toRouteView('/aspm/findings', {})).toEqual({
      area: '/aspm',
      route: '/aspm/findings',
    });
  });

  it('replaces catch-all segments, including names that look like ordinary words', () => {
    expect(
      toRouteView('/repo/my-secret-repo/files/src/index.ts', {
        name: 'my-secret-repo',
        path: ['src', 'index.ts'],
      })
    ).toEqual({ area: '/repo', route: '/repo/[name]/files/[path]/[path]' });
  });

  it('matches URL-encoded segments against decoded params', () => {
    expect(toRouteView('/space/acme%20corp', { space: 'acme corp' }).route).toBe('/space/[space]');
  });

  it('reports the root as /', () => {
    expect(toRouteView('/', {})).toEqual({ area: '/', route: '/' });
  });
});
