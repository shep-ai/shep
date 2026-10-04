/**
 * The sidebar's plain page links, in order. A link with a `flag` shows only
 * when that feature flag is on.
 *
 * Control Center — the canvas of every app and its features — comes first
 * and is Home. Listing the Apps page first as "Home" made users take its
 * Vite + shadcn prototype template for Shep's main workflow.
 */

import {
  ArrowLeftRight,
  Boxes,
  Brain,
  FolderKanban,
  Home,
  KanbanSquare,
  LayoutGrid,
  Puzzle,
  Server,
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
  flag?: keyof FeatureFlagsState;
}

export const SIDEBAR_LINKS: readonly SidebarLink[] = [
  { icon: Home, labelKey: 'controlCenter', href: '/control-center' },
  { icon: LayoutGrid, labelKey: 'applications', href: '/applications' },
  { icon: Server, labelKey: 'clusters', href: '/clusters', prefix: true, flag: 'clusters' },
  { icon: TableProperties, labelKey: 'inventory', href: '/features' },
  { icon: KanbanSquare, label: 'SDLC Board', href: '/sdlc', prefix: true },
  { icon: Brain, labelKey: 'projectMemory', href: '/memory', prefix: true },
  { icon: Boxes, labelKey: 'spaces', href: '/spaces', prefix: true },
  { icon: ArrowLeftRight, labelKey: 'trackers', href: '/connections', prefix: true },
  { icon: Target, labelKey: 'opportunities', href: '/opportunities', prefix: true },
  { icon: Wrench, labelKey: 'tools', href: '/tools' },
  { icon: FolderKanban, label: 'Projects', href: '/projects', prefix: true, flag: 'projects' },
  { icon: Puzzle, labelKey: 'skills', href: '/skills' },
];

export function visibleSidebarLinks(flags: FeatureFlagsState): SidebarLink[] {
  return SIDEBAR_LINKS.filter((link) => link.flag === undefined || flags[link.flag]);
}

export function isSidebarLinkActive(link: SidebarLink, pathname: string | null): boolean {
  if (!pathname) return false;
  return link.prefix ? pathname.startsWith(link.href) : pathname === link.href;
}
