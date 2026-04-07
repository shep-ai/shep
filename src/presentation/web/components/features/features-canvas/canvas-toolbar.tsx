'use client';

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Viewport } from '@xyflow/react';
import { Eye, EyeOff, ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface CanvasToolbarProps {
  showArchived: boolean;
  onToggleArchived: () => void;
  onResetViewport?: () => Viewport;
  /** Optional slot rendered at the start of the toolbar (e.g. workspace selector). */
  startSlot?: React.ReactNode;
}

export function CanvasToolbar({
  showArchived,
  onToggleArchived,
  onResetViewport,
  startSlot,
}: CanvasToolbarProps) {
  const { t } = useTranslation('web');
  const { zoomIn, zoomOut, fitView, setViewport } = useReactFlow();

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView({ duration: 400, padding: 0.3 });
  }, [fitView]);

  const handleReset = useCallback(() => {
    if (onResetViewport) {
      const viewport = onResetViewport();
      setViewport(viewport, { duration: 400 });
    }
  }, [onResetViewport, setViewport]);

  return (
    <div className="bg-background flex items-center gap-1 rounded-xl border px-2 py-1.5 shadow-md dark:bg-neutral-900">
      {startSlot ? (
        <>
          {startSlot}
          <div className="bg-border mx-1 h-5 w-px" />
        </>
      ) : null}
      {/* View controls */}
      <ToolbarButton
        onClick={onToggleArchived}
        title={showArchived ? t('canvas.hideArchived') : t('canvas.showArchived')}
        active={showArchived}
        label={showArchived ? t('canvas.hideArchivedLabel') : t('canvas.showArchivedLabel')}
      >
        {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </ToolbarButton>

      <div className="bg-border mx-1 h-5 w-px" />

      {/* Zoom controls */}
      <ToolbarButton onClick={handleZoomOut} title={t('canvas.zoomOut')}>
        <ZoomOut className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={handleZoomIn} title={t('canvas.zoomIn')}>
        <ZoomIn className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={handleFitView} title={t('canvas.fitView')}>
        <Maximize className="h-4 w-4" />
      </ToolbarButton>
      {onResetViewport ? (
        <ToolbarButton onClick={handleReset} title={t('canvas.resetView')}>
          <RotateCcw className="h-4 w-4" />
        </ToolbarButton>
      ) : null}
    </div>
  );
}

// ── Internal button ──────────────────────────────────────────────────────

function ToolbarButton({
  children,
  onClick,
  title,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  label?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        active ? 'text-primary bg-primary/10' : 'text-muted-foreground'
      )}
    >
      {children}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
