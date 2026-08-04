/**
 * Session tree route-gating tests.
 *
 * Regression guard: the tree first shipped gated on '/' while the Control
 * Center is actually at '/control-center', so it never rendered and no test
 * caught it.
 */

import { describe, it, expect } from 'vitest';
import {
  CONTROL_CENTER_ROUTE,
  shouldShowSessionTree,
} from '@/components/layouts/app-shell/session-tree-visibility';

describe('shouldShowSessionTree', () => {
  it('uses the real Control Center route', () => {
    expect(CONTROL_CENTER_ROUTE).toBe('/control-center');
  });

  it('shows the tree on the Control Center', () => {
    expect(shouldShowSessionTree('/control-center')).toBe(true);
  });

  it('does NOT show the tree on the root route', () => {
    // '/' was the original wrong gate.
    expect(shouldShowSessionTree('/')).toBe(false);
  });

  it.each(['/applications', '/features', '/settings', '/clusters', '/sdlc', '/inventory'])(
    'does not show the tree on %s',
    (route) => {
      expect(shouldShowSessionTree(route)).toBe(false);
    }
  );

  it('does not show the tree on a nested control-center path', () => {
    expect(shouldShowSessionTree('/control-center/extra')).toBe(false);
  });

  it('handles null and undefined pathnames', () => {
    expect(shouldShowSessionTree(null)).toBe(false);
    expect(shouldShowSessionTree(undefined)).toBe(false);
  });
});
