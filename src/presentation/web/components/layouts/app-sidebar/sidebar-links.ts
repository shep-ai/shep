/**
 * The sidebar's plain page links, in order. A link with a `flag` shows only
 * when that feature flag is on (any of them, for a list).
 *
 * Control Center — the canvas of every app and its features — comes first
 * and is Home. Listing the Apps page first as "Home" made users take its
 * Vite + shadcn prototype template for Shep's main workflow.
 */

import {
  Activity,
  ArrowLeftRight,
  Boxes,
  Brain,
  Factory,
  FolderKanban,
  Home,
  KanbanSquare,
  LayoutGrid,
  MessagesSquare,
  Puzzle,
  Server,
  Siren,
  TableProperties,
  Target,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureFlagsState } from '@/lib/feature-flags';

/** Live counts a sidebar link can carry as its badge. */
export const SIDEBAR_BADGE = {
  /** Features whose agent is blocked on the user, agent questions included (spec 149). */
  BlockedFeatures: 'blocked-features',
} as const;
export type SidebarBadge = (typeof SIDEBAR_BADGE)[keyof typeof SIDEBAR_BADGE];

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
  /** The live count shown on the link; hidden at zero. */
  badge?: SidebarBadge;
}

export const SIDEBAR_LINKS: readonly SidebarLink[] = [
  { icon: Home, labelKey: 'controlCenter', href: '/control-center' },
  // Spec 137: the chat-first surface, where work is started, steered and answered.
  { icon: MessagesSquare, labelKey: 'chat', href: '/chats', prefix: true },
  // Spec 149: every feature's agent — working, needs you, waiting, done, failed — and why.
  {
    icon: Activity,
    labelKey: 'agentActivity',
    href: '/activity',
    badge: SIDEBAR_BADGE.BlockedFeatures,
  },
  { icon: LayoutGrid, labelKey: 'applications', href: '/applications' },
  { icon: Server, labelKey: 'clusters', href: '/clusters', prefix: true, flag: 'clusters' },
  { icon: TableProperties, labelKey: 'inventory', href: '/features' },
  { icon: KanbanSquare, label: 'SDLC Board', href: '/sdlc', prefix: true, flag: 'sdlcBoard' },
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
