'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Copy, Minus, Square, X } from 'lucide-react';
import { ShepLogo } from '@/components/common/shep-logo';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppsOnlyRouteGuard } from '@/hooks/use-apps-only-route-guard';
import { cn } from '@/lib/utils';

interface AppsOnlyShellProps {
  children: ReactNode;
}

/**
 * Electron honors `-webkit-app-region` on the renderer to make the
 * frameless window move when the user drags the header; interactive
 * controls inside the draggable region need the inverse (`no-drag`)
 * or the click gets swallowed by the move handler.
 *
 * `-webkit-app-region` is NOT inherited by default. It must be set on
 * every interactive element explicitly — setting it only on the
 * enclosing div let the compositor silently claim clicks on our
 * buttons. The fix is: drag on the <header>, no-drag on the buttons.
 */
const DRAG_REGION: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG_REGION: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

interface ShepWindowControls {
  minimize?: () => void;
  maximizeToggle?: () => void;
  close?: () => void;
  onMaximizedChange?: (cb: (isMaximized: boolean) => void) => void;
}

function readWindowControls(): ShepWindowControls | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as { shepElectron?: { windowControls?: ShepWindowControls } })
    .shepElectron;
  return bridge?.windowControls ?? null;
}

export function AppsOnlyShell({ children }: AppsOnlyShellProps) {
  useAppsOnlyRouteGuard('apps-only');

  const [controls, setControls] = useState<ShepWindowControls | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const c = readWindowControls();
    setControls(c);
    c?.onMaximizedChange?.((v) => setIsMaximized(v));
  }, []);

  return (
    <TooltipProvider>
      <div
        className={cn(
          'bg-background text-foreground relative flex h-screen flex-col overflow-hidden',
          'rounded-xl border shadow-xl'
        )}
      >
        <header
          className={cn(
            'relative z-20 flex h-10 shrink-0 items-center gap-3 border-b px-3 select-none',
            'bg-background/80 supports-[backdrop-filter]:bg-background/60 backdrop-blur'
          )}
          style={DRAG_REGION}
          onDoubleClick={() => controls?.maximizeToggle?.()}
        >
          <Link
            href="/applications"
            aria-label="Applications"
            className="group flex items-center gap-2 rounded px-1 py-0.5 outline-none"
            style={NO_DRAG_REGION}
          >
            <ShepLogo size={16} className="opacity-90 transition-opacity group-hover:opacity-100" />
            <span className="flex items-baseline gap-1 text-[12.5px] font-semibold tracking-tight">
              <span className="text-foreground">shep</span>
              <span className="text-muted-foreground font-normal">·</span>
              <span className="text-muted-foreground font-normal">ui</span>
            </span>
          </Link>

          <div className="flex-1" aria-hidden />

          {/* Every interactive element inside the draggable header
              MUST set `no-drag` on itself — the property doesn't
              inherit, so setting it only on the parent lets the
              compositor steal clicks on children. */}
          <div className="flex items-center gap-1" style={NO_DRAG_REGION}>
            <div style={NO_DRAG_REGION}>
              <ThemeToggle />
            </div>
            <div className="bg-border/70 mx-1 h-4 w-px" aria-hidden />
            <WindowButton
              label="Minimize"
              onClick={() => controls?.minimize?.()}
              icon={<Minus className="size-3" strokeWidth={2.25} />}
            />
            <WindowButton
              label={isMaximized ? 'Restore' : 'Maximize'}
              onClick={() => controls?.maximizeToggle?.()}
              icon={
                isMaximized ? (
                  <Copy className="size-3 -rotate-90" strokeWidth={2.25} />
                ) : (
                  <Square className="size-[10px]" strokeWidth={2.25} />
                )
              }
            />
            <WindowButton
              label="Close"
              onClick={() => controls?.close?.()}
              icon={<X className="size-3.5" strokeWidth={2.25} />}
              variant="danger"
            />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </TooltipProvider>
  );
}

/**
 * Small, sleek window-control button. Explicit `-webkit-app-region:
 * no-drag` on the button element is required — without it the
 * draggable header absorbs the click on Linux/Chromium frameless
 * windows, which is why clicks silently did nothing despite the IPC
 * chain being fully wired.
 */
function WindowButton({
  label,
  onClick,
  icon,
  variant = 'default',
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={NO_DRAG_REGION}
      className={cn(
        'text-muted-foreground inline-flex h-6 w-6 items-center justify-center rounded transition-colors duration-150 ease-out',
        'hover:text-foreground active:scale-[0.95]',
        variant === 'danger'
          ? 'hover:bg-destructive hover:text-destructive-foreground'
          : 'hover:bg-muted'
      )}
    >
      {icon}
    </button>
  );
}
