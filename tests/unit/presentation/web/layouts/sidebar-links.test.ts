import { describe, it, expect } from 'vitest';
import {
  SIDEBAR_LINKS,
  isSidebarLinkActive,
  visibleSidebarLinks,
} from '@/components/layouts/app-sidebar/sidebar-links';
import type { FeatureFlagsState } from '@/lib/feature-flags';

const OFF = {
  envDeploy: false,
  debug: false,
  reactFileManager: false,
  projects: false,
  codeReview: false,
  collaboration: false,
  aspm: false,
  bedrockIntegration: false,
  whatsappDispatch: false,
  clusters: false,
  scheduledWorkflows: false,
  githubImport: false,
  queryAwareHarness: false,
  spaces: false,
  trackers: false,
  knowledge: false,
  signals: false,
  opportunities: false,
  feedback: false,
  discovery: false,
  incidents: false,
  outcomes: false,
  docsFirst: false,
  autopilot: false,
  factory: false,
} satisfies FeatureFlagsState;

describe('sidebar links', () => {
  it('starts with Control Center and lists Opportunities after Connections', () => {
    const hrefs = SIDEBAR_LINKS.map((link) => link.href);
    expect(hrefs[0]).toBe('/control-center');
    expect(hrefs.indexOf('/opportunities')).toBe(hrefs.indexOf('/connections') + 1);
  });

  it('lists Incidents right after Opportunities (spec 129)', () => {
    const hrefs = SIDEBAR_LINKS.map((link) => link.href);
    expect(hrefs.indexOf('/incidents')).toBe(hrefs.indexOf('/opportunities') + 1);
  });

  it('lists the Factory right after Incidents (spec 132)', () => {
    const hrefs = SIDEBAR_LINKS.map((link) => link.href);
    expect(hrefs.indexOf('/factory')).toBe(hrefs.indexOf('/incidents') + 1);
  });

  it('hides flagged links until their flag is on', () => {
    expect(visibleSidebarLinks(OFF).map((l) => l.href)).not.toContain('/clusters');
    expect(visibleSidebarLinks({ ...OFF, clusters: true }).map((l) => l.href)).toContain(
      '/clusters'
    );
  });

  it.each([
    ['spaces', '/spaces'],
    ['trackers', '/connections'],
    ['opportunities', '/opportunities'],
    ['incidents', '/incidents'],
    ['factory', '/factory'],
  ] as const)('shows the %s area at %s only while its flag is on (spec 133)', (flag, href) => {
    expect(visibleSidebarLinks(OFF).map((l) => l.href)).not.toContain(href);
    expect(visibleSidebarLinks({ ...OFF, [flag]: true }).map((l) => l.href)).toContain(href);
  });

  it('shows /connections for either trackers or Notion knowledge', () => {
    expect(visibleSidebarLinks({ ...OFF, knowledge: true }).map((l) => l.href)).toContain(
      '/connections'
    );
  });

  it('matches exact pages exactly and sections by prefix', () => {
    const tools = SIDEBAR_LINKS.find((l) => l.href === '/tools')!;
    const opportunities = SIDEBAR_LINKS.find((l) => l.href === '/opportunities')!;
    expect(isSidebarLinkActive(tools, '/tools')).toBe(true);
    expect(isSidebarLinkActive(tools, '/tools/x')).toBe(false);
    expect(isSidebarLinkActive(opportunities, '/opportunities?space=acme')).toBe(true);
    expect(isSidebarLinkActive(opportunities, null)).toBe(false);
  });
});
