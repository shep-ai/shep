'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LayoutGrid, Send } from 'lucide-react';
import type { Application, ApplicationStatus } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

const STATUS_DOT_CLASS: Record<ApplicationStatus, string> = {
  Idle: 'bg-muted-foreground/40',
  Active: 'bg-green-500',
  Error: 'bg-red-500',
};

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
      <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_CLASS[status])} />
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Resizable split panel                                              */
/* ------------------------------------------------------------------ */

const MIN_LEFT_PX = 400;
const MIN_RIGHT_PX = 400;
const INITIAL_LEFT_FRACTION = 0.4;

function ResizableSplit({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = useState(INITIAL_LEFT_FRACTION);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const totalWidth = rect.width;
    const x = e.clientX - rect.left;

    const clampedX = Math.max(MIN_LEFT_PX, Math.min(x, totalWidth - MIN_RIGHT_PX));
    setLeftFraction(clampedX / totalWidth);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      {/* Left panel */}
      <div
        className="min-h-0 overflow-auto"
        style={{ flexBasis: `${leftFraction * 100}%`, flexShrink: 0 }}
      >
        {left}
      </div>

      {/* Divider */}
      <div
        role="separator"
        aria-orientation="vertical"
        className="hover:bg-muted/60 active:bg-muted flex w-1.5 shrink-0 cursor-col-resize items-center justify-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="bg-border h-8 w-0.5 rounded-full" />
      </div>

      {/* Right panel */}
      <div className="min-h-0 flex-1 overflow-auto">{right}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chat placeholder (left panel)                                      */
/* ------------------------------------------------------------------ */

function ChatPlaceholder() {
  return (
    <div className="flex h-full flex-col">
      {/* Chat header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-sm font-medium">Chat with AI</span>
      </div>

      {/* Chat body */}
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Start a conversation to build your app</p>
      </div>

      {/* Chat input */}
      <div className="border-t px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            disabled
            placeholder="Type a message..."
            rows={1}
            className="border-input bg-muted/40 placeholder:text-muted-foreground flex-1 resize-none rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button variant="secondary" size="icon" disabled aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  View selector (right panel)                                        */
/* ------------------------------------------------------------------ */

function ViewSelector() {
  return (
    <Tabs defaultValue="ide" className="flex h-full flex-col">
      <div className="border-b px-4 py-2">
        <TabsList>
          <TabsTrigger value="ide">IDE</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="web">Web</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="ide" className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">IDE view coming soon</p>
      </TabsContent>
      <TabsContent value="terminal" className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Terminal coming soon</p>
      </TabsContent>
      <TabsContent value="web" className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Web preview coming soon</p>
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ */
/*  ApplicationPage                                                    */
/* ------------------------------------------------------------------ */

export interface ApplicationPageProps {
  application: Application;
}

export function ApplicationPage({ application }: ApplicationPageProps) {
  const router = useRouter();

  return (
    <div className="bg-background flex h-dvh flex-col">
      {/* Sticky header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to canvas"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
          <LayoutGrid className="h-4 w-4 text-white" />
        </div>

        <h1 className="min-w-0 truncate text-lg font-bold">{application.name}</h1>

        <StatusBadge status={application.status} />
      </header>

      {/* Split layout */}
      <ResizableSplit left={<ChatPlaceholder />} right={<ViewSelector />} />
    </div>
  );
}
