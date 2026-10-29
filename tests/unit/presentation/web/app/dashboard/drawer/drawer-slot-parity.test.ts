/**
 * Every drawer URL needs a page in the dashboard's main (children) slot too.
 *
 * `@drawer` is a parallel route slot. A URL only matches when every sibling
 * slot can render it, so a drawer page without a children page (or a
 * `default.tsx`) works on client navigation but has no route on a direct load
 * or refresh. Next.js 16.4 fails the build on it ("Parallel route slots cannot
 * render the same URLs"); `/adopt` shipped that way.
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DASHBOARD_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../../src/presentation/web/app/(dashboard)'
);
const DRAWER_DIR = join(DASHBOARD_DIR, '@drawer');
const PAGE_FILE = 'page.tsx';
const DEFAULT_FILE = 'default.tsx';

function drawerRoutes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return drawerRoutes(path);
    return entry.name === PAGE_FILE ? [relative(DRAWER_DIR, dir)] : [];
  });
}

function childrenSlotCanRender(route: string): boolean {
  const routeDir = join(DASHBOARD_DIR, route);
  return existsSync(join(routeDir, PAGE_FILE)) || existsSync(join(routeDir, DEFAULT_FILE));
}

describe('dashboard @drawer slot parity', () => {
  const routes = drawerRoutes(DRAWER_DIR);

  it('finds the drawer routes', () => {
    expect(routes.map((route) => route.split(sep).join('/'))).toContain('adopt');
  });

  it.each(routes)('has a children-slot page for drawer route %s', (route) => {
    expect(childrenSlotCanRender(route)).toBe(true);
  });
});
