'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  Bug,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  GitBranch,
  FolderGit2,
  LayoutGrid,
} from 'lucide-react';
import type { ScanTargetTree } from '@shepai/core/application/use-cases/aspm/scan/list-scan-targets';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  startBulkScan,
  listAspmScanTargets,
  type AspmBulkScanResult,
} from '@/app/actions/aspm-scan';
import { AspmIngestDialog } from '@/components/features/aspm/aspm-ingest-dialog/aspm-ingest-dialog';

import {
  APP_PREFIX,
  FEAT_PREFIX,
  applicationLeafIdsForRepository,
  appSelectionId,
  computeBulkTargets,
  featureSelectionId,
  leafIdsForRepository,
  selectionStateForApplication,
  selectionStateForRepository,
  toggleLeaves,
  toggleSingle,
} from './compute-bulk-targets';

/**
 * Controls how `defaultRepositoryId` seeds the initial selection.
 *
 *  - `all-branches` (default) checks every leaf under the repo —
 *    applications + feature worktrees.
 *  - `main-only` checks just the applications, so the scan runs against
 *    each app's `repositoryPath` (the main working tree) and skips the
 *    feature worktrees.
 */
export type AspmScanDialogRepoScope = 'all-branches' | 'main-only';

export interface AspmScanDialogProps {
  /** Pre-select this application when the dialog opens. */
  defaultApplicationId?: string;
  /** Pre-select leaves under this repository when the dialog opens. */
  defaultRepositoryId?: string;
  /** Scope used when `defaultRepositoryId` is set. Defaults to `all-branches`. */
  defaultRepositoryScope?: AspmScanDialogRepoScope;
  /** Trigger node — when omitted, renders a default "Scan now" button. */
  trigger?: React.ReactNode;
  /** Called after a successful scan so callers can refresh local UI. */
  onScanned?: (result: AspmBulkScanResult) => void;
  /**
   * Controlled open state. When provided, the parent owns whether the
   * dialog is visible and the internal trigger is bypassed (`trigger` is
   * still rendered for accessibility but the open state ignores it).
   */
  open?: boolean;
  /** Called whenever the dialog wants to open or close (controlled mode). */
  onOpenChange?: (open: boolean) => void;
  /** Test/Storybook overrides. */
  loadTargetsOverride?: typeof listAspmScanTargets;
  startBulkScanOverride?: typeof startBulkScan;
}

interface StageOption {
  id: 'sbom' | 'sca' | 'secrets' | 'sast' | 'container' | 'iac';
  label: string;
  description: string;
}

const STAGE_OPTIONS: readonly StageOption[] = [
  { id: 'sbom', label: 'SBOM', description: 'Build the software bill of materials.' },
  { id: 'sca', label: 'SCA', description: 'Match SBOM components against OSV.dev.' },
  {
    id: 'secrets',
    label: 'Secrets',
    description: 'Regex + entropy scan for hard-coded credentials.',
  },
  { id: 'sast', label: 'SAST', description: 'Agent-driven static analysis.' },
  { id: 'container', label: 'Container', description: 'Agent-driven container hardening checks.' },
  { id: 'iac', label: 'IaC', description: 'Agent-driven IaC misconfiguration checks.' },
];

function applySelectionState(
  el: HTMLButtonElement | null,
  state: 'checked' | 'indeterminate' | 'unchecked'
): void {
  if (!el) return;
  if (state === 'indeterminate') {
    el.setAttribute('data-state', 'indeterminate');
    el.setAttribute('aria-checked', 'mixed');
  }
}

function TriStateCheckbox({
  state,
  onClick,
  ariaLabel,
  testId,
}: {
  state: 'checked' | 'indeterminate' | 'unchecked';
  onClick: () => void;
  ariaLabel: string;
  testId?: string;
}) {
  return (
    <Checkbox
      ref={(el): void => applySelectionState(el as HTMLButtonElement | null, state)}
      checked={state === 'checked' ? true : state === 'indeterminate' ? 'indeterminate' : false}
      onCheckedChange={onClick}
      aria-label={ariaLabel}
      {...(testId ? { 'data-testid': testId } : {})}
    />
  );
}

export function AspmScanDialog({
  defaultApplicationId,
  defaultRepositoryId,
  defaultRepositoryScope = 'all-branches',
  trigger,
  onScanned,
  open: openProp,
  onOpenChange,
  loadTargetsOverride,
  startBulkScanOverride,
}: AspmScanDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const [tree, setTree] = useState<ScanTargetTree | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enabledStages, setEnabledStages] = useState<Set<StageOption['id']>>(
    () => new Set(STAGE_OPTIONS.map((s) => s.id))
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<AspmBulkScanResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadTargets = loadTargetsOverride ?? listAspmScanTargets;
  const submit = startBulkScanOverride ?? startBulkScan;

  useEffect(() => {
    if (!open) return;
    setTreeLoading(true);
    setTreeError(null);
    loadTargets()
      .then((res) => {
        if (res.ok && res.tree) {
          setTree(res.tree);
        } else {
          setTreeError(res.error ?? 'Failed to load scan targets');
        }
      })
      .catch((err: unknown) => {
        setTreeError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setTreeLoading(false));
  }, [open, loadTargets]);

  // Apply default selection once the tree has loaded.
  useEffect(() => {
    if (!tree) return;
    if (selected.size > 0) return;
    const next = new Set<string>();
    if (defaultRepositoryId) {
      const repo = tree.repositories.find((r) => r.repositoryId === defaultRepositoryId);
      if (repo) {
        const ids =
          defaultRepositoryScope === 'main-only'
            ? applicationLeafIdsForRepository(repo)
            : leafIdsForRepository(repo);
        for (const id of ids) next.add(id);
      }
    }
    if (defaultApplicationId) next.add(appSelectionId(defaultApplicationId));
    if (next.size > 0) setSelected(next);
  }, [tree, defaultApplicationId, defaultRepositoryId, defaultRepositoryScope, selected.size]);

  const reset = useCallback((): void => {
    setSubmitError(null);
    setSubmitResult(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean): void => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
      if (!next) {
        reset();
        setSelected(new Set());
      }
    },
    [isControlled, onOpenChange, reset]
  );

  const toggleStage = useCallback((id: StageOption['id']): void => {
    setEnabledStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkTargets = useMemo(
    () => (tree ? computeBulkTargets(tree, selected) : []),
    [tree, selected]
  );

  const allLeafIds = useMemo<string[]>(() => {
    if (!tree) return [];
    return tree.repositories.flatMap(leafIdsForRepository);
  }, [tree]);

  const masterState = useMemo<'checked' | 'indeterminate' | 'unchecked'>(() => {
    if (allLeafIds.length === 0) return 'unchecked';
    const on = allLeafIds.filter((id) => selected.has(id)).length;
    if (on === 0) return 'unchecked';
    if (on === allLeafIds.length) return 'checked';
    return 'indeterminate';
  }, [allLeafIds, selected]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      setSubmitError(null);
      setSubmitResult(null);
      if (bulkTargets.length === 0) {
        setSubmitError('Pick at least one application, repository, or branch to scan.');
        return;
      }
      if (enabledStages.size === 0) {
        setSubmitError('Enable at least one stage.');
        return;
      }
      const formData = new FormData();
      formData.set('targets', JSON.stringify(bulkTargets));
      formData.set('triggeredBy', 'User');
      for (const stage of enabledStages) formData.append('stages', stage);
      startTransition(async () => {
        const result = await submit(formData);
        if (!result.ok && result.results.length === 0) {
          setSubmitError(result.error ?? 'Scan failed');
          return;
        }
        setSubmitResult(result);
        onScanned?.(result);
      });
    },
    [bulkTargets, enabledStages, submit, onScanned]
  );

  // In controlled mode the parent decides whether the dialog is open; the
  // trigger is optional (the parent may not need any UI to open the dialog).
  const renderTrigger = !isControlled || trigger !== undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {renderTrigger ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="default" size="sm" data-testid="aspm-scan-trigger">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Scan now
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-2xl" data-testid="aspm-scan-dialog">
        <DialogHeader>
          <DialogTitle>Scan</DialogTitle>
          <DialogDescription>
            Pick any combination of repositories, applications, or feature worktrees. Scans run
            sequentially.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="scan" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scan">Scan</TabsTrigger>
            <TabsTrigger value="upload">Upload existing report</TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="space-y-4 pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <section
                aria-label="Scan targets"
                className="border-border/60 max-h-72 space-y-2 overflow-y-auto rounded border p-2"
                data-testid="aspm-scan-target-tree"
              >
                {treeLoading ? (
                  <div className="text-muted-foreground flex items-center gap-2 p-2 text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading scan targets…
                  </div>
                ) : null}
                {treeError ? (
                  <p className="text-destructive flex items-center gap-1 p-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {treeError}
                  </p>
                ) : null}
                {!treeLoading && !treeError && tree?.repositories.length === 0 ? (
                  <p className="text-muted-foreground p-2 text-sm">
                    No applications inventoried yet — create one first.
                  </p>
                ) : null}

                {!treeLoading && !treeError && tree && tree.repositories.length > 0 ? (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <TriStateCheckbox
                        state={masterState}
                        onClick={(): void => setSelected(toggleLeaves(selected, allLeafIds))}
                        ariaLabel="Select all"
                        testId="aspm-scan-select-all"
                      />
                      <span>Select all ({allLeafIds.length})</span>
                    </label>

                    {tree.repositories.map((repo) => {
                      const repoState = selectionStateForRepository(selected, repo);
                      const repoLeafIds = leafIdsForRepository(repo);
                      return (
                        <div
                          key={`${repo.repositoryId ?? repo.repositoryPath}`}
                          className="space-y-1"
                        >
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <TriStateCheckbox
                              state={repoState}
                              onClick={(): void => setSelected(toggleLeaves(selected, repoLeafIds))}
                              ariaLabel={`Select all in ${repo.repositoryName}`}
                              testId={`aspm-scan-repo-${repo.repositoryId ?? repo.repositoryPath}`}
                            />
                            <FolderGit2 className="text-muted-foreground h-3.5 w-3.5" />
                            <span>{repo.repositoryName}</span>
                            <span className="text-muted-foreground text-xs">
                              ({repo.applications.length} app
                              {repo.applications.length === 1 ? '' : 's'})
                            </span>
                          </label>

                          <div className="ml-6 space-y-1">
                            {repo.applications.map((app) => {
                              const appState = selectionStateForApplication(selected, app);
                              const appSelfChecked = selected.has(
                                appSelectionId(app.applicationId)
                              );
                              return (
                                <div key={app.applicationId} className="space-y-1">
                                  <label className="flex items-center gap-2 text-sm">
                                    <TriStateCheckbox
                                      state={
                                        appSelfChecked && appState !== 'checked'
                                          ? 'indeterminate'
                                          : appState
                                      }
                                      onClick={(): void =>
                                        setSelected(
                                          toggleSingle(selected, appSelectionId(app.applicationId))
                                        )
                                      }
                                      ariaLabel={`Toggle ${app.applicationName}`}
                                      testId={`aspm-scan-app-${app.applicationId}`}
                                    />
                                    <LayoutGrid className="text-muted-foreground h-3.5 w-3.5" />
                                    <span>{app.applicationName}</span>
                                    {app.lastScannedAt ? (
                                      <span className="text-muted-foreground text-xs">
                                        last scanned {app.lastScannedAt.toString()}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs italic">
                                        never scanned
                                      </span>
                                    )}
                                  </label>
                                  {app.features.length > 0 ? (
                                    <div className="ml-6 space-y-1">
                                      {app.features.map((feature) => {
                                        const featChecked = selected.has(
                                          featureSelectionId(feature.featureId)
                                        );
                                        return (
                                          <label
                                            key={feature.featureId}
                                            className="text-muted-foreground flex items-center gap-2 text-xs"
                                          >
                                            <TriStateCheckbox
                                              state={featChecked ? 'checked' : 'unchecked'}
                                              onClick={(): void =>
                                                setSelected(
                                                  toggleSingle(
                                                    selected,
                                                    featureSelectionId(feature.featureId)
                                                  )
                                                )
                                              }
                                              ariaLabel={`Toggle feature ${feature.featureName}`}
                                              testId={`aspm-scan-feature-${feature.featureId}`}
                                            />
                                            <GitBranch className="h-3 w-3" />
                                            <span>
                                              {feature.featureName}{' '}
                                              <span className="font-mono">
                                                ({feature.featureBranch})
                                              </span>
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <fieldset className="space-y-2" data-testid="aspm-scan-stage-list">
                <legend className="text-sm font-medium">Stages</legend>
                {STAGE_OPTIONS.map((stage) => (
                  <label
                    key={stage.id}
                    className="border-border/60 flex items-start gap-2 rounded border p-2 text-sm"
                  >
                    <Checkbox
                      checked={enabledStages.has(stage.id)}
                      onCheckedChange={(): void => toggleStage(stage.id)}
                      aria-label={`Toggle ${stage.label}`}
                      data-testid={`aspm-scan-stage-${stage.id}`}
                    />
                    <span>
                      <span className="font-medium">{stage.label}</span>
                      <span className="text-muted-foreground ml-2">{stage.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {submitError ? (
                <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-center gap-2 rounded border p-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{submitError}</span>
                </div>
              ) : null}

              {submitResult ? (
                <div
                  className="rounded border border-emerald-400/40 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                  data-testid="aspm-scan-result"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    {submitResult.totals.succeeded}/{submitResult.totals.targets} scan
                    {submitResult.totals.targets === 1 ? '' : 's'} succeeded
                    {submitResult.totals.failed > 0
                      ? ` · ${submitResult.totals.failed} failed`
                      : ''}
                  </div>
                  <p className="mt-1 text-xs">
                    Inserted {submitResult.totals.findingsInserted} new finding(s).
                  </p>
                  {submitResult.totals.failed > 0 ? (
                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs">
                      {submitResult.results
                        .filter((r) => !r.ok)
                        .map((r) => (
                          <li key={`${r.applicationId}-${r.scanPath ?? ''}`}>
                            {r.label ?? r.applicationId}: {r.error}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={
                    isPending || treeLoading || enabledStages.size === 0 || bulkTargets.length === 0
                  }
                  data-testid="aspm-scan-submit"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning…
                    </>
                  ) : (
                    <>
                      <Bug className="mr-2 h-4 w-4" />
                      Run scan ({bulkTargets.length})
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="upload" className="pt-4">
            <p className="text-muted-foreground mb-3 text-sm">
              Bring an existing SARIF or CycloneDX report from your CI pipeline.
            </p>
            <AspmIngestDialog
              defaultApplicationId={defaultApplicationId ?? ''}
              trigger={
                <Button variant="outline" size="sm">
                  Open upload dialog
                </Button>
              }
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Re-export prefixes/types in case callers want them, but most consumers should
// import from `compute-bulk-targets.ts` directly.
export { APP_PREFIX, FEAT_PREFIX };
