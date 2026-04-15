'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FolderGit2,
  Globe,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteApplication } from '@/app/actions/delete-application';
import { deriveAppLiveStatus } from '@/lib/derive-app-status';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { CloudDeploymentStatus, DeploymentState } from '@shepai/core/domain/generated/output';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';
import {
  CLOUD_PROVIDER_BRAND_HEX,
  CLOUD_PROVIDER_ICONS,
} from '@/components/features/application-page/cloud-provider-icons';

export interface ApplicationCardProps {
  application: ApplicationWithStatus;
  className?: string;
}

// ── URL truncation ───────────────────────────────────────────────────
// Show the END of the URL (the recognisable domain/TLD) rather than the
// start, because the start is usually a hash prefix like "4f5a0a51.".
// e.g. "4f5a0a51.landing-page-hero-pricing-60c94f.pages.dev"
//   → "4f5a0…pages.dev"
function truncateUrl(raw: string, max = 22): string {
  const url = raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (url.length <= max) return url;
  // Keep up to 5 chars from start + ellipsis + last (max-8) chars
  const tail = url.slice(-(max - 6));
  return `${url.slice(0, 5)}…${tail}`;
}

// ── Abstract dark preview patterns ───────────────────────────────────
// Four minimal, abstract SVG backgrounds rendered on a near-black card.
// Elements are white at very low opacity — ambient texture, not UI mockups.

function hashName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) | 0) >>> 0;
  }
  return h;
}

const D = 'rgba(255,255,255,0.13)'; // primary strokes
const DM = 'rgba(255,255,255,0.07)'; // mid
const DL = 'rgba(255,255,255,0.04)'; // faint fill

/** Dot grid — evenly spaced field of tiny circles */
function DotsSvg() {
  const cols = 16,
    rows = 8;
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <circle key={`${r}-${c}`} cx={10 + c * 20} cy={10 + r * 20} r="1.5" fill={DM} />
        ))
      )}
      {/* large ghost circle — off-center accent */}
      <circle cx="240" cy="56" r="52" fill="none" stroke={DL} strokeWidth="1" />
      <circle cx="240" cy="56" r="32" fill="none" stroke={D} strokeWidth="0.8" />
      {/* small accent cluster */}
      <circle cx="60" cy="112" r="14" fill="none" stroke={DM} strokeWidth="1" />
      <circle cx="60" cy="112" r="6" fill={DL} />
    </svg>
  );
}

/** Flow lines — soft undulating horizontals */
function WavesSvg() {
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden="true">
      {[24, 48, 72, 96, 120].map((y, i) => (
        <path
          key={`wave-${y}`}
          d={`M0,${y} C64,${y - 18 + i * 4} 128,${y + 18 - i * 3} 192,${y - 12 + i * 2} S288,${y + 14} 320,${y}`}
          fill="none"
          stroke={i === 2 ? D : DM}
          strokeWidth={i === 2 ? 1.5 : 1}
        />
      ))}
      {/* filled area under the brightest wave */}
      <path d="M0,72 C64,54 128,90 192,60 S288,86 320,72 L320,160 L0,160 Z" fill={DL} />
      {/* small accent circle top-right */}
      <circle cx="290" cy="30" r="18" fill="none" stroke={DM} strokeWidth="1" />
    </svg>
  );
}

/** Geometry — overlapping large arcs + a diamond */
function GeoSvg() {
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden="true">
      {/* large background arc */}
      <circle cx="160" cy="160" r="120" fill="none" stroke={DL} strokeWidth="40" />
      {/* two overlapping rings */}
      <circle cx="100" cy="60" r="70" fill="none" stroke={DM} strokeWidth="1" />
      <circle cx="220" cy="80" r="55" fill="none" stroke={D} strokeWidth="1" />
      {/* diamond */}
      <polygon points="160,18 196,60 160,102 124,60" fill="none" stroke={DM} strokeWidth="1" />
      {/* corner dots */}
      <circle cx="20" cy="20" r="2" fill={D} />
      <circle cx="300" cy="20" r="2" fill={D} />
      <circle cx="20" cy="140" r="2" fill={D} />
      <circle cx="300" cy="140" r="2" fill={D} />
    </svg>
  );
}

/** Grid + pulse — subtle square grid with a central radial burst */
function GridSvg() {
  const step = 32;
  const lines = [];
  for (let x = step; x < 320; x += step)
    lines.push(<line key={`v${x}`} x1={x} y1="0" x2={x} y2="160" stroke={DL} strokeWidth="1" />);
  for (let y = step; y < 160; y += step)
    lines.push(<line key={`h${y}`} x1="0" y1={y} x2="320" y2={y} stroke={DL} strokeWidth="1" />);
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden="true">
      {lines}
      {/* concentric radial rings from centre */}
      {[20, 40, 64, 90].map((r) => (
        <circle
          key={r}
          cx="160"
          cy="80"
          r={r}
          fill="none"
          stroke={r === 40 ? D : DM}
          strokeWidth="1"
        />
      ))}
      <circle cx="160" cy="80" r="4" fill={D} />
    </svg>
  );
}

const WIREFRAMES = [DotsSvg, WavesSvg, GeoSvg, GridSvg];

function MockPreview({ name }: { name: string }) {
  const Svg = WIREFRAMES[hashName(name) % WIREFRAMES.length]!;
  return <Svg />;
}

// ── Main card ────────────────────────────────────────────────────────

export function ApplicationCard({ application, className }: ApplicationCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const turnStatus = useTurnStatus(featureIdForApplication(application.id));

  const deploy = useDeployAction({
    targetId: application.id,
    targetType: 'application',
    repositoryPath: application.repositoryPath,
  });

  const effectiveDeploymentUrl = deploy.url;
  const live = deriveAppLiveStatus(
    application.status,
    turnStatus,
    !!effectiveDeploymentUrl,
    application.effectiveStatus
  );

  const cloudUrl = application.cloudDeploymentUrl ?? null;
  const cloudProvider = application.cloudDeploymentProvider ?? null;
  const CloudBrandIcon = cloudProvider ? CLOUD_PROVIDER_ICONS[cloudProvider] : null;
  const cloudBrandHex = cloudProvider ? CLOUD_PROVIDER_BRAND_HEX[cloudProvider] : undefined;
  const isCloudLive =
    application.cloudDeploymentStatus === CloudDeploymentStatus.Deployed && Boolean(cloudUrl);
  const isCloudUploading = application.cloudDeploymentStatus === CloudDeploymentStatus.Uploading;
  const isCloudFailed = application.cloudDeploymentStatus === CloudDeploymentStatus.Failed;

  const isBuilding = application.effectiveStatus === 'building';
  const isInterrupted = application.effectiveStatus === 'interrupted';
  const isFailed = application.effectiveStatus === 'failed';
  const isBooting = deploy.status === DeploymentState.Booting || deploy.deployLoading;
  const isLocalRunning = deploy.status === DeploymentState.Ready && Boolean(effectiveDeploymentUrl);

  // Resolve the URL to show in the header iframe. Prefer the local
  // dev server when it's running (it reflects uncommitted in-progress
  // changes), else fall back to the cloud deploy URL so a deployed
  // app shows its actual live site instead of an abstract placeholder.
  const previewUrl = isLocalRunning ? effectiveDeploymentUrl : isCloudLive ? cloudUrl : null;
  const hasLivePreview = Boolean(previewUrl);

  const navigate = () => router.push(`/application/${application.id}`);

  // Repository display name from path
  const repoName = application.repositoryPath.split(/[/\\]/).pop() ?? application.repositoryPath;

  return (
    <>
      <article
        data-testid="application-card"
        onClick={navigate}
        className={cn(
          // In dark mode `--color-card` resolves to `#0a0a0a`, which is the
          // same value as `--color-background` — so a plain `bg-card` card
          // has no contrast against the page. Lift the dark-mode surface
          // one step (`neutral-900` = `#171717`) and soften the border so
          // the card reads as an elevated tile instead of a hole in the
          // page. Light mode is unchanged. Corners are deliberately sharp
          // (`rounded-sm`) per the dashboard tile family — the placeholder
          // and new-application tiles both match.
          'group relative flex cursor-pointer flex-col overflow-hidden rounded-sm',
          'bg-card dark:bg-neutral-900',
          'border-border/60 border shadow-sm dark:border-white/10',
          'hover:border-border transition-all duration-200 hover:shadow-lg dark:hover:border-white/20 dark:hover:shadow-black/40',
          // min-h keeps all cards in a row visually aligned; flex-1 on
          // the context zone pushes the footer to the bottom.
          'min-h-[280px]',
          className
        )}
      >
        {/* ── Header visual ──────────────────────────────────── */}
        {/* Preference order:
             1. Live iframe preview (local dev server OR cloud deploy URL)
             2. Booting spinner while a local deploy is coming up
             3. Abstract dark SVG wireframe (ambient placeholder) */}
        <div className="relative overflow-hidden" style={{ height: 160 }}>
          {hasLivePreview ? (
            <div className="absolute inset-0 bg-white dark:bg-neutral-900">
              <iframe
                src={previewUrl!}
                title={`${application.name} preview`}
                className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
                style={{ width: '250%', height: '250%', transform: 'scale(0.4)' }}
                sandbox="allow-same-origin allow-scripts"
                loading="lazy"
              />
              {/* hover overlay — stop/open for LOCAL running; open-only for cloud */}
              <div
                className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                {isLocalRunning ? (
                  <button
                    type="button"
                    onClick={() => void deploy.stop()}
                    disabled={deploy.stopLoading}
                    className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-white/90 px-3 text-[11px] font-semibold text-neutral-900 hover:bg-red-50 hover:text-red-600"
                  >
                    {deploy.stopLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Stop
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => window.open(previewUrl!, '_blank', 'noopener,noreferrer')}
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-white/90 px-3 text-[11px] font-semibold text-neutral-900 hover:bg-white"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </button>
              </div>
            </div>
          ) : isBooting ? (
            <div className="absolute inset-0 bg-white dark:bg-neutral-900">
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  Starting…
                </span>
              </div>
            </div>
          ) : (
            // Ambient placeholder — no title overlay; name/description
            // always render in the body below so they stay consistent
            // across every card state. Stays dark in BOTH modes because
            // the MockPreview SVG strokes are white-at-low-opacity and
            // would be invisible on a light background. In dark mode we
            // lift it to `neutral-800` (one notch above the card body's
            // `neutral-900`), giving the header a distinct elevation tier.
            <div className="absolute inset-0 overflow-hidden bg-[#111827] dark:bg-neutral-800">
              <MockPreview name={application.name} />
            </div>
          )}

          {/* Status chip — top-left */}
          <div className="absolute top-2.5 left-2.5" onClick={(e) => e.stopPropagation()}>
            {isCloudLive ? (
              <span className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase backdrop-blur-sm">
                {CloudBrandIcon ? (
                  <CloudBrandIcon className="h-3 w-3" style={{ color: cloudBrandHex ?? '#fff' }} />
                ) : (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                )}
                Live
              </span>
            ) : isCloudUploading ? (
              <span className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white/80 uppercase backdrop-blur-sm">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Deploying
              </span>
            ) : isBuilding ? (
              <span className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white/80 uppercase backdrop-blur-sm">
                <Zap className="h-2.5 w-2.5" />
                Building
              </span>
            ) : live.pulse ? (
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                    live.dotClass
                  )}
                />
                <span className={cn('relative inline-flex h-2 w-2 rounded-full', live.dotClass)} />
              </span>
            ) : null}
          </div>

          {/* ⋯ overflow menu — top-right */}
          <div className="absolute top-2.5 right-2.5" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/30 text-white/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/50"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Context zone ───────────────────────────────────── */}
        {/* Name + description always rendered in the body so they stay
            consistent regardless of what the header is showing (live
            iframe, booting spinner, or ambient SVG placeholder). */}
        <div className="flex flex-1 flex-col gap-1.5 px-3.5 pt-3 pb-0">
          <div>
            <h3 className="text-foreground line-clamp-1 text-[14px] leading-tight font-semibold">
              {application.name}
            </h3>
            {application.description ? (
              <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px] leading-relaxed">
                {application.description}
              </p>
            ) : null}
          </div>

          {/* State-specific context — the live URL now lives in the
              footer so we skip rendering it here to avoid duplication. */}
          {isCloudUploading ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <Loader2 className="text-muted-foreground h-3 w-3 shrink-0 animate-spin" />
              <span className="text-muted-foreground text-[11px]">
                Deploying to {cloudProvider ?? 'cloud'}…
              </span>
            </div>
          ) : isCloudFailed ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <AlertTriangle className="text-destructive/70 h-3 w-3 shrink-0" />
              <span className="text-destructive/80 text-[11px]">Deployment failed</span>
            </div>
          ) : isBuilding ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <Zap className="text-muted-foreground h-3 w-3 shrink-0" />
              <span className="text-muted-foreground text-[11px]">Building with AI…</span>
              <div className="ml-auto flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="bg-muted-foreground/40 h-1 w-1 animate-bounce rounded-full"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : isInterrupted ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500/70" />
              <span className="text-muted-foreground text-[11px]">Build interrupted</span>
            </div>
          ) : isFailed ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <TriangleAlert className="text-destructive/70 h-3 w-3 shrink-0" />
              <span className="text-muted-foreground text-[11px]">Build failed</span>
            </div>
          ) : isCloudLive ? null : (
            <div className="flex items-center gap-1.5 py-0.5">
              <Globe className="text-muted-foreground/40 h-3 w-3 shrink-0" />
              <span className="text-muted-foreground/60 text-[11px]">Not deployed yet</span>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-3.5 pt-2 pb-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left cluster: repo dir + cloud URL — both compact, inline */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* Repo folder — clickable, opens local dir */}
            <button
              type="button"
              title={application.repositoryPath}
              onClick={async (e) => {
                e.stopPropagation();
                const { openDirectory } = await import('@/app/actions/open-directory');
                await openDirectory(application.repositoryPath);
              }}
              className="text-muted-foreground/70 hover:text-foreground inline-flex shrink-0 items-center gap-1 text-[10px] transition-colors"
            >
              <FolderGit2 className="h-3 w-3 shrink-0" />
              <span className="max-w-[80px] truncate">{repoName}</span>
            </button>

            {/* Cloud URL — only when deployed */}
            {cloudUrl ? (
              <a
                href={cloudUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={cloudUrl}
                className="text-muted-foreground/70 hover:text-foreground inline-flex min-w-0 items-center gap-1 text-[10px] transition-colors"
              >
                {CloudBrandIcon ? (
                  <CloudBrandIcon className="h-3 w-3 shrink-0" style={{ color: cloudBrandHex }} />
                ) : (
                  <Globe className="h-3 w-3 shrink-0" />
                )}
                <span className="font-mono">{truncateUrl(cloudUrl)}</span>
              </a>
            ) : null}
          </div>

          {/* Right: primary CTA */}
          {isBuilding || isCloudUploading ? (
            <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-[11px]">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isBuilding ? 'Building…' : 'Deploying…'}
            </span>
          ) : cloudUrl && isCloudLive ? (
            <a
              href={cloudUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-foreground text-background inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-opacity hover:opacity-80"
            >
              <ExternalLink className="h-3 w-3" />
              Open live
            </a>
          ) : isInterrupted ? (
            <button
              type="button"
              onClick={navigate}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-amber-500 px-3 text-[11px] font-semibold text-white transition-opacity hover:opacity-80"
            >
              <Play className="h-3 w-3 fill-current" />
              Continue
            </button>
          ) : isFailed ? (
            <button
              type="button"
              onClick={navigate}
              className="bg-destructive inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold text-white transition-opacity hover:opacity-80"
            >
              <ArrowRight className="h-3 w-3" />
              View error
            </button>
          ) : (
            <button
              type="button"
              onClick={navigate}
              className="bg-foreground text-background inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-opacity hover:opacity-80"
            >
              <ArrowRight className="h-3 w-3" />
              Open
            </button>
          )}
        </div>
      </article>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete application?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{application.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                setConfirmOpen(false);
                const result = await deleteApplication(application.id);
                if (result.error) {
                  toast.error('Failed to delete', { description: result.error });
                } else {
                  toast.success('Application deleted');
                  void queryClient.invalidateQueries({ queryKey: ['applications'] });
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
