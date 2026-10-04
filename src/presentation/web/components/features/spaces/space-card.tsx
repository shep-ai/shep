'use client';

/**
 * SpaceCard — one space: name, colour, default status and counts, its product
 * lines and rules, and the make-default and delete actions. The default space
 * can be neither re-defaulted nor deleted; the server refuses to delete a
 * space that still holds memory.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Star, Trash2 } from 'lucide-react';
import type { SpaceOverview } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { deleteSpace, setDefaultSpace } from '@/app/actions/manage-spaces';
import { EditSpaceForm } from './edit-space-form';
import { SpaceProductLines } from './space-product-lines';
import { SpaceRules } from './space-rules';
import type { RunSpaceAction } from './spaces-types';

export interface SpaceCardProps {
  overview: SpaceOverview;
  run: RunSpaceAction;
}

export function SpaceCard({ overview, run }: SpaceCardProps) {
  const { t } = useTranslation('web');
  const { space, productLines, rules, memoryCount, repositoryCount } = overview;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <article
      data-testid={`space-card-${space.slug}`}
      className="bg-card space-y-4 rounded-lg border p-4"
      style={space.color ? { borderInlineStartColor: space.color, borderInlineStartWidth: 4 } : {}}
    >
      {editing ? (
        <EditSpaceForm space={space} run={run} onDone={() => setEditing(false)} />
      ) : (
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{space.name}</h2>
              {space.isDefault ? (
                <Badge variant="secondary" className="text-[10px]">
                  {t('spaces.card.default')}
                </Badge>
              ) : null}
            </div>
            {space.description ? (
              <p className="text-muted-foreground mt-0.5 text-xs">{space.description}</p>
            ) : null}
            <p className="text-muted-foreground mt-1 text-[11px]">
              {t('spaces.card.counts', { repositories: repositoryCount, memory: memoryCount })}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('spaces.card.edit')}
              title={t('spaces.card.edit')}
              onClick={() => setEditing(true)}
              data-testid="space-edit"
            >
              <Pencil />
            </Button>
            {space.isDefault ? null : (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => run(() => setDefaultSpace(space.id))}
                  data-testid="space-make-default"
                >
                  <Star />
                  {t('spaces.card.makeDefault')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t('spaces.card.delete')}
                  title={t('spaces.card.delete')}
                  onClick={() => setConfirmDelete(true)}
                  data-testid="space-delete"
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </div>
        </header>
      )}

      <SpaceProductLines space={space} productLines={productLines} run={run} />
      <SpaceRules space={space} rules={rules} productLines={productLines} run={run} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('spaces.deleteDialog.title', { name: space.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('spaces.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('spaces.deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => run(() => deleteSpace(space.id))}
              data-testid="space-delete-confirm"
            >
              {t('spaces.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
