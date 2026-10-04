'use client';

/**
 * KnowledgeDocumentsPanel — the team knowledge agents can read, by space
 * (spec 125): each synced Notion page with a link back to it and the product
 * line it is limited to. Sources are managed on the Connections page.
 */

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { BookOpen, ExternalLink } from 'lucide-react';
import type { SpaceKnowledge } from '@shepai/core/application/use-cases/knowledge/list-knowledge.use-case';
import { Badge } from '@/components/ui/badge';

export interface KnowledgeDocumentsPanelProps {
  groups: SpaceKnowledge[];
  /** Product line names by id. */
  productLines: Record<string, string>;
}

export function KnowledgeDocumentsPanel({ groups, productLines }: KnowledgeDocumentsPanelProps) {
  const { t } = useTranslation('web');
  return (
    <section data-testid="knowledge-documents" className="mx-auto w-full max-w-5xl space-y-3 p-4">
      <header className="flex items-center gap-2">
        <BookOpen className="size-4" />
        <div>
          <h2 className="text-sm font-semibold">{t('knowledge.documents.title')}</h2>
          <p className="text-muted-foreground text-xs">{t('knowledge.documents.subtitle')}</p>
        </div>
      </header>
      {groups.length === 0 ? (
        <p data-testid="knowledge-empty" className="text-muted-foreground text-xs">
          {t('knowledge.documents.empty')}{' '}
          <Link href="/connections" className="underline">
            {t('knowledge.documents.connections')}
          </Link>
        </p>
      ) : (
        groups.map(({ space, documents }) => (
          <div
            key={space.id}
            data-testid={`knowledge-space-${space.id}`}
            className="bg-card rounded-lg border p-3"
          >
            <h3 className="mb-2 text-xs font-semibold">{space.name}</h3>
            <ul className="space-y-1">
              {documents.map((document) => (
                <li key={document.id} className="flex items-center gap-2 text-xs">
                  <a
                    href={document.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-1 truncate hover:underline"
                  >
                    {document.title}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                  {document.productLineId && productLines[document.productLineId] ? (
                    <Badge variant="outline" className="text-[10px]">
                      {productLines[document.productLineId]}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
