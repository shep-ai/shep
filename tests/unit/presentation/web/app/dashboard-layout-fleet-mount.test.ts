// @vitest-environment node

/**
 * Guard — the fleet surfaces stay unmounted from the dashboard route group.
 *
 * `FleetControl` was pinned to the canvas's top-right corner, where it overlapped
 * the canvas chrome and covered the workspace beneath it. The mount is withdrawn
 * until the surface is redesigned; the components, their stories, their tests,
 * the `getFleetData` action and `shep fleet status` are all deliberately intact,
 * so nothing but this file records that the absence is a decision rather than an
 * oversight.
 *
 * Re-mounting is the right outcome once the placement is settled — delete this
 * test as part of that change.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const DASHBOARD_LAYOUT = join(REPO_ROOT, 'src/presentation/web/app/(dashboard)/layout.tsx');

describe('dashboard route-group layout', () => {
  const source = readFileSync(DASHBOARD_LAYOUT, 'utf-8');

  /** Comments explain why the mount is gone, so only code is inspected. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('does not render the fleet control over the canvas', () => {
    expect(code).not.toMatch(/<FleetControl\b/);
  });

  it('does not import the fleet components or their server action', () => {
    expect(code).not.toMatch(/from\s+'@\/components\/fleet'/);
    expect(code).not.toMatch(/from\s+'@\/app\/actions\/fleet-data'/);
  });
});
