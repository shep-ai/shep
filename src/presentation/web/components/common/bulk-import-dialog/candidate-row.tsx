'use client';

import { GitBranch, FolderOpen } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { ImportCandidate } from '@shepai/core/application/use-cases/repositories/discover-import-candidates.use-case';

export interface CandidateRowProps {
  candidate: ImportCandidate;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Failure message from a completed import attempt, if any */
  error?: string;
}

/**
 * One import candidate. Purely presentational — the annotations
 * (isGitRepository / alreadyTracked / previouslyRemoved) are computed by
 * DiscoverImportCandidatesUseCase, never derived here.
 */
export function CandidateRow({ candidate, checked, onCheckedChange, error }: CandidateRowProps) {
  const disabled = candidate.alreadyTracked;

  return (
    <label
      className={cn(
        'flex items-start gap-3 rounded-md px-2 py-2 text-sm',
        disabled ? 'opacity-60' : 'hover:bg-muted cursor-pointer'
      )}
      data-testid={`candidate-row-${candidate.name}`}
    >
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={`Select ${candidate.name}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {candidate.isGitRepository ? (
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          ) : (
            <FolderOpen className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate font-medium">{candidate.name}</span>
        </div>

        <span className="text-muted-foreground truncate text-xs">{candidate.path}</span>

        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {!candidate.isGitRepository ? (
            <span className="text-muted-foreground">not a git repository</span>
          ) : null}
          {candidate.alreadyTracked ? (
            <span className="text-muted-foreground">already tracked</span>
          ) : null}
          {candidate.previouslyRemoved ? (
            <span className="text-amber-600">previously removed — will be restored</span>
          ) : null}
          {error ? <span className="text-destructive">{error}</span> : null}
        </div>
      </div>
    </label>
  );
}
