'use client';

/**
 * Terminal Tab
 *
 * Renders an xterm.js-backed interactive terminal wired to a server-side
 * PTY session rooted at an application's working directory. Input is sent
 * via POST, output is streamed over SSE. The session is created lazily on
 * first mount and reused across tab switches (the parent keeps this
 * component mounted via CSS visibility so history persists).
 */

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export interface TerminalTabProps {
  /** Absolute working directory to launch the PTY in. */
  cwd: string;
  /** Optional CSS className for the outer wrapper. */
  className?: string;
}

interface CreateResponse {
  sessionId: string;
  shell: string;
  cwd: string;
}

// Matches xterm.js's default dark theme with a slightly softer background
// that blends with the app's panel surfaces.
const TERMINAL_THEME = {
  background: '#0b0d10',
  foreground: '#e5e7eb',
  cursor: '#e5e7eb',
  cursorAccent: '#0b0d10',
  selectionBackground: '#3b82f680',
  black: '#1f2937',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e5e7eb',
  brightBlack: '#4b5563',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f9fafb',
} as const;

export function TerminalTab({ cwd, className }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [status, setStatus] = useState<'initializing' | 'connected' | 'exited' | 'error'>(
    'initializing'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mount once: create terminal, create session, open SSE, wire input.
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: TERMINAL_THEME,
      allowProposedApi: true,
      scrollback: 5000,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    terminalRef.current = term;
    fitRef.current = fit;

    try {
      fit.fit();
    } catch {
      // container may not have layout yet; a ResizeObserver below will retry
    }

    // Create the session on the server.
    void (async () => {
      try {
        const res = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cwd,
            cols: term.cols,
            rows: term.rows,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as CreateResponse;
        if (cancelled) return;

        sessionIdRef.current = data.sessionId;

        // Open SSE for output.
        const es = new EventSource(`/api/terminal/${data.sessionId}/stream`);
        eventSourceRef.current = es;

        es.addEventListener('data', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as { data: string };
            term.write(payload.data);
          } catch {
            // ignore malformed event
          }
        });

        es.addEventListener('exit', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as { code: number | null };
            term.writeln('');
            term.writeln(`\x1b[90m[process exited with code ${payload.code ?? 'null'}]\x1b[0m`);
          } catch {
            term.writeln('\x1b[90m[process exited]\x1b[0m');
          }
          setStatus('exited');
          es.close();
          eventSourceRef.current = null;
        });

        es.onopen = () => {
          if (!cancelled) setStatus('connected');
        };

        es.onerror = () => {
          if (cancelled) return;
          // EventSource auto-reconnects; don't flip status unless we never
          // connected in the first place. Use functional setState to avoid
          // closing over a stale `status` from the render that created this
          // effect.
          setStatus((prev) => {
            if (prev === 'initializing') {
              setErrorMessage('Failed to connect to terminal stream');
              return 'error';
            }
            return prev;
          });
        };

        // Wire input: forward every keystroke to the server.
        term.onData((chunk) => {
          const sid = sessionIdRef.current;
          if (!sid) return;
          void fetch(`/api/terminal/${sid}/input`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: chunk }),
          }).catch(() => {
            // swallow — the SSE error path will surface lost sessions
          });
        });

        // Wire resize: debounce resize requests to the server.
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        term.onResize(({ cols, rows }) => {
          const sid = sessionIdRef.current;
          if (!sid) return;
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            void fetch(`/api/terminal/${sid}/resize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cols, rows }),
            }).catch(() => {
              // ignore
            });
          }, 50);
        });
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
        term.writeln(
          `\x1b[31m[terminal error: ${err instanceof Error ? err.message : String(err)}]\x1b[0m`
        );
      }
    })();

    // Observe container size changes and keep xterm fitted.
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore — container may be hidden when tab is not active
      }
    });
    ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();

      // Close SSE first so pending output doesn't hit a disposed terminal.
      const es = eventSourceRef.current;
      if (es) {
        es.close();
        eventSourceRef.current = null;
      }

      // Tell the server to kill the PTY.
      const sid = sessionIdRef.current;
      if (sid) {
        // Use keepalive so the request still fires as the page tears down.
        void fetch(`/api/terminal/${sid}`, {
          method: 'DELETE',
          keepalive: true,
        }).catch(() => {
          // ignore
        });
        sessionIdRef.current = null;
      }

      try {
        term.dispose();
      } catch {
        // ignore
      }
      terminalRef.current = null;
      fitRef.current = null;
    };
    // Re-create the session whenever the cwd changes.
  }, [cwd]);

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col bg-[#0b0d10] ${className ?? ''}`}>
      {status === 'error' && errorMessage !== null && (
        <div
          className="absolute top-2 left-2 z-10 rounded border border-red-500/40 bg-red-950/80 px-2 py-1 text-[11px] text-red-200"
          role="alert"
        >
          {errorMessage}
        </div>
      )}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 px-2 py-2"
        // xterm manages keyboard focus itself — clicking the pane focuses it.
      />
    </div>
  );
}
