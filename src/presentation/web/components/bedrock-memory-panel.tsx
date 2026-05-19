'use client';

/**
 * BedrockMemoryPanel — the bedrock visualization surface.
 *
 * Replaces the simple toggle on Application detail and is reused on
 * Repository and Feature detail pages. Goes beyond "enable / disable":
 * users can SEE the markdown memory bedrock has captured (files, sizes,
 * mtimes, preview snippets) and run lifecycle commands inline.
 *
 * The component is presentation-only — every server interaction goes
 * through injected action overrides so Storybook can render every
 * state (Default / Loading / Empty / Disabled / Error) without DI.
 */

import { useState, useTransition } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  RefreshCw,
  ShipIcon,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  BedrockHealth,
  BedrockMemorySnapshot,
  BedrockTargetKind,
} from '@shepai/core/domain/generated/output';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type BedrockEnableResult = { ok: true } | { ok: false; code: string; remediation: string };

export type BedrockLifecycleResult =
  | { ok: true; stdout: string }
  | { ok: false; code: string; remediation: string };

/**
 * Server actions injected by the page wrapping this panel. Stories
 * pass deterministic stand-ins so every state is renderable without a
 * real DI container.
 */
export interface BedrockMemoryPanelActions {
  enable: (kind: BedrockTargetKind, id: string) => Promise<BedrockEnableResult>;
  sync: (kind: BedrockTargetKind, id: string) => Promise<BedrockLifecycleResult>;
  ship: (kind: BedrockTargetKind, id: string) => Promise<BedrockLifecycleResult>;
  refreshSnapshot: (kind: BedrockTargetKind, id: string) => Promise<BedrockMemorySnapshot | null>;
}

export interface BedrockMemoryPanelProps {
  /** Which kind of entity owns this bedrock memory store. */
  targetKind: BedrockTargetKind;
  /** Owning entity id (Application.id / Repository.id / Feature.id). */
  targetId: string;
  /** Human-readable label shown in the card header (e.g. "my-app"). */
  targetLabel: string;
  /** Persisted enable flag, seeded from the entity. */
  initialEnabled: boolean;
  /** Initial memory snapshot (SSR-fetched). Null when the panel is loading. */
  initialSnapshot: BedrockMemorySnapshot | null;
  /** Initial doctor result, if known. Null hides the health row. */
  initialHealth: BedrockHealth | null;
  /** Server action overrides — Storybook injects stand-ins; pages pass real actions. */
  actions: BedrockMemoryPanelActions;
}

interface FailureState {
  code: string;
  remediation: string;
}

const PREVIEW_CLAMP = 160;

export function BedrockMemoryPanel({
  targetKind,
  targetId,
  targetLabel,
  initialEnabled,
  initialSnapshot,
  initialHealth,
  actions,
}: BedrockMemoryPanelProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [snapshot, setSnapshot] = useState<BedrockMemorySnapshot | null>(initialSnapshot);
  const health = initialHealth;
  const [failure, setFailure] = useState<FailureState | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleEnable() {
    setFailure(null);
    startTransition(async () => {
      const result = await actions.enable(targetKind, targetId);
      if (!result.ok) {
        setFailure({ code: result.code, remediation: result.remediation });
        toast.error(result.remediation);
        return;
      }
      setEnabled(true);
      const fresh = await actions.refreshSnapshot(targetKind, targetId);
      if (fresh) setSnapshot(fresh);
      toast.success('Bedrock memory enabled');
    });
  }

  function handleSync() {
    setFailure(null);
    startTransition(async () => {
      const result = await actions.sync(targetKind, targetId);
      if (!result.ok) {
        setFailure({ code: result.code, remediation: result.remediation });
        toast.error(result.remediation);
        return;
      }
      const fresh = await actions.refreshSnapshot(targetKind, targetId);
      if (fresh) setSnapshot(fresh);
      toast.success('Bedrock memory synced');
    });
  }

  function handleShip() {
    setFailure(null);
    startTransition(async () => {
      const result = await actions.ship(targetKind, targetId);
      if (!result.ok) {
        setFailure({ code: result.code, remediation: result.remediation });
        toast.error(result.remediation);
        return;
      }
      const fresh = await actions.refreshSnapshot(targetKind, targetId);
      if (fresh) setSnapshot(fresh);
      toast.success('Bedrock memory shipped');
    });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Card
        data-testid="bedrock-memory-panel"
        data-target-kind={targetKind}
        data-enabled={enabled ? 'true' : 'false'}
        data-pending={isPending ? 'true' : 'false'}
        className="overflow-hidden"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Database className="text-muted-foreground size-4" />
            <span className="font-medium">Bedrock memory</span>
            <span className="text-muted-foreground text-xs font-normal">· {targetLabel}</span>
          </CardTitle>
          <StatusBadge enabled={enabled} snapshot={snapshot} />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Persistent markdown project memory for AI coding agents. Bedrock writes its memory store
            inside this {kindWord(targetKind)}&apos;s worktree and syncs it through git.
          </p>

          <HealthRow health={health} />

          {enabled ? (
            <MemoryFileList snapshot={snapshot} />
          ) : (
            <EmptyEnableState onEnable={handleEnable} disabled={isPending} />
          )}

          {enabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="bedrock-sync-button"
                onClick={handleSync}
                disabled={isPending}
                className="gap-1.5"
              >
                <RefreshCw className={cn('size-3.5', isPending && 'animate-spin')} />
                Sync
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="bedrock-ship-button"
                onClick={handleShip}
                disabled={isPending}
                className="gap-1.5"
              >
                <ShipIcon className="size-3.5" />
                Ship
              </Button>
              <span className="text-muted-foreground ml-auto text-[10px]">
                {snapshot?.present
                  ? `${snapshot.files.length} file${snapshot.files.length === 1 ? '' : 's'} · ${formatBytes(
                      snapshot.totalBytes
                    )}`
                  : 'no .bedrock/ on disk yet'}
              </span>
            </div>
          ) : null}

          {failure ? (
            <div
              data-testid="bedrock-panel-failure"
              role="alert"
              className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-2 text-xs"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{failure.remediation}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function StatusBadge({
  enabled,
  snapshot,
}: {
  enabled: boolean;
  snapshot: BedrockMemorySnapshot | null;
}) {
  if (!enabled) {
    return (
      <Badge variant="outline" className="gap-1 text-[10px]">
        <XCircle className="size-3" />
        Disabled
      </Badge>
    );
  }
  if (snapshot?.present) {
    return (
      <Badge variant="default" className="gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-700">
        <CheckCircle2 className="size-3" />
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 text-[10px]">
      <Zap className="size-3" />
      Pending init
    </Badge>
  );
}

function HealthRow({ health }: { health: BedrockHealth | null }) {
  if (!health) return null;
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="bedrock-health-row">
      <HealthTile label="Python" status={health.python.status} detail={health.python.detail} />
      <HealthTile label="pipx" status={health.pipx.status} detail={health.pipx.detail} />
      <HealthTile label="bedrock" status={health.bedrock.status} detail={health.bedrock.detail} />
    </div>
  );
}

function HealthTile({
  label,
  status,
  detail,
}: {
  label: string;
  status: 'ok' | 'missing' | 'error';
  detail?: string;
}) {
  const color =
    status === 'ok'
      ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
      : status === 'missing'
        ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300'
        : 'border-destructive/40 bg-destructive/5 text-destructive';
  return (
    <div
      data-testid={`bedrock-health-${label.toLowerCase()}`}
      data-status={status}
      className={cn('rounded-md border px-2 py-1', color)}
    >
      <div className="text-[10px] font-medium tracking-wide uppercase opacity-80">{label}</div>
      <div className="truncate font-mono text-xs" title={detail ?? status}>
        {detail ?? status}
      </div>
    </div>
  );
}

function EmptyEnableState({ onEnable, disabled }: { onEnable: () => void; disabled: boolean }) {
  return (
    <div
      data-testid="bedrock-empty-state"
      className="bg-muted/30 flex flex-col items-start gap-2 rounded-md border border-dashed p-3"
    >
      <p className="text-muted-foreground text-xs">
        No memory store yet. Enabling bedrock will run <code>bedrock init</code> in this worktree
        and start capturing markdown memory.
      </p>
      <Button
        type="button"
        size="sm"
        onClick={onEnable}
        disabled={disabled}
        data-testid="bedrock-enable-button"
      >
        Enable bedrock memory
      </Button>
    </div>
  );
}

function MemoryFileList({ snapshot }: { snapshot: BedrockMemorySnapshot | null }) {
  if (!snapshot) {
    return (
      <div
        data-testid="bedrock-loading-state"
        className="text-muted-foreground rounded-md border border-dashed p-3 text-xs"
      >
        Loading memory snapshot…
      </div>
    );
  }
  if (!snapshot.present || snapshot.files.length === 0) {
    return (
      <div
        data-testid="bedrock-empty-snapshot"
        className="bg-muted/20 text-muted-foreground rounded-md border border-dashed p-3 text-xs"
      >
        Bedrock is enabled but <code>.bedrock/</code> is empty on disk. Try <strong>Sync</strong> to
        bootstrap the memory store.
      </div>
    );
  }
  return (
    <div data-testid="bedrock-file-list" className="rounded-md border">
      <ScrollArea className="max-h-64">
        <ul className="divide-y">
          {snapshot.files.map((file) => (
            <li
              key={file.path}
              data-testid={`bedrock-file-${file.path}`}
              className="hover:bg-muted/40 flex items-start gap-2 px-3 py-2 text-xs"
            >
              <FileText className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-mono text-xs font-medium">{file.path}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">
                    {formatBytes(file.sizeBytes)} · {relativeTime(file.modifiedAt)}
                  </span>
                </div>
                {file.preview ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 cursor-help text-[11px] leading-snug">
                        {clamp(file.preview, PREVIEW_CLAMP)}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md whitespace-pre-wrap">
                      <pre className="text-[11px] leading-snug">{file.preview}</pre>
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

function kindWord(kind: BedrockTargetKind): string {
  switch (kind) {
    case 'application':
      return 'application';
    case 'repository':
      return 'repository';
    case 'feature':
      return 'feature';
    default:
      return 'target';
  }
}

function formatBytes(value: bigint | number): string {
  const n = typeof value === 'bigint' ? Number(value) : value;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function relativeTime(value: Date | string | number): string {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
