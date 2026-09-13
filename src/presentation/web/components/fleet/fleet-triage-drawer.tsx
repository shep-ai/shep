'use client';

/**
 * FleetTriageDrawer (spec 111)
 *
 * The exception feed. Lists only what needs a human, ordered P1 → P3, each row
 * carrying the reason and the command that resolves it. Healthy features are
 * deliberately absent — that is the whole point of the surface.
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  FleetTriageCategory,
  FleetTriagePriority,
  type FleetTriageItem,
} from '@shepai/core/domain/generated/output';

const PRIORITY_VARIANT: Record<FleetTriagePriority, 'destructive' | 'secondary' | 'outline'> = {
  [FleetTriagePriority.p1]: 'destructive',
  [FleetTriagePriority.p2]: 'secondary',
  [FleetTriagePriority.p3]: 'outline',
};

const CATEGORY_LABEL: Record<FleetTriageCategory, string> = {
  [FleetTriageCategory.gate]: 'Approval gate',
  [FleetTriageCategory.question]: 'Question',
  [FleetTriageCategory.ci_failed]: 'CI failed',
  [FleetTriageCategory.conflict]: 'Merge conflict',
  [FleetTriageCategory.crash]: 'Run failed',
  [FleetTriageCategory.warning]: 'Warning',
};

export interface FleetTriageDrawerProps {
  items: FleetTriageItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional refresh hook — renders a Refresh button when supplied. */
  onRefresh?: () => void;
  /** True while a refresh is in flight. */
  refreshing?: boolean;
  className?: string;
}

export function FleetTriageDrawer({
  items,
  open,
  onOpenChange,
  onRefresh,
  refreshing = false,
  className,
}: FleetTriageDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className={cn('sm:max-w-lg', className)} data-testid="fleet-triage-drawer">
        <DrawerHeader>
          <DrawerTitle>
            {items.length === 0
              ? 'Fleet triage'
              : `Fleet triage — ${items.length} item${items.length === 1 ? '' : 's'}`}
          </DrawerTitle>
          <DrawerDescription>
            Only exceptions appear here. Features progressing normally are omitted.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-2">
          {items.length === 0 ? (
            <p
              className="text-muted-foreground py-8 text-center text-sm"
              data-testid="fleet-triage-empty"
            >
              Nothing needs you right now.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={`${item.featureId}:${item.category}:${item.runId ?? ''}`}
                className="rounded-lg border p-3"
                data-testid="fleet-triage-item"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.featureName}</p>
                    <p className="text-muted-foreground truncate text-xs">{item.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={PRIORITY_VARIANT[item.priority]} className="text-[10px]">
                      {item.priority}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABEL[item.category]}
                    </Badge>
                  </div>
                </div>

                <p className="text-muted-foreground mt-2 text-xs">{item.reason}</p>

                {item.category === FleetTriageCategory.gate ? (
                  <code className="bg-muted mt-2 block w-fit rounded px-1.5 py-0.5 text-[11px]">
                    shep feat approve {item.slug}
                  </code>
                ) : null}
              </div>
            ))
          )}
        </div>

        <DrawerFooter>
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              data-testid="fleet-triage-refresh"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          ) : null}
          <DrawerClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
