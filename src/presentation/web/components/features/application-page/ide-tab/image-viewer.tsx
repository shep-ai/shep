/**
 * ImageViewer
 *
 * Full-featured image preview for the IDE tab. Built on
 * `react-zoom-pan-pinch` so it ships with:
 *
 *   - Wheel / pinch zoom
 *   - Click-and-drag pan
 *   - Zoom-to-cursor
 *
 * On top of that, this component layers a toolbar with:
 *
 *   - Zoom in / out buttons
 *   - Fit to screen, 1:1 actual size, reset
 *   - Rotate 90° CW / CCW
 *   - Horizontal / vertical flip
 *   - Background toggle (checkerboard → black → white → transparent)
 *   - Copy image URL + open in new tab + download
 *   - Live "Nx · 123 × 456 · 4.2 KB" info readout
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import {
  Download,
  ExternalLink,
  FlipHorizontal2,
  FlipVertical2,
  Link as LinkIcon,
  Maximize2,
  Minus,
  Monitor,
  Plus,
  RotateCcw,
  RotateCw,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useResolvedTheme } from './use-resolved-theme';

export interface ImageViewerProps {
  applicationId: string;
  /** POSIX-style path of the image relative to the application root. */
  path: string;
}

type BackgroundMode = 'checkered' | 'black' | 'white' | 'transparent';

/**
 * Build a theme-aware background-style map. In light mode the checkerboard
 * fades to soft grey on white; in dark mode it sits on the Monaco vs-dark
 * backdrop so images feel continuous with the editor.
 */
function makeBackgroundStyles(isDark: boolean): Record<BackgroundMode, React.CSSProperties> {
  const canvasBg = isDark ? '#1e1e1e' : '#ffffff';
  const checkerSquare = isDark ? '#2a2a2a' : '#e5e7eb';
  return {
    checkered: {
      backgroundImage: `linear-gradient(45deg, ${checkerSquare} 25%, transparent 25%), linear-gradient(-45deg, ${checkerSquare} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${checkerSquare} 75%), linear-gradient(-45deg, transparent 75%, ${checkerSquare} 75%)`,
      backgroundSize: '16px 16px',
      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
      backgroundColor: canvasBg,
    },
    black: { backgroundColor: '#000000' },
    white: { backgroundColor: '#ffffff' },
    transparent: { backgroundColor: canvasBg },
  };
}

const BACKGROUND_CYCLE: BackgroundMode[] = ['checkered', 'black', 'white', 'transparent'];

function formatBytes(bytes: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

export function ImageViewer({ applicationId, path }: ImageViewerProps) {
  const src = `/api/applications/${applicationId}/files/raw?path=${encodeURIComponent(path)}`;

  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';
  const backgroundStyles = useMemo(() => makeBackgroundStyles(isDark), [isDark]);
  const rootBgClass = isDark ? 'bg-[#1e1e1e]' : 'bg-[#ffffff]';

  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [bgMode, setBgMode] = useState<BackgroundMode>('checkered');
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset all transforms whenever the path changes so switching images in
  // the same tab slot starts fresh instead of inheriting a prior zoom.
  useEffect(() => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setScale(1);
    setDimensions(null);
    setBytes(null);
    setError(null);
    transformRef.current?.resetTransform?.();
  }, [path]);

  // Fetch the bytes once so we can display a size readout without
  // re-downloading (the browser also caches the <img> request).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src, { cache: 'no-store' });
        if (!res.ok) {
          setError(`Failed to load image (${res.status})`);
          return;
        }
        const buf = await res.arrayBuffer();
        if (!cancelled) setBytes(buf.byteLength);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  const cycleBackground = () => {
    setBgMode((prev) => {
      const idx = BACKGROUND_CYCLE.indexOf(prev);
      return BACKGROUND_CYCLE[(idx + 1) % BACKGROUND_CYCLE.length];
    });
  };

  const rotateCw = () => setRotation((r) => (r + 90) % 360);
  const rotateCcw = () => setRotation((r) => (r + 270) % 360);

  const copyUrl = async () => {
    try {
      const absolute = new URL(src, window.location.origin).toString();
      await navigator.clipboard.writeText(absolute);
      toast.success('Image URL copied');
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  if (error) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center text-xs text-red-500 dark:text-red-400',
          rootBgClass
        )}
      >
        {error}
      </div>
    );
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', rootBgClass)}>
      {/* Toolbar (rendered first so it sits above the canvas) */}
      <Toolbar
        scale={scale}
        dimensions={dimensions}
        bytes={bytes}
        bgMode={bgMode}
        flipH={flipH}
        flipV={flipV}
        onZoomIn={() => transformRef.current?.zoomIn?.(0.25)}
        onZoomOut={() => transformRef.current?.zoomOut?.(0.25)}
        onReset={() => transformRef.current?.resetTransform?.()}
        onFit={() => transformRef.current?.centerView?.(1)}
        onActualSize={() => transformRef.current?.setTransform?.(0, 0, 1)}
        onRotateCcw={rotateCcw}
        onRotateCw={rotateCw}
        onFlipH={() => setFlipH((v) => !v)}
        onFlipV={() => setFlipV((v) => !v)}
        onCycleBackground={cycleBackground}
        onCopyUrl={copyUrl}
        onOpenInNewTab={() => window.open(src, '_blank', 'noopener,noreferrer')}
        downloadHref={src}
        downloadName={basename(path)}
      />

      {/* Canvas */}
      <div className="relative min-h-0 flex-1 overflow-hidden" style={backgroundStyles[bgMode]}>
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={0.1}
          maxScale={40}
          centerOnInit
          // Wheel zoom: tiny per-tick delta so trackpads don't launch into orbit.
          // `step` is fraction-of-current-scale per wheel event; 0.05 ≈ 5%.
          wheel={{ step: 0.05 }}
          doubleClick={{ mode: 'reset' }}
          pinch={{ step: 2 }}
          onTransform={(_ref, state) => setScale(state.scale)}
        >
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{ width: '100%', height: '100%' }}
          >
            <div className="flex h-full w-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={path}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                style={{
                  transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                  transformOrigin: 'center',
                  maxWidth: '90%',
                  maxHeight: '90%',
                  objectFit: 'contain',
                  imageRendering: scale >= 4 ? 'pixelated' : 'auto',
                  transition: 'transform 120ms ease',
                }}
              />
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                             */
/* ------------------------------------------------------------------ */

interface ToolbarProps {
  scale: number;
  dimensions: { w: number; h: number } | null;
  bytes: number | null;
  bgMode: BackgroundMode;
  flipH: boolean;
  flipV: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  onActualSize: () => void;
  onRotateCcw: () => void;
  onRotateCw: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onCycleBackground: () => void;
  onCopyUrl: () => void;
  onOpenInNewTab: () => void;
  downloadHref: string;
  downloadName: string;
}

function Toolbar({
  scale,
  dimensions,
  bytes,
  bgMode,
  flipH,
  flipV,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  onActualSize,
  onRotateCcw,
  onRotateCw,
  onFlipH,
  onFlipV,
  onCycleBackground,
  onCopyUrl,
  onOpenInNewTab,
  downloadHref,
  downloadName,
}: ToolbarProps) {
  return (
    <div className="border-border bg-background/95 text-muted-foreground flex h-9 shrink-0 items-center gap-0.5 border-b px-2 text-[11px]">
      <ToolButton label="Zoom out" onClick={onZoomOut} icon={<Minus className="h-3.5 w-3.5" />} />
      <ToolButton label="Zoom in" onClick={onZoomIn} icon={<Plus className="h-3.5 w-3.5" />} />
      <button
        type="button"
        onClick={onReset}
        className="text-foreground hover:bg-muted/60 h-6 min-w-[3.25rem] rounded-sm px-1.5 text-center font-mono tabular-nums"
        title="Reset zoom"
      >
        {Math.round(scale * 100)}%
      </button>

      <Separator />

      <ToolButton
        label="Fit to screen"
        onClick={onFit}
        icon={<Maximize2 className="h-3.5 w-3.5" />}
      />
      <ToolButton
        label="Actual size (1:1)"
        onClick={onActualSize}
        icon={<Square className="h-3.5 w-3.5" />}
      />

      <Separator />

      <ToolButton
        label="Rotate 90° counter-clockwise"
        onClick={onRotateCcw}
        icon={<RotateCcw className="h-3.5 w-3.5" />}
      />
      <ToolButton
        label="Rotate 90° clockwise"
        onClick={onRotateCw}
        icon={<RotateCw className="h-3.5 w-3.5" />}
      />
      <ToolButton
        label="Flip horizontal"
        onClick={onFlipH}
        icon={<FlipHorizontal2 className="h-3.5 w-3.5" />}
        active={flipH}
      />
      <ToolButton
        label="Flip vertical"
        onClick={onFlipV}
        icon={<FlipVertical2 className="h-3.5 w-3.5" />}
        active={flipV}
      />

      <Separator />

      <ToolButton
        label={`Background: ${bgMode}`}
        onClick={onCycleBackground}
        icon={<Monitor className="h-3.5 w-3.5" />}
      />
      <ToolButton
        label="Copy URL"
        onClick={onCopyUrl}
        icon={<LinkIcon className="h-3.5 w-3.5" />}
      />
      <ToolButton
        label="Open in new tab"
        onClick={onOpenInNewTab}
        icon={<ExternalLink className="h-3.5 w-3.5" />}
      />
      <a
        href={downloadHref}
        download={downloadName}
        className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex h-6 w-6 items-center justify-center rounded-sm"
        title="Download"
      >
        <Download className="h-3.5 w-3.5" />
      </a>

      <div className="flex-1" />

      {/* Readout */}
      <div className="flex items-center gap-2 font-mono text-[10px]">
        {dimensions ? (
          <span>
            {dimensions.w} × {dimensions.h}
          </span>
        ) : null}
        <span>{formatBytes(bytes)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar building blocks                                            */
/* ------------------------------------------------------------------ */

function Separator() {
  return <span className="bg-border/60 mx-1 h-4 w-px shrink-0" />;
}

function ToolButton({
  label,
  onClick,
  icon,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'hover:bg-muted/60 flex h-6 w-6 items-center justify-center rounded-sm transition-colors',
        active ? 'text-foreground bg-muted/60' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
    </button>
  );
}
