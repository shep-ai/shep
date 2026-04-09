import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import { IdeTab } from './ide-tab';
import type { FileTreeEntry, ReadFileResult } from './types';

/* -------------------------------------------------------------------------- */
/*  Fetch / EventSource mocks                                                 */
/* -------------------------------------------------------------------------- */
/*  These stories run in Storybook (no real backend), so we swap `fetch` and  */
/*  `EventSource` for minimal in-memory fakes that return a small sample      */
/*  repository tree and a few file contents.                                   */

const SAMPLE_TREE: FileTreeEntry = {
  name: 'demo-repo',
  path: '',
  isDirectory: true,
  children: [
    {
      name: 'src',
      path: 'src',
      isDirectory: true,
      children: [
        { name: 'index.ts', path: 'src/index.ts', isDirectory: false },
        { name: 'utils.ts', path: 'src/utils.ts', isDirectory: false },
        {
          name: 'components',
          path: 'src/components',
          isDirectory: true,
          children: [{ name: 'button.tsx', path: 'src/components/button.tsx', isDirectory: false }],
        },
      ],
    },
    { name: 'package.json', path: 'package.json', isDirectory: false },
    { name: 'README.md', path: 'README.md', isDirectory: false },
  ],
};

const SAMPLE_FILES: Record<string, string> = {
  'src/index.ts': "import { greet } from './utils';\n\ngreet('world');\n",
  'src/utils.ts':
    "export function greet(name: string): void {\n  console.log('Hello,', name);\n}\n",
  'src/components/button.tsx':
    "import * as React from 'react';\n\nexport function Button() {\n  return <button>Click me</button>;\n}\n",
  'package.json': '{\n  "name": "demo-repo",\n  "version": "0.0.1"\n}\n',
  'README.md': '# Demo Repo\n\nThis is a fake repository used only by Storybook.\n',
};

class NoopEventSource {
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  addEventListener(): void {
    /* no-op for Storybook */
  }
  removeEventListener(): void {
    /* no-op for Storybook */
  }
  close(): void {
    /* no-op for Storybook */
  }
}

function installMocks(): () => void {
  const originalFetch = globalThis.fetch;
  const originalEventSource = (globalThis as unknown as { EventSource?: unknown }).EventSource;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/files')) {
      return new Response(JSON.stringify({ tree: SAMPLE_TREE }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/files/content')) {
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      const u = new URL(url, 'http://localhost');
      const pathParam = u.searchParams.get('path') ?? '';
      const content = SAMPLE_FILES[pathParam];
      if (content === undefined) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      const body: ReadFileResult = {
        path: pathParam,
        content,
        size: content.length,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

  (globalThis as unknown as { EventSource: unknown }).EventSource = NoopEventSource;

  return () => {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { EventSource: unknown }).EventSource = originalEventSource;
  };
}

function IdeTabStoryShell({ applicationId }: { applicationId: string }) {
  useEffect(() => {
    const uninstall = installMocks();
    return uninstall;
  }, []);
  return (
    <div className="bg-background h-dvh w-full">
      <IdeTab applicationId={applicationId} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const meta: Meta<typeof IdeTabStoryShell> = {
  title: 'Features/ApplicationPage/IdeTab',
  component: IdeTabStoryShell,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { applicationId: 'app-demo' },
};
