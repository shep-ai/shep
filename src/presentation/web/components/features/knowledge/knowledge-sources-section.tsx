'use client';

/**
 * KnowledgeSourcesSection — a knowledge connection's sources and the form to
 * add one (spec 125). Takes the place of sync rules on a Notion connection.
 */

import { useTranslation } from 'react-i18next';
import type { KnowledgeSourceView } from '@shepai/core/application/use-cases/knowledge/manage-knowledge-sources.use-case';
import type { RunTrackerAction } from '@/components/features/trackers/trackers-types';
import { AddKnowledgeSourceForm } from './add-knowledge-source-form';
import { KnowledgeSourceRow } from './knowledge-source-row';

export interface KnowledgeSourcesSectionProps {
  connectionId: string;
  sources: KnowledgeSourceView[];
  /** Product lines of the connection's space. */
  productLines: { id: string; name: string }[];
  run: RunTrackerAction;
}

export function KnowledgeSourcesSection({
  connectionId,
  sources,
  productLines,
  run,
}: KnowledgeSourcesSectionProps) {
  const { t } = useTranslation('web');
  const lineNames = new Map(productLines.map((line) => [line.id, line.name]));
  return (
    <section className="space-y-2" data-testid="knowledge-sources">
      <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {t('knowledge.sources.title')}
      </h3>
      {sources.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('knowledge.sources.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {sources.map((view) => (
            <KnowledgeSourceRow
              key={view.source.id}
              view={view}
              {...(view.source.productLineId && lineNames.has(view.source.productLineId)
                ? { productLineName: lineNames.get(view.source.productLineId) }
                : {})}
              run={run}
            />
          ))}
        </ul>
      )}
      <AddKnowledgeSourceForm connectionId={connectionId} productLines={productLines} run={run} />
    </section>
  );
}
