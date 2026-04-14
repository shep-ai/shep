'use client';

import { useCallback } from 'react';

import { Copy, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { openFolder } from '@/app/actions/open-folder';

import { GitStatusCluster } from './git-status-cluster';

/** Collapse a long absolute path to just its last segment. */
function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

export interface PathClusterProps {
  applicationId: string;
  repositoryPath: string;
}

export function PathCluster({ applicationId, repositoryPath }: PathClusterProps) {
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(repositoryPath);
      toast.success('Path copied', { description: repositoryPath });
    } catch {
      toast.error('Failed to copy path');
    }
  }, [repositoryPath]);

  const handleOpen = useCallback(async () => {
    const result = await openFolder(repositoryPath);
    if (!result.success) {
      toast.error('Could not open folder', { description: result.error });
    }
  }, [repositoryPath]);

  return (
    <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
      <span className="truncate font-mono text-[11px]" title={repositoryPath}>
        {shortPath(repositoryPath)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground h-5 w-5"
        onClick={handleCopy}
        aria-label="Copy path"
        title="Copy path"
      >
        <Copy className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground h-5 w-5"
        onClick={handleOpen}
        aria-label="Open in file manager"
        title="Open in file manager"
      >
        <FolderOpen className="h-3 w-3" />
      </Button>
      <span className="text-muted-foreground/40">·</span>
      <GitStatusCluster applicationId={applicationId} repositoryPath={repositoryPath} />
    </div>
  );
}
