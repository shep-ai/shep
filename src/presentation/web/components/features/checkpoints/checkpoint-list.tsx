'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GitCheckpointKind, type GitCheckpoint } from '@shepai/core/domain/generated/output';
import { checkpointLabel } from '@shepai/core/domain/shared/git-checkpoint';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CheckpointListProps {
  checkpoints: GitCheckpoint[];
  /** Sequence of the highlighted step. */
  selectedSequence?: number | null;
  onSelect?: (checkpoint: GitCheckpoint) => void;
  onRestore?: (checkpoint: GitCheckpoint) => void;
  /** Core reported that a restore would be refused right now. */
  restoreDisabled?: boolean;
}

const KIND_LABEL_KEY: Partial<Record<GitCheckpointKind, string>> = {
  [GitCheckpointKind.Baseline]: 'checkpoints.kindBaseline',
  [GitCheckpointKind.PreRestore]: 'checkpoints.kindPreRestore',
};

/** The steps of a feature's run, oldest first, each selectable and restorable. */
export function CheckpointList({
  checkpoints,
  selectedSequence,
  onSelect,
  onRestore,
  restoreDisabled,
}: CheckpointListProps) {
  const { t } = useTranslation('web');
  return (
    <ul className="divide-border divide-y rounded-md border" data-testid="checkpoint-list">
      {checkpoints.map((checkpoint) => {
        const label = checkpointLabel(checkpoint);
        const kindKey = KIND_LABEL_KEY[checkpoint.kind];
        const selected = checkpoint.sequence === selectedSequence;
        return (
          <li
            key={checkpoint.id}
            className={cn('flex items-center gap-2 pr-2', selected && 'bg-muted')}
          >
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect?.(checkpoint)}
              className="hover:bg-muted/60 flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-xs"
            >
              <span className="font-mono font-medium">{label}</span>
              {kindKey ? (
                <span className="text-muted-foreground rounded border px-1 text-[10px] uppercase">
                  {t(kindKey)}
                </span>
              ) : null}
              <span className="text-muted-foreground ml-auto shrink-0">
                {t('checkpoints.files', { count: checkpoint.filesChanged })}{' '}
                <span className="text-green-600">+{checkpoint.additions}</span>{' '}
                <span className="text-red-600">-{checkpoint.deletions}</span>
              </span>
              <time
                className="text-muted-foreground hidden shrink-0 sm:inline"
                dateTime={new Date(checkpoint.createdAt).toISOString()}
              >
                {new Date(checkpoint.createdAt).toLocaleTimeString()}
              </time>
            </button>
            {onRestore ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                disabled={restoreDisabled}
                aria-label={t('checkpoints.restoreAria', { step: label })}
                title={t('checkpoints.restore')}
                onClick={() => onRestore(checkpoint)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
