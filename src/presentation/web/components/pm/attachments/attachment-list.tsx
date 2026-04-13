'use client';

import { useState, useCallback, useRef } from 'react';
import { Paperclip, Trash2, Download, Upload, FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PmAttachment } from '@shepai/core/domain/generated/output';
import { deleteAttachment } from '@/app/actions/manage-attachments';

export interface AttachmentListProps {
  workItemId: string;
  attachments: PmAttachment[];
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({
  workItemId,
  attachments: initialAttachments,
  className,
}: AttachmentListProps) {
  const [attachments, setAttachments] = useState<PmAttachment[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);

      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('workItemId', workItemId);

          const res = await fetch('/api/pm-attachments/upload', {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            const data = (await res.json()) as {
              id: string;
              filename: string;
              mimeType: string;
              fileSize: number;
              createdAt: string;
            };
            const newAttachment: PmAttachment = {
              id: data.id,
              workItemId,
              filename: data.filename,
              mimeType: data.mimeType,
              fileSize: data.fileSize,
              storagePath: '',
              createdAt: new Date(data.createdAt),
              updatedAt: new Date(data.createdAt),
              deletedAt: undefined,
            };
            setAttachments((prev) => [...prev, newAttachment]);
          }
        }
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [workItemId]
  );

  const handleDelete = useCallback(async (attachmentId: string) => {
    const result = await deleteAttachment(attachmentId);
    if (!result.error) {
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    }
  }, []);

  const handleDownload = useCallback((attachmentId: string) => {
    window.open(`/api/pm-attachments/download?id=${attachmentId}`, '_blank');
  }, []);

  return (
    <div data-testid="attachment-list" className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Paperclip className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-xs font-medium">
            Attachments {attachments.length > 0 ? `(${String(attachments.length)})` : ''}
          </span>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
            data-testid="file-input"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="upload-btn"
          >
            <Upload className="h-3 w-3" />
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>

      {attachments.length === 0 ? (
        <p className="text-muted-foreground text-[10px]">No attachments</p>
      ) : (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              data-testid={`attachment-${att.id}`}
              className="group hover:bg-accent/50 flex items-center gap-2 rounded-sm px-2 py-1 text-xs"
            >
              <FileIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">{att.filename}</span>
              <span className="text-muted-foreground text-[10px]">
                {formatFileSize(att.fileSize)}
              </span>
              <div className="hidden gap-0.5 group-hover:flex">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => handleDownload(att.id)}
                  title="Download"
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-5 w-5 p-0"
                  onClick={() => handleDelete(att.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
