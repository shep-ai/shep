'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, X, Bot, GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChatTab } from './ChatTab';
import { ChatDotIndicator } from './ChatDotIndicator';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';
import { useFabLayout } from '@/hooks/fab-layout-context';
import { useSidebar } from '@/components/ui/sidebar';
import { useSidebarFeaturesContext } from '@/hooks/sidebar-features-context';

// ── Persistent global chat popup (draggable + resizable) ──────────────────

const DEFAULT_W = 520;
const DEFAULT_H_VH = 70; // percentage of viewport height
const MIN_W = 360;
const MIN_H = 300;

interface Position {
  x: number;
  y: number;
}

interface Size {
  w: number;
  h: number;
}

const STORAGE_KEY = 'shep-global-chat';

function loadPersistedState(): { pos: Position | null; size: Size | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pos: null, size: null };
    const parsed = JSON.parse(raw);
    let size: Size | null = parsed.size ?? null;
    // Clamp persisted size to minimums — prevents invisible panel from bad state
    if (size && (size.w < MIN_W || size.h < MIN_H)) {
      size = { w: Math.max(MIN_W, size.w), h: Math.max(MIN_H, size.h) };
    }
    return {
      pos: parsed.pos ?? null,
      size,
    };
  } catch {
    return { pos: null, size: null };
  }
}

function persistState(pos: Position | null, size: Size | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pos, size }));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export function GlobalChatPopup() {
  const { t } = useTranslation('web');
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const globalChatTurnStatus = useTurnStatus('global');
  const { swapPosition } = useFabLayout();
  const { state: sidebarState } = useSidebar();
  const { hasRepositories } = useSidebarFeaturesContext();

  // Position/size — initialized from localStorage
  // eslint-disable-next-line react/hook-use-state -- wrapped setters below
  const [pos, setPosRaw] = useState<Position | null>(() => loadPersistedState().pos);
  // eslint-disable-next-line react/hook-use-state -- wrapped setters below
  const [size, setSizeRaw] = useState<Size | null>(() => loadPersistedState().size);

  // Wrapped setters that also persist
  const setPos = useCallback(
    (v: Position | null | ((prev: Position | null) => Position | null)) => {
      setPosRaw((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        // Defer persist to avoid doing it on every mousemove frame
        return next;
      });
    },
    []
  );

  const setSize = useCallback((v: Size | null | ((prev: Size | null) => Size | null)) => {
    setSizeRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      return next;
    });
  }, []);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) setHasOpened(true);
      return !prev;
    });
  }, []);

  // Store pre-maximize pos/size so we can restore
  const preMaxRef = useRef<{ pos: Position | null; size: Size | null }>({ pos: null, size: null });

  const toggleMaximize = useCallback(() => {
    if (!isOpen) {
      setIsOpen(true);
      setHasOpened(true);
    }
    setIsMaximized((prev) => {
      if (!prev) {
        // Entering maximize — save current state
        preMaxRef.current = { pos, size };
      } else {
        // Leaving maximize — restore previous state
        setPos(preMaxRef.current.pos);
        setSize(preMaxRef.current.size);
      }
      return !prev;
    });
  }, [isOpen, pos, size, setPos, setSize]);

  // Keyboard shortcuts: Cmd/Ctrl+Shift+K = toggle, Cmd/Ctrl+Shift+M = maximize
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (isMaximized) setIsMaximized(false);
        toggle();
        // Focus the composer input after panel opens
        requestAnimationFrame(() => {
          setTimeout(() => {
            const input = panelRef.current?.querySelector<HTMLTextAreaElement>('textarea');
            input?.focus();
          }, 100);
        });
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        toggleMaximize();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggle, toggleMaximize, isMaximized]);

  // Persist position/size to localStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => persistState(pos, size), 300);
    return () => clearTimeout(timer);
  }, [pos, size]);

  /** Clamp position so the header (top 48px) stays within viewport. */
  const clampPos = useCallback((x: number, y: number, w: number): Position => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const HEADER_H = 48;
    return {
      // Keep at least 100px of width visible horizontally
      x: Math.max(-w + 100, Math.min(x, vw - 100)),
      // Keep header on screen: top >= 0, top <= viewport - header height
      y: Math.max(0, Math.min(y, vh - HEADER_H)),
    };
  }, []);

  // ── Drag handling ──────────────────────────────────────────────────────
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const currentX = pos?.x ?? rect.left;
      const currentY = pos?.y ?? rect.top;

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: currentX,
        startPosY: currentY,
      };

      const panelW = size?.w ?? rect.width;

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPos(clampPos(dragRef.current.startPosX + dx, dragRef.current.startPosY + dy, panelW));
      };

      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [pos, size, setPos, clampPos]
  );

  // ── Resize handling (from top-right corner) ────────────────────────────
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const startW = size?.w ?? rect.width;
      const startH = size?.h ?? rect.height;
      const startX = e.clientX;
      const startY = e.clientY;
      const startPosY = pos?.y ?? rect.top;

      resizeRef.current = { startX, startY, startW, startH };

      // Capture position if not set yet
      if (!pos) {
        setPos({ x: rect.left, y: rect.top });
      }

      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newW = Math.max(MIN_W, startW + dx);
        const newH = Math.max(MIN_H, startH - dy);
        // Top edge moves with height change, clamped to viewport
        const newY = Math.max(0, startPosY + dy);
        setSize({ w: newW, h: newH });
        setPos((prev) => clampPos(prev?.x ?? rect.left, newY, newW));
      };

      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [size, pos, setPos, setSize, clampPos]
  );

  // Reset position/size on close for clean reopen
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsMaximized(false);
  }, []);

  // Compute panel style — maximized overrides everything
  const panelStyle: React.CSSProperties = isMaximized
    ? {}
    : pos
      ? {
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: size?.w ?? DEFAULT_W,
          height: size?.h ?? `${DEFAULT_H_VH}vh`,
        }
      : {
          width: size?.w ?? DEFAULT_W,
          height: size?.h ?? `${DEFAULT_H_VH}vh`,
        };

  return (
    <>
      {/* Chat panel */}
      {hasOpened ? (
        <div
          ref={panelRef}
          className={cn(
            isMaximized
              ? 'bg-background fixed inset-0 z-[60] flex flex-col overflow-hidden dark:bg-neutral-900'
              : cn(
                  !pos && (swapPosition ? 'fixed start-8 bottom-24' : 'fixed end-8 bottom-24'),
                  'z-[60] flex flex-col overflow-hidden rounded-lg',
                  'border-border/60 border dark:border-white/10',
                  'bg-background dark:bg-neutral-900',
                  'shadow-[0_8px_40px_-8px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)]'
                ),
            'transition-opacity duration-300 ease-out',
            isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          )}
          style={panelStyle}
        >
          {/* Violet accent strip at top */}
          {!isMaximized ? (
            <div className="h-[2px] shrink-0 bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
          ) : null}

          {/* Resize handle — top-right corner (hidden when maximized) */}
          {!isMaximized ? (
            <div
              onMouseDown={onResizeStart}
              className="absolute end-0 top-0 z-10 h-4 w-4 cursor-ne-resize"
            />
          ) : null}

          {/* Header — draggable when not maximized */}
          <div
            onMouseDown={isMaximized ? undefined : onDragStart}
            className={cn(
              'relative flex h-11 shrink-0 items-center gap-2.5 border-b border-black/[0.06] px-3.5 dark:border-white/[0.06]',
              !isMaximized && 'cursor-grab active:cursor-grabbing'
            )}
          >
            <div className="from-foreground/[0.02] to-foreground/[0.02] pointer-events-none absolute inset-0 bg-gradient-to-r via-transparent" />
            {!isMaximized ? (
              <GripVertical className="text-foreground/15 relative h-3.5 w-3.5 shrink-0" />
            ) : null}
            <div className="relative flex h-5 w-5 items-center justify-center">
              <Bot className="text-foreground/50 h-4 w-4" />
            </div>
            <div className="relative flex items-baseline gap-2">
              <span className="text-foreground/90 text-base font-bold tracking-tight">Shep</span>
              <span className="text-foreground/30 text-xs font-medium tracking-widest uppercase">
                global
              </span>
            </div>
            <div className="relative ms-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={toggleMaximize}
                className="text-foreground/30 hover:text-foreground/60 rounded-md p-1 transition-colors"
                title={isMaximized ? 'Restore (⌘⇧M)' : 'Maximize (⌘⇧M)'}
              >
                {isMaximized ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="text-foreground/30 hover:text-foreground/60 rounded-md p-1 transition-colors"
                title="Close (⌘⇧K)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Chat content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatTab featureId="global" />
          </div>

          {/* Resize handle — bottom-right corner (hidden when maximized) */}
          {!isMaximized ? (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const panel = panelRef.current;
                if (!panel) return;
                const rect = panel.getBoundingClientRect();
                const startX = e.clientX;
                const startY = e.clientY;
                const startW = size?.w ?? rect.width;
                const startH = size?.h ?? rect.height;
                if (!pos) setPos({ x: rect.left, y: rect.top });

                const onMove = (ev: MouseEvent) => {
                  const maxH = window.innerHeight - (pos?.y ?? rect.top);
                  setSize({
                    w: Math.max(MIN_W, startW + (ev.clientX - startX)),
                    h: Math.max(MIN_H, Math.min(startH + (ev.clientY - startY), maxH)),
                  });
                };
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
              className="absolute end-0 bottom-0 z-10 h-4 w-4 cursor-se-resize"
            />
          ) : null}
        </div>
      ) : null}

      {/* Chat FAB — hidden during onboarding (no repos), shown after first project */}
      {!hasRepositories ? null : (
        <ChatFabWrapper
          swapPosition={swapPosition}
          sidebarState={sidebarState}
          isMaximized={isMaximized}
        >
          <Button
            size="icon"
            onClick={toggle}
            className={cn(
              'relative h-14 w-14 rounded-full shadow-lg',
              'transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95',
              isOpen
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'bg-violet-500 text-white hover:bg-violet-400 dark:bg-violet-500 dark:hover:bg-violet-400',
              // Animated states when chat is closed
              !isOpen && globalChatTurnStatus === 'processing' && 'chat-fab-spinning',
              !isOpen && globalChatTurnStatus === 'unread' && 'chat-fab-glow-unread',
              !isOpen && globalChatTurnStatus === 'awaiting_input' && 'chat-fab-glow-awaiting'
            )}
          >
            <MessageSquare
              className={cn(
                'absolute h-7 w-7 stroke-[2.5] transition-all duration-200',
                isOpen ? 'scale-0 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
              )}
            />
            <X
              className={cn(
                'absolute h-6 w-6 stroke-[2.5] transition-all duration-200',
                isOpen ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-90 opacity-0'
              )}
            />
            {!isOpen && <ChatDotIndicator status={globalChatTurnStatus} className="end-0 top-0" />}
          </Button>
          {/* Tooltip — slides up on hover */}
          <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-200 group-hover/fab:translate-y-0 group-hover/fab:opacity-100">
            <div className="bg-foreground rounded-lg px-3 py-1.5 text-center shadow-lg">
              <p className="text-background text-xs font-medium whitespace-nowrap">
                {t('chat.shepChat')}
              </p>
              <p className="text-background/50 mt-0.5 flex items-center justify-center gap-1 text-[10px]">
                <kbd className="bg-background/15 rounded px-1 py-px font-mono">⌘</kbd>
                <kbd className="bg-background/15 rounded px-1 py-px font-mono">⇧</kbd>
                <kbd className="bg-background/15 rounded px-1 py-px font-mono">K</kbd>
              </p>
            </div>
          </div>
        </ChatFabWrapper>
      )}
    </>
  );
}

/** Wrapper for the Chat FAB that handles position swapping. */
function ChatFabWrapper({
  swapPosition,
  sidebarState,
  isMaximized,
  children,
}: {
  swapPosition: boolean;
  sidebarState: 'expanded' | 'collapsed';
  isMaximized: boolean;
  children: React.ReactNode;
}) {
  const { i18n } = useTranslation('web');
  const isRtl = i18n.dir() === 'rtl';

  if (!swapPosition) {
    return (
      <div className={cn('group/fab fixed end-8 bottom-6 z-30', isMaximized && 'hidden')}>
        {children}
      </div>
    );
  }

  // Swapped: chat FAB moves to start side, tracking sidebar width
  const sidebarOffset =
    sidebarState === 'expanded'
      ? 'calc(var(--sidebar-width) + 32px)'
      : 'calc(var(--sidebar-width-icon) + 32px)';

  const positionStyle: React.CSSProperties = isRtl
    ? { right: sidebarOffset, transition: 'right 200ms ease-in-out' }
    : { left: sidebarOffset, transition: 'left 200ms ease-in-out' };

  return (
    <div
      className={cn('group/fab fixed bottom-6 z-30', isMaximized && 'hidden')}
      style={positionStyle}
    >
      {children}
    </div>
  );
}
