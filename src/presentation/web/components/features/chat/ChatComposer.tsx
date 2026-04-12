'use client';

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { SendHorizontal, CircleStop, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AttachmentChip } from '@/components/common/attachment-chip';
import type { FormAttachment } from '@/hooks/use-attachments';

export interface ChatComposerProps {
  attachments: FormAttachment[];
  isDragOver: boolean;
  uploadError: string | null;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onRemoveAttachment: (id: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  onPickFiles: () => void;
  /** Agent/model picker rendered in the controls row. */
  agentPicker?: React.ReactNode;
  /** When true, the composer is visually disabled and input is blocked. */
  disabled?: boolean;
}

export function ChatComposer({
  attachments,
  isDragOver,
  uploadError,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onPaste,
  onRemoveAttachment,
  onNotesChange,
  onPickFiles,
  agentPicker,
  disabled,
}: ChatComposerProps) {
  const { t } = useTranslation('web');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <ComposerPrimitive.Root
      className={cn('shrink-0 border-t p-3', disabled && 'pointer-events-none opacity-50')}
    >
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'flex flex-col gap-1.5 rounded-md border-2 border-transparent p-1 transition-colors',
          isDragOver && 'border-primary/50 bg-primary/5'
        )}
      >
        <div
          ref={containerRef}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            'border-input flex flex-col overflow-hidden rounded-md border shadow-xs transition-[color,box-shadow]',
            isFocused && 'ring-ring/50 border-ring ring-[3px]'
          )}
        >
          {/* Textarea — 1 row default, expands to 3, then scrolls */}
          <ComposerPrimitive.Input
            rows={1}
            autoFocus
            placeholder={t('chat.writeMessage')}
            onPaste={onPaste}
            className="max-h-[4.5rem] min-h-0 resize-none rounded-none border-0 px-3 py-2.5 text-sm shadow-none focus:outline-none focus-visible:ring-0"
          />

          {/* Attachment chips — between textarea and controls bar */}
          {attachments.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
              {attachments.map((file) => (
                <AttachmentChip
                  key={file.id}
                  name={file.name}
                  size={file.size}
                  mimeType={file.mimeType}
                  path={file.path}
                  onRemove={() => onRemoveAttachment(file.id)}
                  loading={file.loading}
                  notes={file.notes}
                  onNotesChange={(notes) => onNotesChange(file.id, notes)}
                />
              ))}
            </div>
          ) : null}

          {/* Upload error */}
          {uploadError ? <p className="text-destructive px-3 pb-2 text-xs">{uploadError}</p> : null}

          {/* Controls bar — agent picker + status left, actions right */}
          <div className="border-input flex items-center gap-3 border-t px-3 py-1.5">
            {/* Agent/model picker */}
            {agentPicker}
            <div className="flex-1" />

            {/* Attach files */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onPickFiles}
                  aria-label={t('chat.attachFiles')}
                  className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('chat.attachFiles')}</TooltipContent>
            </Tooltip>

            {/* Send / Cancel */}
            <ChatComposerAction />
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

function ChatComposerAction() {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send
          className={cn(
            'bg-primary text-primary-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            'hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-30',
            'transition-colors'
          )}
        >
          <SendHorizontal className="size-3.5" />
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel
          className={cn(
            'bg-destructive/10 text-destructive inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            'hover:bg-destructive/20',
            'transition-colors'
          )}
        >
          <CircleStop className="size-3.5" />
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
}
