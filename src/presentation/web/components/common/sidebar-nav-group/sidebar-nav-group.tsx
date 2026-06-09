'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSoundAction } from '@/hooks/use-sound-action';

export interface SidebarNavGroupChild {
  icon: LucideIcon;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
}

export interface SidebarNavGroupProps {
  icon: LucideIcon;
  label: string;
  items: SidebarNavGroupChild[];
  /**
   * Destination when the user clicks the parent label/icon. Defaults to the
   * first child's href so the group is never a dead end (the prior version
   * was a pure toggle, which becomes a no-op in icon-collapsed sidebar mode
   * where the children list is CSS-hidden — leaving the user stuck on a
   * sidebar icon that does nothing).
   */
  href?: string;
  /** Badge shown next to the parent label (typically a sum of child badges). */
  badge?: number;
}

/**
 * A collapsible group of related nav items (e.g. Security → Dashboard, Findings, Inventory…).
 *
 * Click model — state-dependent so every click is responsive:
 *
 *  - **Expanded sidebar:** parent label TOGGLES the sub-list (open ↔ closed). The chevron is a
 *    visual affordance only; the whole row is a single toggle target. This matches the
 *    user-stated "toggle/dropdown" model and guarantees a visible response on every click —
 *    earlier we made the parent a Link, which silently no-op'd when the user was already on
 *    the parent's destination URL.
 *  - **Icon-collapsed sidebar:** parent NAVIGATES to {@link href} (defaults to the first
 *    child). A toggle in icon mode is a dead-end because the sub-list is CSS-hidden by
 *    shadcn's `group-data-[collapsible=icon]:hidden` rule — so we make the click navigate
 *    into the section instead.
 *  - Group **auto-expands** when any child is the current page, and **re-expands** when the
 *    user navigates into a child from outside (e.g. from a global search result).
 *  - The child rows are always Links — that's how the user navigates between sub-pages.
 */
export function SidebarNavGroup({ icon: Icon, label, items, href, badge }: SidebarNavGroupProps) {
  const anyChildActive = items.some((c) => c.active);
  const [open, setOpen] = useState(anyChildActive);
  const navigateSound = useSoundAction('navigate');
  const { state: sidebarState } = useSidebar();
  const isIconMode = sidebarState === 'collapsed';
  const groupId = `sidebar-nav-group-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const parentHref = href ?? items[0]?.href ?? '#';

  // Re-open when navigation lands on a child from outside (e.g. user collapsed
  // the group, then deep-linked into a child via the omnibar). We only ever
  // force-open — never force-close — so a user-driven collapse sticks until
  // they leave the section.
  useEffect(() => {
    if (anyChildActive) setOpen(true);
  }, [anyChildActive]);

  return (
    <SidebarMenuItem data-testid="sidebar-nav-group">
      {isIconMode ? (
        <SidebarMenuButton asChild isActive={anyChildActive} tooltip={label}>
          <Link
            href={parentHref as Route}
            onClick={() => navigateSound.play()}
            data-testid="sidebar-nav-group-trigger"
          >
            <Icon />
            <span>{label}</span>
            {badge != null && badge > 0 ? (
              <span className="bg-destructive text-destructive-foreground ms-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </Link>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton
          isActive={anyChildActive}
          tooltip={label}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={groupId}
          data-testid="sidebar-nav-group-trigger"
        >
          <Icon />
          <span>{label}</span>
          {badge != null && badge > 0 ? (
            <span className="bg-destructive text-destructive-foreground ms-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold">
              {badge > 99 ? '99+' : badge}
            </span>
          ) : null}
          <ChevronRight
            className={[
              'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
              badge != null && badge > 0 ? 'ms-1' : 'ms-auto',
              open ? 'rotate-90' : '',
            ].join(' ')}
            aria-hidden
          />
        </SidebarMenuButton>
      )}
      {open && !isIconMode ? (
        <SidebarMenuSub id={groupId}>
          {items.map((child) => (
            <SidebarMenuSubItem key={child.href}>
              <SidebarMenuSubButton asChild isActive={child.active}>
                <Link
                  href={child.href as Route}
                  onClick={() => navigateSound.play()}
                  data-testid="sidebar-nav-group-child"
                >
                  <child.icon />
                  <span>{child.label}</span>
                  {child.badge != null && child.badge > 0 ? (
                    <span className="bg-destructive text-destructive-foreground ms-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold">
                      {child.badge > 99 ? '99+' : child.badge}
                    </span>
                  ) : null}
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  );
}
