'use client';

/**
 * FleetTriageDrawer (spec 111)
 *
 * The exception feed. Lists only what needs a human, ordered P1 → P3, each row
 * carrying the reason and the way to resolve it. Healthy features are
 * deliberately absent — that is the whole point of the surface.
 *
 * "The way to resolve it" is the operative part. The first version of this
 * drawer was read-only: every row was a static `<div>` and a gate's only
 * affordance was a non-copyable `<code>` telling the operator to go and run
 * `shep feat approve <slug>` in a terminal. An operator watching 50 agents does
 * not want to be handed a command; PR #860 shipped `shep fleet triage` and
 * batch approve to the CLI, and this surface now exposes the same use cases:
 *
 * - every row is a link into its feature,
 * - a gate row approves inline, and a failed row retries inline,
 * - the footer clears the whole P1 gate backlog — or approves only the gates the
 *   guardrail rules prove low-risk — or restarts every failed run, each behind a
 *   confirmation.
 *
 * Approvals resume agent runs, so they are consequential: each one has an
 * in-flight state, a refusal path that toasts the reason, and — for the batch —
 * an `AlertDialog` naming the count before anything is sent. Retries are the same
 * shape, for the same reason: they start agents, and a partial batch must never
 * read as a clean one.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { approveFeature } from '@/app/actions/approve-feature';
import { batchApproveFeatures } from '@/app/actions/batch-approve-features';
import { retryFailedFleetFeatures } from '@/app/actions/retry-failed-fleet-features';
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

/** Placeholder rows shown while the feed is still being read. */
const SKELETON_ROWS = 3;

export interface FleetTriageDrawerProps {
  items: FleetTriageItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * True while the feed is still being read. The drawer then shows placeholder
   * rows: an empty `items` array during a read means "not known yet", and
   * rendering the all-clear for it is a false negative on the one surface whose
   * job is to report exceptions.
   */
  loading?: boolean;
  /** Optional refresh hook — renders a Refresh button when supplied. */
  onRefresh?: () => void;
  /** True while a refresh is in flight. */
  refreshing?: boolean;
  className?: string;
}

function message(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** A gate row is the only kind this surface can approve. */
function isApprovableGate(item: FleetTriageItem): boolean {
  return item.category === FleetTriageCategory.gate;
}

/**
 * A failed run is the only kind this surface can retry.
 *
 * `ci_failed` is deliberately excluded, and it is the interesting omission: that
 * category fires for any feature with a red CI run, whatever its agent run is
 * doing, so retrying it would either approve a merge gate by accident or hit a
 * run that already finished. `RetryFailedFleetFeaturesUseCase` carries the full
 * reasoning.
 */
function isRetryableRun(item: FleetTriageItem): boolean {
  return item.category === FleetTriageCategory.crash;
}

/**
 * One clause per distinct refusal reason, naming the features it refused.
 *
 * A batch refused for one shared reason used to repeat that reason once per
 * feature, which turned the toast into a wall of identical text.
 */
function describeRetryFailures(failures: { featureName: string; reason: string }[]): string {
  const namesByReason = new Map<string, string[]>();
  for (const failure of failures) {
    const names = namesByReason.get(failure.reason) ?? [];
    names.push(failure.featureName);
    namesByReason.set(failure.reason, names);
  }
  return [...namesByReason].map(([reason, names]) => `${names.join(', ')}: ${reason}`).join('; ');
}

/**
 * One clause per guardrail reason, naming the features it left for the user.
 *
 * The use case reports ids; the operator knows names. Same rule as the retry
 * batch: a shared reason belongs in one clause, never repeated per feature.
 */
function describeSkipped(
  skipped: { featureId: string; reason: string }[],
  nameOf: (featureId: string) => string
): string {
  const namesByReason = new Map<string, string[]>();
  for (const entry of skipped) {
    const names = namesByReason.get(entry.reason) ?? [];
    names.push(nameOf(entry.featureId));
    namesByReason.set(entry.reason, names);
  }
  return [...namesByReason].map(([reason, names]) => `${names.join(', ')}: ${reason}`).join('; ');
}

export function FleetTriageDrawer({
  items,
  open,
  onOpenChange,
  loading = false,
  onRefresh,
  refreshing = false,
  className,
}: FleetTriageDrawerProps) {
  /** Feature ids with an approval in flight, so each row disables only itself. */
  const [approving, setApproving] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  /** The guardrail-judged batch is a second path, with its own in-flight state. */
  const [lowRiskConfirmOpen, setLowRiskConfirmOpen] = useState(false);
  const [lowRiskPending, setLowRiskPending] = useState(false);

  /** Same, for retries — kept separate so one row's retry never blocks an approve. */
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set());
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [retryBatchPending, setRetryBatchPending] = useState(false);

  const p1Gates = useMemo(
    () =>
      items.filter((item) => isApprovableGate(item) && item.priority === FleetTriagePriority.p1),
    [items]
  );

  /** The use case reports ids; the operator reads names. */
  const nameById = useMemo(
    () => new Map(items.map((entry) => [entry.featureId, entry.featureName])),
    [items]
  );

  /** Either batch in flight: both write approvals, so they disable each other. */
  const batchBusy = batchPending || lowRiskPending;

  /**
   * One entry per feature, as the use case selects them. A feature can hold both
   * a crashed run and a failing CI check, and retrying it twice would put two
   * agents in one worktree.
   */
  const retryable = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!isRetryableRun(item) || seen.has(item.featureId)) return false;
      seen.add(item.featureId);
      return true;
    });
  }, [items]);

  const handleApprove = useCallback(
    async (item: FleetTriageItem) => {
      setApproving((prev) => new Set(prev).add(item.featureId));
      try {
        const result = await approveFeature(item.featureId);
        if (!result.approved) {
          toast.error(result.error ?? `Failed to approve ${item.featureName}`);
          return;
        }
        toast.success(`${item.featureName} approved — agent resuming`);
        onRefresh?.();
      } catch (error: unknown) {
        toast.error(message(error, `Failed to approve ${item.featureName}`));
      } finally {
        setApproving((prev) => {
          const next = new Set(prev);
          next.delete(item.featureId);
          return next;
        });
      }
    },
    [onRefresh]
  );

  const handleApproveAll = useCallback(async () => {
    const featureIds = p1Gates.map((item) => item.featureId);
    setBatchPending(true);
    try {
      const result = await batchApproveFeatures({ featureIds });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.failedCount > 0) {
        // A partial batch is the dangerous outcome: the count drops, the
        // operator assumes it is done, and the stragglers go unnoticed.
        toast.error(
          `Approved ${result.approvedCount} of ${result.totalAttempted} — ${result.failures
            .map((failure) => `${failure.featureId}: ${failure.reason}`)
            .join('; ')}`
        );
      } else {
        toast.success(`Approved ${result.approvedCount} features — agents resuming`);
      }

      onRefresh?.();
    } catch (error: unknown) {
      toast.error(message(error, 'Failed to approve features'));
    } finally {
      setBatchPending(false);
      setConfirmOpen(false);
    }
  }, [p1Gates, onRefresh]);

  /**
   * Approve only what the guardrails prove safe.
   *
   * Delegates the whole decision to `BatchApproveFeaturesUseCase` with
   * `lowRisk`, the same call `shep fleet approve --low-risk` makes. No rules
   * means no approvals, so the result is reported rather than assumed: a batch
   * that approved nothing says so, and every skipped gate is named with the
   * reason the guardrails left it.
   */
  const handleApproveLowRisk = useCallback(async () => {
    const featureIds = p1Gates.map((item) => item.featureId);
    setLowRiskPending(true);
    try {
      const result = await batchApproveFeatures({ featureIds, lowRisk: true });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      const skippedCount = result.skippedCount ?? 0;
      const description =
        skippedCount > 0
          ? describeSkipped(result.skipped, (id) => nameById.get(id) ?? id)
          : undefined;

      if (result.failedCount > 0) {
        toast.error(
          `Approved ${result.approvedCount} of ${result.totalAttempted} — ${result.failures
            .map((failure) => `${failure.featureId}: ${failure.reason}`)
            .join('; ')}`
        );
      } else if (result.approvedCount === 0 && skippedCount > 0) {
        // Nothing was provable. The operator asked for the safe batch and got
        // none of it, so this is a refusal, not a success with zero.
        toast.warning('No gate is provably low-risk — nothing was approved', { description });
      } else if (skippedCount > 0) {
        toast.success(
          `Approved ${result.approvedCount} of ${result.totalAttempted} — ${skippedCount} left for you`,
          { description }
        );
      } else {
        toast.success(`Approved ${result.approvedCount} features — agents resuming`);
      }

      onRefresh?.();
    } catch (error: unknown) {
      toast.error(message(error, 'Failed to approve features'));
    } finally {
      setLowRiskPending(false);
      setLowRiskConfirmOpen(false);
    }
  }, [p1Gates, nameById, onRefresh]);

  const handleRetry = useCallback(
    async (item: FleetTriageItem) => {
      setRetrying((prev) => new Set(prev).add(item.featureId));
      try {
        const result = await retryFailedFleetFeatures({ featureIds: [item.featureId] });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        if (result.retriedCount === 0) {
          // The row was selectable but nothing restarted — a paused queue, a
          // capacity cap, a run that finished underneath us. Say why.
          toast.error(
            result.blockedReason ??
              result.failures[0]?.reason ??
              `Could not restart ${item.featureName}`
          );
          return;
        }

        toast.success(`${item.featureName} restarted — agent resuming`);
        onRefresh?.();
      } catch (error: unknown) {
        toast.error(message(error, `Failed to retry ${item.featureName}`));
      } finally {
        setRetrying((prev) => {
          const next = new Set(prev);
          next.delete(item.featureId);
          return next;
        });
      }
    },
    [onRefresh]
  );

  const handleRetryAll = useCallback(async () => {
    const featureIds = retryable.map((item) => item.featureId);
    setRetryBatchPending(true);
    try {
      const result = await retryFailedFleetFeatures({ featureIds });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.blockedReason) {
        toast.error(result.blockedReason);
      } else if (result.failedCount > 0) {
        // A partial batch is the dangerous outcome: the count drops, the
        // operator assumes it is done, and the stragglers go unnoticed.
        toast.error(
          `Retried ${result.retriedCount} of ${result.totalAttempted} — ${describeRetryFailures(
            result.failures
          )}`
        );
      } else {
        toast.success(`Retried ${result.retriedCount} features — agents resuming`);
      }

      onRefresh?.();
    } catch (error: unknown) {
      toast.error(message(error, 'Failed to retry features'));
    } finally {
      setRetryBatchPending(false);
      setRetryConfirmOpen(false);
    }
  }, [retryable, onRefresh]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        direction="right"
        className={cn('w-full sm:max-w-md', className)}
        data-testid="fleet-triage-drawer"
      >
        <DrawerHeader>
          <DrawerTitle>
            {loading || items.length === 0
              ? 'Fleet triage'
              : `Fleet triage — ${items.length} item${items.length === 1 ? '' : 's'}`}
          </DrawerTitle>
          <DrawerDescription>
            Only exceptions appear here. Features progressing normally are omitted.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-2">
          {loading ? (
            <div role="status" aria-label="Loading fleet triage" aria-busy="true">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <div
                  key={index}
                  className="mb-3 rounded-lg border p-3"
                  data-testid="fleet-triage-skeleton"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-24" />
                  <Skeleton className="mt-3 h-3 w-full" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p
              className="text-muted-foreground py-8 text-center text-sm"
              data-testid="fleet-triage-empty"
            >
              Nothing needs you right now.
            </p>
          ) : (
            items.map((item) => {
              const pending = approving.has(item.featureId);
              const retryPending = retrying.has(item.featureId);
              return (
                <div
                  key={`${item.featureId}:${item.category}:${item.runId ?? ''}`}
                  className="rounded-lg border p-3"
                  data-testid="fleet-triage-item"
                >
                  <div className="flex items-center justify-between gap-2">
                    {/*
                     * The row title is the way into the feature. A real anchor
                     * rather than a click handler on a div: it is reachable by
                     * keyboard, announced as a link, and middle-clicks into a
                     * new tab like every other navigation in the app.
                     */}
                    <Link
                      href={`/feature/${item.featureId}`}
                      onClick={() => onOpenChange(false)}
                      className="focus-visible:ring-ring min-w-0 rounded-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                      data-testid={`fleet-triage-link-${item.featureId}`}
                    >
                      <p className="truncate text-sm font-medium hover:underline">
                        {item.featureName}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">{item.slug}</p>
                    </Link>
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

                  {isApprovableGate(item) || isRetryableRun(item) ? (
                    <div className="mt-2 flex items-center gap-2">
                      {isApprovableGate(item) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => void handleApprove(item)}
                          disabled={pending}
                          data-testid={`fleet-triage-approve-${item.featureId}`}
                        >
                          {pending ? 'Approving…' : 'Approve'}
                        </Button>
                      ) : null}
                      {isRetryableRun(item) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => void handleRetry(item)}
                          disabled={retryPending}
                          data-testid={`fleet-triage-retry-${item.featureId}`}
                        >
                          {retryPending ? 'Retrying…' : 'Retry'}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <DrawerFooter>
          {p1Gates.length > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={batchBusy}
              data-testid="fleet-triage-approve-all"
            >
              {batchPending ? 'Approving…' : `Approve all P1 (${p1Gates.length})`}
            </Button>
          ) : null}
          {p1Gates.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLowRiskConfirmOpen(true)}
              disabled={batchBusy}
              data-testid="fleet-triage-approve-low-risk"
            >
              {lowRiskPending ? 'Checking guardrails…' : 'Approve low-risk'}
            </Button>
          ) : null}
          {retryable.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRetryConfirmOpen(true)}
              disabled={retryBatchPending}
              data-testid="fleet-triage-retry-all"
            >
              {retryBatchPending ? 'Retrying…' : `Retry all failed (${retryable.length})`}
            </Button>
          ) : null}
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

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent data-testid="fleet-triage-approve-all-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Approve {p1Gates.length} P1 feature{p1Gates.length === 1 ? '' : 's'}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Each approval resumes its agent run and cannot be undone from here. Features that
                cannot be approved are reported individually and do not block the rest.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={batchPending}
                data-testid="fleet-triage-approve-all-cancel"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  // Keep the dialog up while the batch runs so its in-flight
                  // state is visible; `handleApproveAll` closes it when done.
                  event.preventDefault();
                  void handleApproveAll();
                }}
                disabled={batchPending}
                data-testid="fleet-triage-approve-all-confirm"
              >
                {batchPending ? 'Approving…' : 'Approve all'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={lowRiskConfirmOpen} onOpenChange={setLowRiskConfirmOpen}>
          <AlertDialogContent data-testid="fleet-triage-approve-low-risk-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Approve only the low-risk P1 gates?</AlertDialogTitle>
              <AlertDialogDescription>
                Each gate is judged against the guardrail rules first. Gates that breach a rule, are
                advise-only, or have no rules configured stay for you, and the result names each one
                with its reason. Approvals resume agent runs and cannot be undone from here.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={lowRiskPending}
                data-testid="fleet-triage-approve-low-risk-cancel"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  // Keep the dialog up while the guardrails run, as the other
                  // batch does; the handler closes it when done.
                  event.preventDefault();
                  void handleApproveLowRisk();
                }}
                disabled={lowRiskPending}
                data-testid="fleet-triage-approve-low-risk-confirm"
              >
                {lowRiskPending ? 'Approving…' : 'Approve low-risk'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={retryConfirmOpen} onOpenChange={setRetryConfirmOpen}>
          <AlertDialogContent data-testid="fleet-triage-retry-all-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Retry {retryable.length} failed feature{retryable.length === 1 ? '' : 's'}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Each retry starts a new agent run for that feature. Runs you stopped on purpose are
                included, and a feature that cannot be restarted is reported individually without
                blocking the rest.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={retryBatchPending}
                data-testid="fleet-triage-retry-all-cancel"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  // Keep the dialog up while the batch runs so its in-flight
                  // state is visible; `handleRetryAll` closes it when done.
                  event.preventDefault();
                  void handleRetryAll();
                }}
                disabled={retryBatchPending}
                data-testid="fleet-triage-retry-all-confirm"
              >
                {retryBatchPending ? 'Retrying…' : 'Retry all'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DrawerContent>
    </Drawer>
  );
}
