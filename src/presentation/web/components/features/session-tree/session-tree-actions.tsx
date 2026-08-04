'use client';

import { useState } from 'react';
import { MoreHorizontal, Archive, ArchiveRestore, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { archiveSession, unarchiveSession, deleteSession } from '@/app/actions/session-tree';
import type { SessionTreeSession } from '@shepai/core/application/use-cases/agents/build-session-tree.use-case';

export interface SessionTreeActionsProps {
  session: SessionTreeSession;
  /** Called after a mutation so the tree can reload */
  onChanged?: () => void;
}

/**
 * Per-session action menu.
 *
 * Archive is one click and reversible. Delete is deliberately harder: it opens
 * a confirmation naming the transcript file, because it removes data from
 * ~/.claude or ~/.cursor that shep does not own and cannot restore.
 */
export function SessionTreeActions({ session, onChanged }: SessionTreeActionsProps) {
  const { t } = useTranslation('web');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<{ error?: string }>): Promise<boolean> {
    setBusy(true);
    setError('');
    const result = await action();
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return false;
    }
    onChanged?.();
    return true;
  }

  const identity = { sessionId: session.id, agentType: session.agentType };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hover:bg-muted rounded p-0.5"
            aria-label={t('sessionTree.sessionActions')}
            data-testid={`session-tree-actions-${session.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3 w-3" />
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          {session.archived ? (
            <DropdownMenuItem
              className="gap-2 text-xs"
              onSelect={(e) => {
                e.preventDefault();
                void run(() => unarchiveSession(identity));
              }}
              data-testid={`session-tree-unarchive-${session.id}`}
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              {t('sessionTree.unarchive')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="gap-2 text-xs"
              onSelect={(e) => {
                e.preventDefault();
                void run(() => archiveSession(identity));
              }}
              data-testid={`session-tree-archive-${session.id}`}
            >
              <Archive className="h-3.5 w-3.5" />
              {t('sessionTree.archive')}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            className="text-destructive focus:text-destructive gap-2 text-xs"
            onSelect={(e) => {
              // Never delete straight from the menu — confirm first.
              e.preventDefault();
              setConfirmOpen(true);
            }}
            data-testid={`session-tree-delete-${session.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('sessionTree.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('sessionTree.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('sessionTree.deleteConfirmDescription')}</DialogDescription>
          </DialogHeader>

          {session.filePath ? (
            <p
              className="bg-muted text-muted-foreground rounded p-2 font-mono text-[11px] break-all"
              data-testid="session-tree-delete-path"
            >
              {session.filePath}
            </p>
          ) : null}

          {session.adopted ? (
            <p className="text-muted-foreground text-xs">{t('sessionTree.deleteAdoptedNote')}</p>
          ) : null}

          {error ? <p className="text-destructive text-xs">{error}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              {t('sessionTree.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              data-testid="session-tree-delete-confirm"
              onClick={() => {
                void run(() => deleteSession(identity)).then((ok) => {
                  if (ok) setConfirmOpen(false);
                });
              }}
            >
              {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t('sessionTree.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
