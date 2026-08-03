'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  discoverImportCandidates,
  importLocalRepositories,
} from '@/app/actions/import-local-repositories';
import type { ImportCandidate } from '@shepai/core/application/use-cases/repositories/discover-import-candidates.use-case';
import { CandidateRow } from './candidate-row';

export interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent directory whose subfolders are offered as candidates */
  directoryPath: string;
  /** Called after an import attempt completes, with the number imported */
  onImportComplete?: (importedCount: number) => void;
}

/**
 * Bulk-import dialog: lists every subfolder of `directoryPath` and imports the
 * selected ones in a single action.
 *
 * Deliberately thin — candidate annotation, path normalization, dedupe, and
 * per-path outcomes all come from the core use cases via server actions.
 */
export function BulkImportDialog({
  open,
  onOpenChange,
  directoryPath,
  onImportComplete,
}: BulkImportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [failures, setFailures] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setFailures({});
    try {
      const result = await discoverImportCandidates({ directoryPath });
      if (result.error) {
        setError(result.error);
        setCandidates([]);
        return;
      }
      const found = result.candidates ?? [];
      setCandidates(found);
      // Pre-select the obvious wins: untracked git repositories.
      setSelected(
        new Set(found.filter((c) => c.isGitRepository && !c.alreadyTracked).map((c) => c.path))
      );
    } catch {
      setError('An unexpected error occurred while reading the folder');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [directoryPath]);

  useEffect(() => {
    if (open && directoryPath) void load();
  }, [open, directoryPath, load]);

  const selectableCandidates = candidates.filter((c) => !c.alreadyTracked);
  const allSelected =
    selectableCandidates.length > 0 && selectableCandidates.every((c) => selected.has(c.path));

  function toggle(path: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableCandidates.map((c) => c.path)));
  }

  async function handleImport() {
    setImporting(true);
    setError('');
    setFailures({});
    try {
      const result = await importLocalRepositories({ paths: [...selected] });
      if (result.error) {
        setError(result.error);
        return;
      }

      const failed = (result.results ?? []).filter((r) => !r.imported);
      if (failed.length > 0) {
        onImportComplete?.(result.importedCount ?? 0);
        // Refresh first — load() clears failures — then surface the per-path
        // errors inline rather than closing on a partial success.
        await load();
        setFailures(Object.fromEntries(failed.map((r) => [r.path, r.error ?? 'Import failed'])));
        return;
      }

      onImportComplete?.(result.importedCount ?? 0);
      onOpenChange(false);
    } catch {
      setError('An unexpected error occurred during import');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import repositories</DialogTitle>
          <DialogDescription>
            Subfolders of <span className="font-mono text-xs">{directoryPath}</span>. Pick the ones
            to track.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div
            className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm"
            data-testid="bulk-import-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading folder…
          </div>
        ) : error ? (
          <div
            className="text-destructive py-6 text-center text-sm"
            data-testid="bulk-import-error"
          >
            {error}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            No subfolders found in this directory.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {selected.size} of {selectableCandidates.length} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAll}
                disabled={selectableCandidates.length === 0}
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
            </div>

            <ScrollArea className="max-h-72 pe-3">
              <div className="flex flex-col">
                {candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.path}
                    candidate={candidate}
                    checked={selected.has(candidate.path)}
                    onCheckedChange={(checked) => toggle(candidate.path, checked)}
                    error={failures[candidate.path]}
                  />
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleImport()}
            disabled={importing || loading || selected.size === 0}
            data-testid="bulk-import-submit"
          >
            {importing ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            Import {selected.size > 0 ? selected.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
