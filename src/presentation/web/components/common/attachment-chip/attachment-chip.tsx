/* eslint-disable @next/next/no-img-element -- Local file preview requires raw <img>, not next/image */
'use client';

import { X, Loader2Icon, DownloadIcon, StickyNoteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { VisuallyHidden } from 'radix-ui';
import {
  formatFileSize,
  getFileIcon,
  getFileIconColor,
} from '@/components/common/attachment-card/attachment-card';

export interface AttachmentChipProps {
  name: string;
  size: number;
  mimeType: string;
  path: string;
  onRemove: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Optional notes attached to this image */
  notes?: string;
  /** Callback when user edits notes in the preview modal */
  onNotesChange?: (notes: string) => void;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp']);

function isImage(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTS.has(name.slice(dot).toLowerCase());
}

function previewUrl(path: string, mimeType: string): string {
  const params = new URLSearchParams({ path, mimeType });
  return `/api/attachments/preview?${params.toString()}`;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

export function AttachmentChip({
  name,
  size,
  mimeType,
  path,
  onRemove,
  loading = false,
  disabled = false,
  notes,
  onNotesChange,
}: AttachmentChipProps) {
  const ext = getExtension(name);
  const Icon = getFileIcon(ext);
  const iconColorClass = getFileIconColor(ext);
  const imageFile = isImage(name);

  if (loading) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-md border">
        <Loader2Icon className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (imageFile) {
    const thumbnail = (
      <button type="button" className="relative block cursor-pointer rounded-md">
        <img
          src={previewUrl(path, mimeType)}
          alt={name}
          title={name}
          className="h-12 w-12 rounded-md border object-cover transition-opacity hover:opacity-80"
        />
        {notes ? (
          <span className="ring-background absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm ring-2">
            <StickyNoteIcon className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </button>
    );

    return (
      <TooltipProvider delayDuration={200}>
        <Dialog>
          <Tooltip>
            <div className="group relative">
              <TooltipTrigger asChild>
                <DialogTrigger asChild>{thumbnail}</DialogTrigger>
              </TooltipTrigger>
              {!disabled && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white group-hover:flex"
                  aria-label={`Remove ${name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {notes ? (
              <TooltipContent side="top" sideOffset={10} className="z-[80] max-w-[220px]">
                <p className="line-clamp-5 text-xs leading-snug whitespace-pre-wrap">{notes}</p>
              </TooltipContent>
            ) : null}
          </Tooltip>
          <DialogContent className="max-w-3xl gap-0 overflow-hidden border-0 p-0 [&>button:last-child]:!cursor-pointer [&>button:last-child]:!rounded-full [&>button:last-child]:!bg-black/70 [&>button:last-child]:!p-1.5 [&>button:last-child]:!text-white [&>button:last-child]:!opacity-100 [&>button:last-child]:!shadow-lg [&>button:last-child]:!backdrop-blur-md [&>button:last-child]:hover:!bg-black/90">
            <VisuallyHidden.Root>
              <DialogTitle>Preview: {name}</DialogTitle>
            </VisuallyHidden.Root>
            <div className="relative bg-black/90">
              <img
                src={previewUrl(path, mimeType)}
                alt={name}
                className="h-auto max-h-[70vh] w-full object-contain"
              />
            </div>
            <div className="bg-background flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <span className="text-muted-foreground text-xs">{formatFileSize(size)}</span>
                </div>
                <a
                  href={previewUrl(path, mimeType)}
                  download={name}
                  className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-1.5 transition-colors"
                  aria-label={`Download ${name}`}
                >
                  <DownloadIcon className="h-4 w-4" />
                </a>
              </div>
              {onNotesChange ? (
                <div className="flex flex-col gap-1">
                  <Textarea
                    placeholder="Add notes about this image…"
                    value={notes ?? ''}
                    onChange={(e) => onNotesChange(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                    aria-label="Image notes"
                  />
                  {notes?.trim() ? (
                    <span className="text-muted-foreground text-xs">Auto-saved</span>
                  ) : null}
                </div>
              ) : notes ? (
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">{notes}</p>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    );
  }

  return (
    <div className="group relative flex items-center gap-2 rounded-full border py-1 ps-2 pe-3">
      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
          iconColorClass
        )}
      >
        <Icon className="h-3 w-3" />
      </div>
      <span className="max-w-[120px] truncate text-sm">{name}</span>
      <span className="text-muted-foreground text-xs">{formatFileSize(size)}</span>
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white group-hover:flex"
          aria-label={`Remove ${name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
