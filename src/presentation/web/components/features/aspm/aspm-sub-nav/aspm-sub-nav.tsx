'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Gauge, Bug, Package, Users, Sparkles, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AspmScanDialog } from '../aspm-scan-dialog/aspm-scan-dialog';

interface AspmSubNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true, only an exact pathname match marks this tab active (used for the dashboard root). */
  exact?: boolean;
}

const ITEMS: AspmSubNavItem[] = [
  { href: '/aspm', label: 'Dashboard', icon: Gauge, exact: true },
  { href: '/aspm/findings', label: 'Findings', icon: Bug },
  { href: '/aspm/inventory', label: 'Inventory', icon: Package },
  { href: '/aspm/owners', label: 'Owners', icon: Users },
  { href: '/aspm/ai-review', label: 'AI Review', icon: Sparkles },
  { href: '/aspm/compliance', label: 'Compliance', icon: ClipboardCheck },
];

/**
 * Horizontal in-page sub-navigation rendered above every ASPM page.
 *
 * Mirrors the sidebar's Security group so users who deep-link into a sub-page
 * (or who collapse the sidebar) can still hop between the ASPM surfaces without
 * leaving the section. Active tab is derived from `usePathname()` — `exact: true`
 * is used for `/aspm` so it isn't always-on for every nested route.
 */
export function AspmSubNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="ASPM sections"
      className="border-border bg-background sticky top-0 z-10 flex shrink-0 items-center gap-1 overflow-x-auto border-b px-6 py-2"
      data-testid="aspm-sub-nav"
    >
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            data-testid={`aspm-sub-nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
      <div className="ms-auto shrink-0">
        <AspmScanDialog />
      </div>
    </nav>
  );
}
