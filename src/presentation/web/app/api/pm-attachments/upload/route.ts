import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolve } from '@/lib/server-container';
import type { UploadAttachmentUseCase } from '@shepai/core/application/use-cases/pm-attachments/upload-attachment.use-case';
import { getShepHomeDir } from '@shepai/core/infrastructure/services/filesystem/shep-directory.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.zip',
  '.tar',
  '.gz',
  '.log',
]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, '')
    .replace(/[^\w.\-() ]/g, '_')
    .replace(/^\./, '_');
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const workItemId = formData.get('workItemId') as string | null;

    if (!file || !workItemId) {
      return NextResponse.json(
        { error: 'Missing required fields: file, workItemId' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File "${file.name}" exceeds 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        },
        { status: 413 }
      );
    }

    const ext = getExtension(file.name);
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `File type "${ext}" is not allowed` }, { status: 400 });
    }

    const storageDir = join(getShepHomeDir(), 'attachments', 'pm', workItemId);
    await mkdir(storageDir, { recursive: true });

    const safeName = sanitizeFilename(file.name);
    const storagePath = join(storageDir, `${Date.now()}-${safeName}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    const useCase = resolve<UploadAttachmentUseCase>('UploadAttachmentUseCase');
    const result = await useCase.execute({
      workItemId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      storagePath,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      id: result.attachment.id,
      filename: result.attachment.filename,
      mimeType: result.attachment.mimeType,
      fileSize: result.attachment.fileSize,
      createdAt: result.attachment.createdAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
