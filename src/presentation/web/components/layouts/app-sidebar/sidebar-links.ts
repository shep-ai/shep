/**
 * The sidebar's plain page links, in order. A link with a `flag` shows only
 * when that feature flag is on (any of them, for a list).
 *
 * Control Center — the canvas of every app and its features — comes first
 * and is Home. Listing the Apps page first as "Home" made users take its
 * Vite + shadcn prototype template for Shep's main workflow.
 */

import {
  ArrowLeftRight,
  Boxes,
  Brain,
  Factory,
  FolderKanban,
  Home,
  KanbanSquare,
  LayoutGrid,
  Puzzle,
  Server,
  Siren,
  TableProperties,
  Target,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureFlagsState } from '@/lib/feature-flags';

export interface SidebarLink {
  icon: LucideIcon;
  /** Key under `navigation.` in the web translations. */
  labelKey?: string;
  /** A label not translated yet. */
  label?: string;
  href: string;
  /** Active on every path under `href`, not only on `href` itself. */
  prefix?: boolean;
  /** Shown while this flag is on — or, for a list, while any of them is. */
  flag?: keyof FeatureFlagsState | readonly (keyof FeatureFlagsState)[];
}

export const SIDEBAR_LINKS: readonly SidebarLink[] = [
  { icon: Home, labelKey: 'controlCenter', href: '/control-center' },
  { icon: LayoutGrid, labelKey: 'applications', href: '/applications' },
  { icon: Server, labelKey: 'clusters', href: '/clusters', prefix: true, flag: 'clusters' },
  { icon: TableProperties, labelKey: 'inventory', href: '/features' },
  { icon: KanbanSquare, label: 'SDLC Board', href: '/sdlc', prefix: true },
  { icon: Brain, labelKey: 'projectMemory', href: '/memory', prefix: true },
  { icon: Boxes, labelKey: 'spaces', href: '/spaces', prefix: true, flag: 'spaces' },
  {
    icon: ArrowLeftRight,
    labelKey: 'trackers',
    href: '/connections',
    prefix: true,
    // Trackers and Notion knowledge connections share /connections.
    flag: ['trackers', 'knowledge'],
  },
  {
    icon: Target,
    labelKey: 'opportunities',
    href: '/opportunities',
    prefix: true,
    flag: 'opportunities',
  },
  { icon: Siren, labelKey: 'incidents', href: '/incidents', prefix: true, flag: 'incidents' },
  { icon: Factory, labelKey: 'factory', href: '/factory', prefix: true, flag: 'factory' },
  { icon: Wrench, labelKey: 'tools', href: '/tools' },
  { icon: FolderKanban, label: 'Projects', href: '/projects', prefix: true, flag: 'projects' },
  { icon: Puzzle, labelKey: 'skills', href: '/skills' },
];

export function visibleSidebarLinks(flags: FeatureFlagsState): SidebarLink[] {
  return SIDEBAR_LINKS.filter((link) => {
    if (link.flag === undefined) return true;
    const required: readonly (keyof FeatureFlagsState)[] =
      typeof link.flag === 'string' ? [link.flag] : link.flag;
    return required.some((flag) => flags[flag]);
  });
}

export function isSidebarLinkActive(link: SidebarLink, pathname: string | null): boolean {
  if (!pathname) return false;
  return link.prefix ? pathname.startsWith(link.href) : pathname === link.href;
}
