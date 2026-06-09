'use client';

import { useState } from 'react';
import {
  ExternalLink,
  AlertTriangle,
  FileDiff,
  GitCommitHorizontal,
  GitBranch,
  ArrowRight,
  Camera,
  FileText,
  MonitorPlay,
  Terminal,
  Download,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { CiStatusBadge } from '@/components/common/ci-status-badge';
import { DrawerActionBar } from '@/components/common/drawer-action-bar';
import { DiffView } from './diff-view';
import type { MergeReviewProps, MergeReviewEvidence } from './merge-review-config';

const EVIDENCE_ICONS: Record<MergeReviewEvidence['type'], typeof Camera> = {
  Screenshot: Camera,
  Video: MonitorPlay,
  TestOutput: FileText,
  TerminalRecording: Terminal,
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);

function getExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot).toLowerCase() : '';
}

/** Build the API URL for serving an evidence file (paths are pre-normalized to absolute). */
function buildEvidenceUrl(absolutePath: string): string {
  return `/api/evidence?path=${encodeURIComponent(absolutePath)}`;
}

/**
 * Image preview with click-to-open-fullscreen behavior.
 *
 * The thumbnail is rendered as a `<button>` so it's keyboard-focusable; activation
 * opens a Dialog containing the same image scaled to fit the viewport. The Dialog's
 * built-in overlay click + ESC + close button all dismiss.
 */
function EvidenceImage({ url, description }: { url: string; description: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group ring-offset-background focus-visible:ring-ring block w-full cursor-zoom-in rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label={`Open ${description} full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={description}
          className="max-h-80 w-full rounded-md border object-contain transition-opacity group-hover:opacity-90"
          loading="lazy"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[90vh] w-[90vw] max-w-none flex-col gap-3 p-4 sm:rounded-lg">
          <DialogTitle className="pe-8 text-sm font-medium">{description}</DialogTitle>
          <div className="bg-muted/30 flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={description} className="max-h-full max-w-full object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EvidenceItem({ evidence }: { evidence: MergeReviewEvidence }) {
  const [expanded, setExpanded] = useState(true);
  const Icon = EVIDENCE_ICONS[evidence.type] ?? Camera;
  const ext = getExtension(evidence.relativePath);
  const url = buildEvidenceUrl(evidence.relativePath);
  const isImage = evidence.type === 'Screenshot' || IMAGE_EXTENSIONS.has(ext);
  const isVideo = evidence.type === 'Video' || VIDEO_EXTENSIONS.has(ext);
  const isText = evidence.type === 'TestOutput' || evidence.type === 'TerminalRecording';

  return (
    <li className="border-border rounded-md border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-start"
      >
        {expanded ? (
          <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
        )}
        <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-foreground text-xs font-medium">{evidence.description}</span>
          {evidence.taskRef ? (
            <span className="text-muted-foreground ms-1.5 text-[10px]">({evidence.taskRef})</span>
          ) : null}
        </div>
        {url ? (
          <a
            href={url}
            download
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 transition-colors"
            aria-label="Download"
          >
            <Download className="h-3 w-3" />
          </a>
        ) : null}
      </button>
      {expanded && url ? (
        <div className="border-border border-t px-3 py-2.5">
          {isImage ? (
            <EvidenceImage url={url} description={evidence.description} />
          ) : isVideo ? (
            <video
              src={url}
              controls
              className="max-h-80 w-full rounded-md border"
              preload="metadata"
            >
              <track kind="captions" />
            </video>
          ) : isText ? (
            <EvidenceTextPreview url={url} />
          ) : (
            <p className="text-muted-foreground truncate font-mono text-[10px]">
              {evidence.relativePath}
            </p>
          )}
        </div>
      ) : null}
      {expanded && !url ? (
        <div className="border-border border-t px-3 py-2.5">
          <p className="text-muted-foreground truncate font-mono text-[10px]">
            {evidence.relativePath}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function EvidenceTextPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('Failed'))))
      .then((text) => {
        // Limit to first 100 lines for preview
        const lines = text.split('\n');
        setContent(lines.length > 100 ? `${lines.slice(0, 100).join('\n')}\n...` : text);
      })
      .catch(() => setContent(null))
      .finally(() => setLoaded(true));

    return <div className="bg-muted/50 h-16 animate-pulse rounded-md" />;
  }

  if (!content) {
    return <p className="text-muted-foreground text-[10px]">Unable to load preview</p>;
  }

  return (
    <pre className="bg-muted/50 max-h-60 overflow-auto rounded-md p-3 font-mono text-[11px] leading-relaxed">
      {content}
    </pre>
  );
}

function EvidenceList({ evidence }: { evidence: MergeReviewEvidence[] }) {
  return (
    <div className="border-border rounded-lg border">
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <Camera className="text-muted-foreground h-4 w-4" />
          <span className="text-foreground text-xs font-semibold">Evidence</span>
          <Badge variant="secondary" className="text-[10px]">
            {evidence.length}
          </Badge>
        </div>
        <ul className="space-y-2">
          {evidence.map((e) => (
            <EvidenceItem key={`${e.type}-${e.relativePath}`} evidence={e} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function MergeReview({
  data,
  readOnly = false,
  onApprove,
  onReject,
  isProcessing = false,
  isRejecting = false,
  chatInput,
  onChatInputChange,
}: MergeReviewProps) {
  const { pr, diffSummary, fileDiffs, branch, warning, evidence, hideCiStatus } = data;
  const hasConflicts = pr?.mergeable === false;

  const handleApproveOrResolve =
    hasConflicts && onReject ? () => onReject('Resolve merge conflicts', []) : onApprove;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
          <div className="flex-1">
            <h2 className="text-foreground text-sm font-bold">
              {readOnly ? 'Merge History' : 'Merge Review'}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {readOnly
                ? 'This feature was merged. Review the pull request details and evidence below.'
                : pr
                  ? 'Review the pull request details and approve to merge.'
                  : 'Review the changes and approve to merge.'}
            </p>
          </div>
        </div>

        {/* Branch merge direction (GitHub-like) */}
        {branch ? (
          <div className="border-border rounded-lg border">
            <div className="flex items-center gap-2 px-4 py-3">
              <GitBranch className="text-muted-foreground h-4 w-4 shrink-0" />
              <Badge variant="secondary" className="font-mono text-[11px]">
                {branch.source}
              </Badge>
              <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <Badge variant="outline" className="font-mono text-[11px]">
                {branch.target}
              </Badge>
            </div>
          </div>
        ) : null}

        {/* PR metadata card */}
        {pr ? (
          <div className="border-border rounded-lg border">
            <div className="space-y-3 px-4 py-3">
              {/* PR number + link */}
              <div className="flex items-center justify-between">
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary flex items-center gap-1.5 text-sm font-semibold underline underline-offset-2"
                >
                  PR #{pr.number}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <Badge variant="outline" className="text-xs">
                  {pr.status}
                </Badge>
              </div>

              {/* Merge status */}
              {pr.mergeable === false ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs font-medium">Merge Status</span>
                  <Badge className="border-transparent bg-orange-50 text-orange-700 hover:bg-orange-50">
                    <AlertTriangle className="me-1 h-3.5 w-3.5" />
                    Conflicts
                  </Badge>
                </div>
              ) : null}

              {/* CI status */}
              {pr.ciStatus && hideCiStatus !== true ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs font-medium">CI Status</span>
                  <CiStatusBadge status={pr.ciStatus} />
                </div>
              ) : null}

              {/* Commit hash */}
              {pr.commitHash ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs font-medium">Commit</span>
                  <div className="flex items-center gap-1.5">
                    <GitCommitHorizontal className="text-muted-foreground h-3.5 w-3.5" />
                    <code className="bg-muted text-foreground rounded-md px-1.5 py-0.5 font-mono text-[11px]">
                      {pr.commitHash.slice(0, 7)}
                    </code>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Diff summary */}
        {diffSummary ? (
          <div className="border-border rounded-lg border">
            <div className="px-4 py-3">
              <div className="mb-3 flex items-center gap-2">
                <FileDiff className="text-muted-foreground h-4 w-4" />
                <span className="text-foreground text-xs font-semibold">Changes</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-foreground text-sm font-bold">
                    {diffSummary.filesChanged}
                  </div>
                  <div className="text-muted-foreground text-[10px]">files</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-green-600">+{diffSummary.additions}</div>
                  <div className="text-muted-foreground text-[10px]">additions</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-red-600">-{diffSummary.deletions}</div>
                  <div className="text-muted-foreground text-[10px]">deletions</div>
                </div>
                <div className="text-center">
                  <div className="text-foreground text-sm font-bold">{diffSummary.commitCount}</div>
                  <div className="text-muted-foreground text-[10px]">commits</div>
                </div>
              </div>
            </div>
          </div>
        ) : warning ? (
          <div className="border-border rounded-lg border">
            <div className="flex items-center gap-2 px-4 py-3">
              <AlertTriangle className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground text-xs">{warning}</span>
            </div>
          </div>
        ) : null}

        {/* Evidence */}
        {evidence && evidence.length > 0 ? <EvidenceList evidence={evidence} /> : null}

        {/* File diffs */}
        {fileDiffs && fileDiffs.length > 0 ? <DiffView fileDiffs={fileDiffs} /> : null}
      </div>

      {!readOnly && (
        <DrawerActionBar
          onReject={onReject}
          onApprove={handleApproveOrResolve}
          approveLabel={hasConflicts ? 'Resolve Conflicts' : 'Approve Merge'}
          approveVariant={hasConflicts ? 'warning' : 'default'}
          revisionPlaceholder="Ask AI to revise before merging..."
          isProcessing={isProcessing}
          isRejecting={isRejecting}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
        />
      )}
    </div>
  );
}
