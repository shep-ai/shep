import { useTranslation } from 'react-i18next';
import { GitPullRequestArrow, Waypoints } from 'lucide-react';
import { CoordinationAction } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';

/** The agent's coordination decision as the canvas carries it (spec 141). */
export interface CoordinationNoteData {
  action: CoordinationAction;
  rationale: string;
  /** Name of the overlapping feature; undefined once it has been deleted. */
  peerName?: string;
  overlappingPaths: string[];
  /** Epoch ms, so the value survives the server → client boundary. */
  decidedAt: number;
}

export interface CoordinationNoteProps {
  coordination: CoordinationNoteData;
  className?: string;
}

/** Why an agent made this feature wait for — or run alongside — an overlapping one. */
export function CoordinationNote({ coordination, className }: CoordinationNoteProps) {
  const { t } = useTranslation('web');
  const deferred = coordination.action === CoordinationAction.Defer;
  const peer = coordination.peerName ?? t('coordinationNote.anotherFeature');
  const Icon = deferred ? GitPullRequestArrow : Waypoints;

  return (
    <div
      data-testid="coordination-note"
      className={cn('flex flex-col gap-2 text-sm leading-snug', className)}
    >
      <div
        data-testid="coordination-note-headline"
        className="flex items-center gap-1.5 font-medium"
      >
        <Icon
          className={cn('size-3.5 shrink-0', deferred ? 'text-amber-500' : 'text-emerald-500')}
        />
        {deferred
          ? t('coordinationNote.waitsFor', { peer })
          : t('coordinationNote.runsAlongside', { peer })}
      </div>
      <p data-testid="coordination-note-rationale" className="text-foreground/80">
        {coordination.rationale}
      </p>
      {coordination.overlappingPaths.length > 0 ? (
        <div data-testid="coordination-note-paths" className="flex flex-col gap-0.5">
          <span className="text-foreground/40 text-[11px] font-medium tracking-wider uppercase">
            {t('coordinationNote.sharedFiles', { count: coordination.overlappingPaths.length })}
          </span>
          <ul className="flex flex-col gap-0.5">
            {coordination.overlappingPaths.map((path) => (
              <li key={path} className="truncate font-mono text-xs" title={path}>
                {path}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <span className="text-foreground/40 text-[11px]">
        {t('coordinationNote.decidedBy', {
          when: new Date(coordination.decidedAt).toLocaleString(),
        })}
      </span>
    </div>
  );
}
