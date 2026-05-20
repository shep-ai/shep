'use client';

import { useEffect, useState, useTransition } from 'react';
import { Bug, CheckCircle2, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { startScan, type AspmScanActionResult } from '@/app/actions/aspm-scan';
import {
  listAspmIngestApplications,
  type AspmIngestApplicationOption,
} from '@/app/actions/aspm-ingest';
import { AspmIngestDialog } from '@/components/features/aspm/aspm-ingest-dialog/aspm-ingest-dialog';

export interface AspmScanDialogProps {
  /** Pre-select this application when the dialog opens. */
  defaultApplicationId?: string;
  /** Trigger node — when omitted, renders a default "Scan now" button. */
  trigger?: React.ReactNode;
  /** Called after a successful scan so callers can refresh local UI. */
  onScanned?: (result: AspmScanActionResult) => void;
  /** Test/Storybook overrides. */
  loadApplicationsOverride?: typeof listAspmIngestApplications;
  startScanOverride?: typeof startScan;
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

export function AspmScanDialog({
  defaultApplicationId,
  trigger,
  onScanned,
  loadApplicationsOverride,
  startScanOverride,
}: AspmScanDialogProps) {
  const [open, setOpen] = useState(false);
  const [applications, setApplications] = useState<AspmIngestApplicationOption[]>([]);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [applicationId, setApplicationId] = useState<string>(defaultApplicationId ?? '');
  const [enabledStages, setEnabledStages] = useState<Set<StageOption['id']>>(
    () => new Set(STAGE_OPTIONS.map((s) => s.id))
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<AspmScanActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadApps = loadApplicationsOverride ?? listAspmIngestApplications;
  const submit = startScanOverride ?? startScan;

  useEffect(() => {
    if (!open) return;
    setAppsLoading(true);
    setAppsError(null);
    loadApps()
      .then((res) => {
        if (res.ok && res.applications) {
          setApplications(res.applications);
          if (!applicationId && res.applications.length > 0) {
            setApplicationId(defaultApplicationId ?? res.applications[0]!.id);
          }
        } else {
          setAppsError(res.error ?? 'Failed to load applications');
        }
      })
      .catch((err: unknown) => {
        setAppsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setAppsLoading(false));
  }, [open, loadApps, applicationId, defaultApplicationId]);

  const reset = () => {
    setSubmitError(null);
    setSubmitResult(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const toggleStage = (id: StageOption['id']) => {
    setEnabledStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitResult(null);
    if (!applicationId) {
      setSubmitError('Pick an application before scanning.');
      return;
    }
    if (enabledStages.size === 0) {
      setSubmitError('Enable at least one stage.');
      return;
    }
    const formData = new FormData();
    formData.set('applicationId', applicationId);
    formData.set('triggeredBy', 'User');
    for (const stage of enabledStages) {
      formData.append('stages', stage);
    }
    startTransition(async () => {
      const result = await submit(formData);
      if (!result.ok) {
        setSubmitError(result.error ?? 'Scan failed');
        return;
      }
      setSubmitResult(result);
      onScanned?.(result);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="default" size="sm" data-testid="aspm-scan-trigger">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Scan now
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl" data-testid="aspm-scan-dialog">
        <DialogHeader>
          <DialogTitle>Scan application</DialogTitle>
          <DialogDescription>
            Shep walks the local working tree and runs each enabled stage. Re-running on an
            unchanged tree adds zero new findings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="scan" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scan">Scan</TabsTrigger>
            <TabsTrigger value="upload">Upload existing report</TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="space-y-4 pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="aspm-scan-application">Application</Label>
                <Select
                  value={applicationId}
                  onValueChange={setApplicationId}
                  disabled={appsLoading || applications.length === 0}
                >
                  <SelectTrigger id="aspm-scan-application" data-testid="aspm-scan-app-select">
                    <SelectValue
                      placeholder={appsLoading ? 'Loading applications…' : 'Pick an application'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {applications.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {appsError ? (
                  <p className="text-destructive mt-1 flex items-center gap-1 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {appsError}
                  </p>
                ) : null}
              </div>

              <fieldset className="space-y-2" data-testid="aspm-scan-stage-list">
                <legend className="text-sm font-medium">Stages</legend>
                {STAGE_OPTIONS.map((stage) => (
                  <label
                    key={stage.id}
                    className="border-border/60 flex items-start gap-2 rounded border p-2 text-sm"
                  >
                    <Checkbox
                      checked={enabledStages.has(stage.id)}
                      onCheckedChange={() => toggleStage(stage.id)}
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

              {submitResult?.ok && submitResult.summary ? (
                <div className="rounded border border-emerald-400/40 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Scan {submitResult.summary.status}
                  </div>
                  <p className="mt-1 text-xs">
                    Inserted {submitResult.summary.findingsInserted} new finding(s) across{' '}
                    {submitResult.summary.stages.length} stage(s).
                  </p>
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isPending || appsLoading || enabledStages.size === 0}
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
                      Run scan
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
              defaultApplicationId={applicationId}
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
