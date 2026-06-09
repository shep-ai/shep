'use client';

import { useState, useMemo, useCallback } from 'react';
import { FileText, FilePlus, FileMinus, FileEdit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tree, Folder, File, type TreeViewElement } from '@/components/ui/file-tree';
import type { MergeReviewFileDiff, MergeReviewDiffHunk } from './merge-review-config';

const STATUS_CONFIG = {
  added: { icon: FilePlus, className: 'text-green-600' },
  modified: { icon: FileEdit, className: 'text-amber-600' },
  deleted: { icon: FileMinus, className: 'text-red-600' },
  renamed: { icon: FileEdit, className: 'text-blue-600' },
} as const;

/** Build a tree structure from flat file paths. */
export function buildFileTree(fileDiffs: MergeReviewFileDiff[]): TreeViewElement[] {
  const root: TreeViewElement[] = [];

  for (const diff of fileDiffs) {
    const parts = diff.path.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join('/');

      const existing = currentLevel.find(
        (el) => el.name === part && el.type === (isFile ? 'file' : 'folder')
      );

      if (existing) {
        if (!isFile && existing.children) {
          currentLevel = existing.children;
        }
      } else {
        const node: TreeViewElement = {
          id: pathSoFar,
          name: part,
          type: isFile ? 'file' : 'folder',
          ...(isFile ? {} : { children: [] }),
        };
        currentLevel.push(node);
        if (!isFile && node.children) {
          currentLevel = node.children;
        }
      }
    }
  }

  return collapseSingleChildFolders(root);
}

/** Collapse folders that contain only one child folder (e.g. src/components -> src/components). */
function collapseSingleChildFolders(elements: TreeViewElement[]): TreeViewElement[] {
  return elements.map((el) => {
    if (el.type === 'folder' && el.children) {
      const collapsed = collapseSingleChildFolders(el.children);
      if (collapsed.length === 1 && collapsed[0].type === 'folder' && collapsed[0].children) {
        return {
          ...collapsed[0],
          id: `${el.id}/${collapsed[0].name}`,
          name: `${el.name}/${collapsed[0].name}`,
          children: collapsed[0].children,
        };
      }
      return { ...el, children: collapsed };
    }
    return el;
  });
}

/** Count the total number of file descendants under an element. */
function countFiles(element: TreeViewElement): number {
  if (element.type === 'file') return 1;
  if (!element.children) return 0;
  return element.children.reduce((sum, child) => sum + countFiles(child), 0);
}

/** Get folder IDs for the first level of folders only (top-level). */
function getTopLevelFolderIds(elements: TreeViewElement[]): string[] {
  return elements.filter((el) => el.type === 'folder').map((el) => el.id);
}

function HunkView({ hunk }: { hunk: MergeReviewDiffHunk }) {
  return (
    <div className="border-border border-t first:border-t-0">
      <div className="bg-muted/50 text-muted-foreground px-3 py-1 font-mono text-[10px]">
        {hunk.header}
      </div>
      <div className="font-mono text-[11px] leading-[18px]">
        {hunk.lines.map((line) => (
          <div
            key={`${line.type}-${line.oldNumber ?? ''}-${line.newNumber ?? ''}`}
            className={cn(
              'flex',
              line.type === 'added' && 'bg-green-50 dark:bg-green-950/30',
              line.type === 'removed' && 'bg-red-50 dark:bg-red-950/30'
            )}
          >
            <span className="text-muted-foreground w-10 shrink-0 px-1 text-end text-[10px] select-none">
              {line.oldNumber ?? ''}
            </span>
            <span className="text-muted-foreground w-10 shrink-0 px-1 text-end text-[10px] select-none">
              {line.newNumber ?? ''}
            </span>
            <span
              className={cn(
                'w-4 shrink-0 text-center select-none',
                line.type === 'added' && 'text-green-700 dark:text-green-400',
                line.type === 'removed' && 'text-red-700 dark:text-red-400'
              )}
            >
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="min-w-0 flex-1 pe-2 break-all whitespace-pre-wrap">
              {line.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffFileIcon({ status }: { status: MergeReviewFileDiff['status'] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return <Icon className={cn('size-4 shrink-0', config.className)} />;
}

function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="ml-auto shrink-0 text-[10px]">
      {additions > 0 ? <span className="text-green-600">+{additions}</span> : null}
      {additions > 0 && deletions > 0 ? ' ' : null}
      {deletions > 0 ? <span className="text-red-600">-{deletions}</span> : null}
    </span>
  );
}

function FileTreeNode({
  element,
  diffMap,
  selectedFile,
  onSelectFile,
}: {
  element: TreeViewElement;
  diffMap: Map<string, MergeReviewFileDiff>;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  if (element.type === 'folder' && element.children) {
    const fileCount = countFiles(element);
    return (
      <Folder
        key={element.id}
        value={element.id}
        element={`${element.name} (${fileCount})`}
        className="text-muted-foreground"
      >
        {element.children.map((child) => (
          <FileTreeNode
            key={child.id}
            element={child}
            diffMap={diffMap}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        ))}
      </Folder>
    );
  }

  const diff = diffMap.get(element.id);
  const status = diff?.status ?? 'modified';

  return (
    <File
      key={element.id}
      value={element.id}
      fileIcon={<DiffFileIcon status={status} />}
      isSelect={selectedFile === element.id}
      handleSelect={onSelectFile}
      className="w-full"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate">{element.name}</span>
        {diff?.oldPath ? (
          <span className="text-muted-foreground truncate text-[10px]">
            &larr; {diff.oldPath.split('/').pop()}
          </span>
        ) : null}
        {diff ? <DiffStats additions={diff.additions} deletions={diff.deletions} /> : null}
      </span>
    </File>
  );
}

export interface DiffViewProps {
  fileDiffs: MergeReviewFileDiff[];
}

export function DiffView({ fileDiffs }: DiffViewProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const treeElements = useMemo(() => buildFileTree(fileDiffs), [fileDiffs]);
  const topLevelFolderIds = useMemo(() => getTopLevelFolderIds(treeElements), [treeElements]);

  const diffMap = useMemo(() => {
    const map = new Map<string, MergeReviewFileDiff>();
    for (const diff of fileDiffs) {
      map.set(diff.path, diff);
    }
    return map;
  }, [fileDiffs]);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile((prev) => (prev === path ? null : path));
  }, []);

  const selectedDiff = selectedFile ? diffMap.get(selectedFile) : null;

  if (fileDiffs.length === 0) return null;

  return (
    <div className="border-border rounded-lg border">
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <FileText className="text-muted-foreground h-4 w-4" />
          <span className="text-foreground text-xs font-semibold">Changed Files</span>
          <span className="text-muted-foreground text-[10px]">({fileDiffs.length})</span>
        </div>
      </div>
      <div className="border-border border-t">
        <div className="py-2">
          <Tree
            elements={treeElements}
            initialExpandedItems={topLevelFolderIds}
            indicator={true}
            sort="none"
            className="text-xs"
          >
            {treeElements.map((element) => (
              <FileTreeNode
                key={element.id}
                element={element}
                diffMap={diffMap}
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
              />
            ))}
          </Tree>
        </div>
        {selectedDiff && selectedDiff.hunks.length > 0 ? (
          <div className="border-border overflow-x-auto border-t">
            <div className="bg-muted/30 flex items-center gap-2 px-3 py-1.5">
              <DiffFileIcon status={selectedDiff.status} />
              <span className="text-foreground font-mono text-xs">{selectedDiff.path}</span>
              <DiffStats additions={selectedDiff.additions} deletions={selectedDiff.deletions} />
            </div>
            {selectedDiff.hunks.map((hunk) => (
              <HunkView key={hunk.header} hunk={hunk} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
