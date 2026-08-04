/**
 * Session tree route-gating tests.
 *
 * Two regressions are pinned here:
 *  1. The gate first shipped as '/', so the tree never rendered at all.
 *  2. It then shipped as an exact '/control-center' match, so the tree vanished
 *     whenever a feature or repository drawer opened over the canvas.
 *
 * The (dashboard) layout always renders the canvas, so every route in that
 * group must keep the sub-nav visible.
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

  it.each([
    '/feature/a0c58720-292d-4e51-babf-adb1801e59eb',
    '/feature/a0c58720-292d-4e51-babf-adb1801e59eb/overview',
    '/feature/abc/chat',
    '/repository/repo-1',
    '/repository/repo-1/settings',
    '/chat',
    '/create',
    '/adopt',
  ])('keeps the tree visible on the canvas route %s', (route) => {
    // These render as drawers over the still-visible canvas.
    expect(shouldShowSessionTree(route)).toBe(true);
  });

  it('does NOT show the tree on the root route', () => {
    expect(shouldShowSessionTree('/')).toBe(false);
  });

  it('does NOT confuse /features with /feature/', () => {
    // /features is the Inventory page, outside the (dashboard) canvas group.
    expect(shouldShowSessionTree('/features')).toBe(false);
  });

  it.each(['/applications', '/settings', '/clusters', '/sdlc', '/inventory', '/skills', '/tools'])(
    'does not show the tree on %s',
    (route) => {
      expect(shouldShowSessionTree(route)).toBe(false);
    }
  );

  it('handles null, undefined and empty pathnames', () => {
    expect(shouldShowSessionTree(null)).toBe(false);
    expect(shouldShowSessionTree(undefined)).toBe(false);
    expect(shouldShowSessionTree('')).toBe(false);
  });
});
