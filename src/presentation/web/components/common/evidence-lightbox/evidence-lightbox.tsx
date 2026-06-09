/* eslint-disable @next/next/no-img-element -- Local evidence files require raw <img>, not next/image */
'use client';

import { useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from 'radix-ui';
import { ChevronLeft, ChevronRight, DownloadIcon } from 'lucide-react';
import type { MergeReviewEvidence } from '@/components/common/merge-review/merge-review-config';

/** Build the API URL for serving an evidence file (paths are pre-normalized to absolute). */
function buildEvidenceUrl(absolutePath: string): string {
  return `/api/evidence?path=${encodeURIComponent(absolutePath)}`;
}

export interface EvidenceLightboxProps {
  /** Array of image evidence items to display in the lightbox. */
  images: MergeReviewEvidence[];
  /** Whether the lightbox dialog is open. */
  open: boolean;
  /** Callback when the dialog open state changes. */
  onOpenChange: (open: boolean) => void;
  /** Index of the currently selected image. */
  selectedIndex: number;
  /** Callback when the selected image index changes. */
  onSelectedIndexChange: (index: number) => void;
}

const DIALOG_CONTENT_CLASS =
  'max-w-4xl gap-0 overflow-hidden border-0 p-0 [&>button:last-child]:!cursor-pointer [&>button:last-child]:!rounded-full [&>button:last-child]:!bg-black/70 [&>button:last-child]:!p-1.5 [&>button:last-child]:!text-white [&>button:last-child]:!opacity-100 [&>button:last-child]:!shadow-lg [&>button:last-child]:!backdrop-blur-md [&>button:last-child]:hover:!bg-black/90';

export function EvidenceLightbox({
  images,
  open,
  onOpenChange,
  selectedIndex,
  onSelectedIndexChange,
}: EvidenceLightboxProps) {
  const count = images.length;
  const current = images[selectedIndex];
  const hasMultiple = count > 1;

  const goNext = useCallback(() => {
    onSelectedIndexChange((selectedIndex + 1) % count);
  }, [selectedIndex, count, onSelectedIndexChange]);

  const goPrev = useCallback(() => {
    onSelectedIndexChange((selectedIndex - 1 + count) % count);
  }, [selectedIndex, count, onSelectedIndexChange]);

  useEffect(() => {
    if (!open || !hasMultiple) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') {
        e.stopPropagation();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        goPrev();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, hasMultiple, goNext, goPrev]);

  if (!current) return null;

  const imageUrl = buildEvidenceUrl(current.relativePath);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CONTENT_CLASS} aria-describedby={undefined}>
        <VisuallyHidden.Root>
          <DialogTitle>Evidence: {current.description}</DialogTitle>
        </VisuallyHidden.Root>

        <div className="relative bg-black/90">
          <img
            src={imageUrl}
            alt={current.description}
            className="h-auto max-h-[90vh] w-full object-contain"
          />
        </div>

        <div className="bg-background flex items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {hasMultiple ? (
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {selectedIndex + 1} / {count}
              </span>
            ) : null}
            <span className="text-foreground truncate text-sm">{current.description}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {hasMultiple ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1.5 transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1.5 transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <a
              href={imageUrl}
              download
              className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-1.5 transition-colors"
              aria-label="Download image"
            >
              <DownloadIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
