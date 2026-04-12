/**
 * Thin fetch helpers for the IDE tab's API routes.
 *
 * Kept separate from components so the network boundary is obvious and
 * easy to mock in tests and Storybook.
 */

import type { FileTreeEntry, ReadFileResult } from './types';

export async function fetchFileTree(applicationId: string): Promise<FileTreeEntry> {
  const res = await fetch(`/api/applications/${applicationId}/files`, { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to load file tree (${res.status})`);
  }
  const data = (await res.json()) as { tree: FileTreeEntry };
  return data.tree;
}

export async function fetchFileContent(
  applicationId: string,
  path: string
): Promise<ReadFileResult> {
  const url = `/api/applications/${applicationId}/files/content?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to read file (${res.status})`);
  }
  return (await res.json()) as ReadFileResult;
}

export async function saveFileContent(
  applicationId: string,
  path: string,
  content: string
): Promise<void> {
  const res = await fetch(`/api/applications/${applicationId}/files/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to save file (${res.status})`);
  }
}
