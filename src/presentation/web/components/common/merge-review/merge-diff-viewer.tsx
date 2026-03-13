'use client';

import { useState, useMemo, useCallback } from 'react';
import { FilePlus, FileMinus, FileEdit, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tree } from '@/components/ui/file-tree';
import type { TreeViewElement } from '@/components/ui/file-tree';
import { CodeBlock } from '@/components/ui/code-block';
import type { MergeReviewFileDiff, MergeReviewDiffHunk } from './merge-review-config';

export interface MergeDiffViewerProps {
  fileDiffs: MergeReviewFileDiff[];
  className?: string;
}

const STATUS_COLORS: Record<MergeReviewFileDiff['status'], string> = {
  added: 'text-green-600',
  modified: 'text-amber-600',
  deleted: 'text-red-600',
  renamed: 'text-blue-600',
};

const STATUS_ICONS: Record<MergeReviewFileDiff['status'], typeof FileText> = {
  added: FilePlus,
  modified: FileEdit,
  deleted: FileMinus,
  renamed: FileEdit,
};

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.json': 'json',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.sh': 'bash',
  '.bash': 'bash',
  '.sql': 'sql',
  '.xml': 'xml',
  '.svg': 'xml',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.toml': 'toml',
  '.env': 'bash',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.mts': 'typescript',
  '.cts': 'typescript',
};

function detectLanguage(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (EXTENSION_LANGUAGE_MAP[ext]) return EXTENSION_LANGUAGE_MAP[ext];

  const basename = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';

  return 'text';
}

function buildDiffCode(hunks: MergeReviewDiffHunk[]): {
  code: string;
  addedLines: number[];
  removedLines: number[];
} {
  const lines: string[] = [];
  const addedLines: number[] = [];
  const removedLines: number[] = [];
  let lineNum = 0;

  for (const hunk of hunks) {
    if (lineNum > 0) {
      lineNum++;
      lines.push(`── ${hunk.header} ──`);
    } else {
      lineNum++;
      lines.push(`── ${hunk.header} ──`);
    }

    for (const line of hunk.lines) {
      lineNum++;
      const prefix = line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  ';
      lines.push(`${prefix}${line.content}`);

      if (line.type === 'added') addedLines.push(lineNum);
      if (line.type === 'removed') removedLines.push(lineNum);
    }
  }

  return { code: lines.join('\n'), addedLines, removedLines };
}

function buildTreeElements(fileDiffs: MergeReviewFileDiff[]): TreeViewElement[] {
  const root = new Map<string, TreeViewElement>();

  for (const file of fileDiffs) {
    const parts = file.path.split('/');
    const fileName = parts.pop()!;
    let currentLevel = root;
    let parentElement: TreeViewElement | undefined;
    let pathSoFar = '';

    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      if (!currentLevel.has(pathSoFar)) {
        const folder: TreeViewElement = {
          id: pathSoFar,
          name: part,
          type: 'folder',
          isSelectable: false,
          children: [],
        };
        currentLevel.set(pathSoFar, folder);
        if (parentElement) {
          parentElement.children = parentElement.children ?? [];
          parentElement.children.push(folder);
        }
      }
      parentElement = currentLevel.get(pathSoFar)!;
      // Get/create next level map
      parentElement.children ??= [];
      const nextLevel = new Map<string, TreeViewElement>();
      for (const child of parentElement.children) {
        nextLevel.set(child.id, child);
      }
      currentLevel = nextLevel;
    }

    const StatusIcon = STATUS_ICONS[file.status];
    const fileElement: TreeViewElement = {
      id: file.path,
      name: fileName,
      type: 'file',
      isSelectable: true,
      icon: <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', STATUS_COLORS[file.status])} />,
      badge: (
        <span className="flex items-center gap-1 text-[10px]">
          {file.additions > 0 ? <span className="text-green-600">+{file.additions}</span> : null}
          {file.deletions > 0 ? <span className="text-red-600">-{file.deletions}</span> : null}
        </span>
      ),
    };

    if (parentElement) {
      parentElement.children = parentElement.children ?? [];
      // Only add if not already present
      if (!parentElement.children.find((c) => c.id === fileElement.id)) {
        parentElement.children.push(fileElement);
      }
    } else {
      root.set(file.path, fileElement);
    }
  }

  return Array.from(root.values());
}

function DiffCodeView({ file }: { file: MergeReviewFileDiff }) {
  const { code, addedLines, removedLines } = useMemo(() => buildDiffCode(file.hunks), [file.hunks]);
  const language = useMemo(() => detectLanguage(file.path), [file.path]);

  if (file.hunks.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
        No diff content available
      </div>
    );
  }

  return (
    <CodeBlock
      language={language}
      filename={file.path}
      code={code}
      addedLines={addedLines}
      removedLines={removedLines}
      className="h-full rounded-none"
    />
  );
}

export function MergeDiffViewer({ fileDiffs, className }: MergeDiffViewerProps) {
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(
    fileDiffs.length > 0 ? fileDiffs[0].path : undefined
  );

  const treeElements = useMemo(() => buildTreeElements(fileDiffs), [fileDiffs]);

  const selectedFile = useMemo(
    () => fileDiffs.find((f) => f.path === selectedFileId),
    [fileDiffs, selectedFileId]
  );

  const handleSelectChange = useCallback((id: string) => {
    setSelectedFileId(id);
  }, []);

  if (fileDiffs.length === 0) return null;

  return (
    <div
      data-testid="merge-diff-viewer"
      className={cn('border-border flex overflow-hidden rounded-lg border', className)}
    >
      {/* File tree sidebar */}
      <div className="border-border flex w-56 shrink-0 flex-col border-r">
        <div className="border-border flex items-center gap-2 border-b px-3 py-2">
          <FileText className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-foreground text-xs font-semibold">Files</span>
          <span className="text-muted-foreground text-[10px]">({fileDiffs.length})</span>
        </div>
        <Tree
          elements={treeElements}
          initialSelectedId={selectedFileId}
          onSelectChange={handleSelectChange}
          indicator={false}
          className="flex-1"
          data-testid="merge-diff-file-tree"
        />
      </div>

      {/* Code diff panel */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedFile ? (
          <DiffCodeView file={selectedFile} />
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
            Select a file to view changes
          </div>
        )}
      </div>
    </div>
  );
}
