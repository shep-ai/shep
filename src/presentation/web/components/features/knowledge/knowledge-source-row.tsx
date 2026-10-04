'use client';

/**
 * KnowledgeSourceRow — one Notion page tree or database kept as team
 * knowledge (spec 125): its title and kind, the product line it is limited
 * to, how many documents it holds, what its last sync did (or why it
 * failed), and pause, sync-now and remove controls.
 */

import { useTranslation } from 'react-i18next';
import { Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import type { KnowledgeSourceView } from '@shepai/core/application/use-cases/knowledge/manage-knowledge-sources.use-case';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  removeKnowledgeSource,
  setKnowledgeSourceEnabled,
  syncKnowledge,
} from '@/app/actions/manage-knowledge';
import type { RunTrackerAction } from '@/components/features/trackers/trackers-types';

export interface KnowledgeSourceRowProps {
  view: KnowledgeSourceView;
  /** Name of the product line the source is limited to, if any. */
  productLineName?: string;
  run: RunTrackerAction;
}

export function KnowledgeSourceRow({ view, productLineName, run }: KnowledgeSourceRowProps) {
  const { t } = useTranslation('web');
  const { source, documents } = view;

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
      <span className="min-w-0 truncate font-medium">{source.scopeTitle}</span>
      <Badge variant="outline" className="text-[10px]">
        {t(`knowledge.sources.kind.${source.scopeKind}`)}
      </Badge>
      <span className="text-muted-foreground">
        {productLineName
          ? t('knowledge.sources.productLine', { name: productLineName })
          : t('knowledge.sources.wholeSpace')}
      </span>
      <span className="text-muted-foreground">
        {t('knowledge.sources.documents', { count: documents })}
      </span>
      <span className="text-muted-foreground">
        {t('trackers.rules.everyShort', { minutes: source.intervalMinutes })}
      </span>
      {source.enabled ? null : (
        <Badge variant="secondary" className="text-[10px]">
          {t('trackers.rules.paused')}
        </Badge>
      )}
      <span className="min-w-0 flex-1 truncate">
        {source.lastError ? (
          <span className="text-destructive">{source.lastError}</span>
        ) : source.lastRun ? (
          <span className="text-muted-foreground">
            {t('knowledge.sources.summary', source.lastRun)}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('knowledge.sources.never')}</span>
        )}
      </span>
      <div className="flex gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          title={t(source.enabled ? 'trackers.rules.pause' : 'trackers.rules.resume')}
          aria-label={t(source.enabled ? 'trackers.rules.pause' : 'trackers.rules.resume')}
          onClick={() => run(() => setKnowledgeSourceEnabled(source.id, !source.enabled))}
          data-testid={`knowledge-source-toggle-${source.id}`}
        >
          {source.enabled ? <Pause /> : <Play />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={t('knowledge.sources.syncNow')}
          aria-label={t('knowledge.sources.syncNow')}
          onClick={() => run(() => syncKnowledge(source.id))}
          data-testid={`knowledge-source-sync-${source.id}`}
        >
          <RefreshCw />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={t('knowledge.sources.remove')}
          aria-label={t('knowledge.sources.remove')}
          onClick={() => run(() => removeKnowledgeSource(source.id))}
          data-testid={`knowledge-source-remove-${source.id}`}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
