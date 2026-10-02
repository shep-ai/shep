'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChunkVisibility } from '@shepai/core/domain/generated/output';
import type { RenderedChunkView } from '@shepai/core/application/use-cases/harness/render-chunk-view.use-case';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { renderHarnessChunk } from '@/app/actions/harness-queries';
import { VISIBILITY_LEVELS } from './harness-format';

export interface HarnessChunkViewerProps {
  chunkId: string | null;
  label?: string;
  initialLevel?: ChunkVisibility;
  onClose: () => void;
}

/** View a chunk at short / long / full, rendered from stored raw output (spec 119, F6). */
export function HarnessChunkViewer({
  chunkId,
  label,
  initialLevel = ChunkVisibility.Full,
  onClose,
}: HarnessChunkViewerProps) {
  const { t } = useTranslation('web');
  const [level, setLevel] = useState<ChunkVisibility>(initialLevel);
  const [view, setView] = useState<RenderedChunkView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chunkId) return;
    let cancelled = false;
    setError(null);
    void renderHarnessChunk(chunkId, level).then((r) => {
      if (cancelled) return;
      if (r.ok) setView(r.data);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [chunkId, level]);

  return (
    <Dialog open={chunkId !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl" data-testid="harness-chunk-viewer">
        <DialogHeader>
          <DialogTitle className="truncate text-sm">
            {label ?? view?.chunk.label ?? chunkId}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1">
          {VISIBILITY_LEVELS.map((v) => (
            <Button
              key={v}
              size="sm"
              variant={v === level ? 'default' : 'outline'}
              onClick={() => setLevel(v)}
            >
              {t(`harness.visibility.${v}`)}
            </Button>
          ))}
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {view?.redacted ? (
          <p className="text-xs text-amber-600">{t('harness.chunk.redacted')}</p>
        ) : null}
        <pre className="bg-muted max-h-[60vh] overflow-auto rounded p-3 text-[11px] whitespace-pre-wrap">
          {view?.content ?? ''}
        </pre>
        {view ? (
          <p className="text-muted-foreground text-[11px]">
            {view.rendererId}
            {view.truncated ? ` · ${t('harness.chunk.truncated')}` : ''} ·{' '}
            {t('harness.chunk.storedNote')}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
