'use client';

import { useEffect, useState, useTransition } from 'react';
import { Upload, FileUp, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
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
import {
  ingestAspmDocument,
  listAspmIngestApplications,
  type AspmIngestActionResult,
  type AspmIngestApplicationOption,
  type AspmIngestSource,
} from '@/app/actions/aspm-ingest';

export interface AspmIngestDialogProps {
  /** Pre-select this application when the dialog opens (e.g. on the inventory page). */
  defaultApplicationId?: string;
  /** Trigger node — when omitted, renders a default outlined "Ingest data" button. */
  trigger?: React.ReactNode;
  /** Called after a successful ingest so callers can refresh local UI in addition to the server-side revalidate. */
  onIngested?: (result: AspmIngestActionResult) => void;
  /** Overrides used by Storybook to bypass the server-action fetch. */
  loadApplicationsOverride?: typeof listAspmIngestApplications;
  ingestOverride?: typeof ingestAspmDocument;
}

/**
 * Self-contained dialog for ingesting SARIF / CycloneDX SBOM documents into ASPM.
 *
 * Replaces the previous CLI-only `shep aspm ingest --sarif <file> --application <slug>`
 * workflow. Picks the application from the existing inventory, accepts a file (drag-drop
 * or browse), and routes through {@link ingestAspmDocument} which calls the same core
 * use case as the CLI — so empty states across the ASPM UI can now be populated
 * end-to-end from the web app.
 */
export function AspmIngestDialog({
  defaultApplicationId,
  trigger,
  onIngested,
  loadApplicationsOverride,
  ingestOverride,
}: AspmIngestDialogProps) {
  const [open, setOpen] = useState(false);
  const [applications, setApplications] = useState<AspmIngestApplicationOption[]>([]);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [applicationId, setApplicationId] = useState<string>(defaultApplicationId ?? '');
  const [source, setSource] = useState<AspmIngestSource>('sarif');
  const [file, setFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<AspmIngestActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadApps = loadApplicationsOverride ?? listAspmIngestApplications;
  const ingest = ingestOverride ?? ingestAspmDocument;

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
    setFile(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitResult(null);

    if (!applicationId) {
      setSubmitError('Pick the application this report belongs to');
      return;
    }
    if (!file) {
      setSubmitError('Pick a SARIF or SBOM file to upload');
      return;
    }

    const fd = new FormData();
    fd.set('applicationId', applicationId);
    fd.set('source', source);
    fd.set('file', file);
    const app = applications.find((a) => a.id === applicationId);
    if (app) fd.set('applicationName', app.name);

    startTransition(async () => {
      const result = await ingest(fd);
      setSubmitResult(result);
      if (!result.ok) {
        setSubmitError(result.error ?? 'Ingest failed');
        return;
      }
      onIngested?.(result);
    });
  };

  const summary = submitResult?.ok ? submitResult.summary : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" data-testid="aspm-ingest-open">
            <Upload className="h-4 w-4" aria-hidden />
            Ingest data
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ingest security findings</DialogTitle>
          <DialogDescription>
            Upload a SARIF v2.1.0 report (Semgrep, CodeQL, Trivy, …) or a CycloneDX 1.5+ SBOM.
            Re-uploading the same file is safe — duplicates are deduped on insert.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="flex flex-col gap-3" data-testid="aspm-ingest-success">
            <div className="border-border bg-muted/50 flex items-start gap-3 rounded-md border p-3">
              <CheckCircle2 className="text-success mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <div className="flex flex-col gap-1 text-sm">
                <div className="font-medium">
                  Ingested {summary.source.toUpperCase()}
                  {summary.toolName ? ` (${summary.toolName})` : ''}
                </div>
                <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt>Application</dt>
                  <dd className="text-foreground font-mono">{summary.applicationName}</dd>
                  <dt>New findings</dt>
                  <dd className="text-foreground font-mono">{summary.inserted}</dd>
                  <dt>Duplicates</dt>
                  <dd className="text-foreground font-mono">{summary.duplicates}</dd>
                  <dt>Total drafts</dt>
                  <dd className="text-foreground font-mono">{summary.total}</dd>
                  {summary.componentCount !== undefined ? (
                    <>
                      <dt>SBOM components</dt>
                      <dd className="text-foreground font-mono">{summary.componentCount}</dd>
                    </>
                  ) : null}
                  {summary.complianceLinksWritten !== undefined ? (
                    <>
                      <dt>Compliance links</dt>
                      <dd className="text-foreground font-mono">
                        {summary.complianceLinksWritten}
                      </dd>
                    </>
                  ) : null}
                  <dt>Duration</dt>
                  <dd className="text-foreground font-mono">{summary.durationMs} ms</dd>
                </dl>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Ingest another
              </Button>
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="aspm-ingest-application">Application</Label>
              {appsError ? (
                <p className="text-destructive text-xs" role="alert">
                  {appsError}
                </p>
              ) : appsLoading ? (
                <p className="text-muted-foreground text-xs">Loading applications…</p>
              ) : applications.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No applications yet — create one from the Applications page first.
                </p>
              ) : (
                <Select value={applicationId} onValueChange={setApplicationId}>
                  <SelectTrigger id="aspm-ingest-application" data-testid="aspm-ingest-application">
                    <SelectValue placeholder="Select an application" />
                  </SelectTrigger>
                  <SelectContent>
                    {applications.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Document type</legend>
              <div className="flex gap-2">
                {(['sarif', 'sbom'] as const).map((opt) => (
                  <label
                    key={opt}
                    className={[
                      'flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                      source === opt
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border hover:bg-accent/50',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="aspm-ingest-source"
                      value={opt}
                      checked={source === opt}
                      onChange={() => setSource(opt)}
                      className="sr-only"
                      data-testid={`aspm-ingest-source-${opt}`}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {opt === 'sarif' ? 'SARIF v2.1.0' : 'CycloneDX SBOM'}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {opt === 'sarif'
                          ? 'Semgrep, CodeQL, Trivy, Snyk, …'
                          : 'Dependency findings (1.5+)'}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="aspm-ingest-file">File</Label>
              <label
                htmlFor="aspm-ingest-file"
                className="border-border hover:border-primary/50 flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-3 text-sm transition-colors"
              >
                <FileUp className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {file ? file.name : 'Choose a .sarif, .json, or .xml file'}
                </span>
                {file ? (
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                ) : null}
              </label>
              <input
                id="aspm-ingest-file"
                type="file"
                accept=".sarif,.json,.xml"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="aspm-ingest-file"
              />
            </div>

            {submitError ? (
              <div
                className="border-destructive/50 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-2.5 text-xs"
                role="alert"
                data-testid="aspm-ingest-error"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{submitError}</span>
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !applicationId || !file}
                data-testid="aspm-ingest-submit"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Ingesting…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" aria-hidden />
                    Ingest
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
