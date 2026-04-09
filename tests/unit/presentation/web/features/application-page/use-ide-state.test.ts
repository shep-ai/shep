/**
 * Unit tests for the useIdeState hook.
 *
 * The hook is the brain of the IDE tab: it fetches the tree, opens/closes
 * file tabs, tracks dirty state, saves edits, and reconciles live file
 * change events from the SSE watcher. These tests exercise that logic
 * via mocked fetch + a fake EventSource.
 */

import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useIdeState } from '@/components/features/application-page/ide-tab/use-ide-state';
import type {
  FileTreeEntry,
  ReadFileResult,
} from '@/components/features/application-page/ide-tab/types';

/* -------------------------------------------------------------------------- */
/*  Test harness                                                              */
/* -------------------------------------------------------------------------- */

const TREE: FileTreeEntry = {
  name: 'repo',
  path: '',
  isDirectory: true,
  children: [
    { name: 'a.ts', path: 'a.ts', isDirectory: false },
    { name: 'b.ts', path: 'b.ts', isDirectory: false },
  ],
};

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface MockState {
  files: Map<string, string>;
  treeCalls: number;
  readCalls: string[];
  writeCalls: { path: string; content: string }[];
}

function makeFetch(state: MockState): FetchImpl {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/files')) {
      state.treeCalls++;
      return new Response(JSON.stringify({ tree: TREE }), { status: 200 });
    }
    if (url.includes('/files/content')) {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { path: string; content: string };
        state.writeCalls.push(body);
        state.files.set(body.path, body.content);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      const u = new URL(url, 'http://localhost');
      const p = u.searchParams.get('path') ?? '';
      state.readCalls.push(p);
      const content = state.files.get(p);
      if (content === undefined) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      const body: ReadFileResult = { path: p, content, size: content.length };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response('', { status: 404 });
  };
}

/** Fake EventSource that lets a test manually dispatch `change` events. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  onerror: ((e: unknown) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }
  removeEventListener(): void {
    /* tests never remove */
  }
  dispatch(type: string, data: unknown): void {
    const arr = this.listeners.get(type) ?? [];
    const ev = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const cb of arr) cb(ev);
  }
  close(): void {
    /* noop */
  }
}

describe('useIdeState', () => {
  let state: MockState;

  beforeEach(() => {
    state = {
      files: new Map([
        ['a.ts', 'export const a = 1;\n'],
        ['b.ts', 'export const b = 2;\n'],
      ]),
      treeCalls: 0,
      readCalls: [],
      writeCalls: [],
    };
    globalThis.fetch = vi.fn(makeFetch(state)) as unknown as typeof fetch;
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    FakeEventSource.instances = [];
  });

  it('loads the tree on mount', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());
    expect(result.current.tree?.children?.length).toBe(2);
    expect(state.treeCalls).toBe(1);
  });

  it('opens a file and sets it as active', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());

    await act(async () => {
      await result.current.openFile('a.ts');
    });

    expect(result.current.openFiles).toHaveLength(1);
    expect(result.current.activePath).toBe('a.ts');
    expect(result.current.openFiles[0].content).toBe('export const a = 1;\n');
  });

  it('activating an already-open file does not re-fetch', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());
    await act(async () => {
      await result.current.openFile('a.ts');
    });
    const before = state.readCalls.length;
    await act(async () => {
      await result.current.openFile('a.ts');
    });
    expect(state.readCalls.length).toBe(before);
  });

  it('tracks a dirty buffer and saves it', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());
    await act(async () => {
      await result.current.openFile('a.ts');
    });

    act(() => {
      result.current.updateBuffer('a.ts', 'export const a = 42;\n');
    });
    expect(result.current.openFiles[0].content).toBe('export const a = 42;\n');
    expect(result.current.openFiles[0].originalContent).toBe('export const a = 1;\n');

    await act(async () => {
      await result.current.saveActive();
    });

    expect(state.writeCalls).toEqual([{ path: 'a.ts', content: 'export const a = 42;\n' }]);
    // After save, baseline updates → no longer dirty.
    expect(result.current.openFiles[0].originalContent).toBe('export const a = 42;\n');
  });

  it('closes an open file and picks a neighbour as active', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());

    // Persistent mode so both tabs coexist (preview mode reuses the slot).
    await act(async () => {
      await result.current.openFile('a.ts', { mode: 'persistent' });
    });
    await act(async () => {
      await result.current.openFile('b.ts', { mode: 'persistent' });
    });
    expect(result.current.openFiles).toHaveLength(2);
    expect(result.current.activePath).toBe('b.ts');

    act(() => {
      result.current.closeFile('b.ts');
    });
    expect(result.current.openFiles).toHaveLength(1);
    expect(result.current.activePath).toBe('a.ts');

    act(() => {
      result.current.closeFile('a.ts');
    });
    expect(result.current.openFiles).toHaveLength(0);
    expect(result.current.activePath).toBeNull();
  });

  it('refreshes an open file when the SSE watcher reports a modification and there are no unsaved edits', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());
    await act(async () => {
      await result.current.openFile('a.ts');
    });

    // Simulate the agent rewriting a.ts on disk.
    state.files.set('a.ts', 'export const a = 99;\n');

    await act(async () => {
      FakeEventSource.instances[0].dispatch('change', {
        kind: 'modified',
        path: 'a.ts',
        isDirectory: false,
      });
      // Let the async refetch complete.
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(result.current.openFiles[0].content).toBe('export const a = 99;\n');
    });
  });

  it('preserves unsaved edits when the SSE watcher reports a modification to a dirty file', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());
    await act(async () => {
      await result.current.openFile('a.ts');
    });

    // User makes unsaved edits.
    act(() => {
      result.current.updateBuffer('a.ts', 'local edits\n');
    });

    // Agent rewrites the file on disk.
    state.files.set('a.ts', 'agent wrote this\n');

    await act(async () => {
      FakeEventSource.instances[0].dispatch('change', {
        kind: 'modified',
        path: 'a.ts',
        isDirectory: false,
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Local buffer must survive.
    expect(result.current.openFiles[0].content).toBe('local edits\n');
  });

  it('opens a file in preview mode by default and reuses the slot when another file is opened in preview', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());

    await act(async () => {
      await result.current.openFile('a.ts');
    });
    expect(result.current.openFiles).toHaveLength(1);
    expect(result.current.openFiles[0].isPreview).toBe(true);

    await act(async () => {
      await result.current.openFile('b.ts');
    });
    // Preview slot reused → still just one tab, now b.ts.
    expect(result.current.openFiles).toHaveLength(1);
    expect(result.current.openFiles[0].path).toBe('b.ts');
    expect(result.current.openFiles[0].isPreview).toBe(true);
    expect(result.current.activePath).toBe('b.ts');
  });

  it('promotes a preview tab to persistent on explicit promoteFile', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());

    await act(async () => {
      await result.current.openFile('a.ts');
    });
    act(() => {
      result.current.promoteFile('a.ts');
    });
    expect(result.current.openFiles[0].isPreview).toBe(false);

    // Now opening another file in preview mode should NOT replace it.
    await act(async () => {
      await result.current.openFile('b.ts');
    });
    expect(result.current.openFiles).toHaveLength(2);
    expect(result.current.openFiles[0].path).toBe('a.ts');
    expect(result.current.openFiles[1].path).toBe('b.ts');
  });

  it('promotes a preview tab to persistent when the user edits its buffer', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());
    await act(async () => {
      await result.current.openFile('a.ts');
    });
    expect(result.current.openFiles[0].isPreview).toBe(true);

    act(() => {
      result.current.updateBuffer('a.ts', 'edited\n');
    });
    expect(result.current.openFiles[0].isPreview).toBe(false);
  });

  it('refreshes the tree (debounced) when any change event fires', async () => {
    const { result } = renderHook(() => useIdeState('app-1'));
    await waitFor(() => expect(result.current.tree).not.toBeNull());
    const before = state.treeCalls;

    await act(async () => {
      FakeEventSource.instances[0].dispatch('change', {
        kind: 'created',
        path: 'c.ts',
        isDirectory: false,
      });
      await new Promise((r) => setTimeout(r, 300));
    });

    expect(state.treeCalls).toBeGreaterThan(before);
  });
});
