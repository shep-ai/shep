import { describe, it, expect, vi } from 'vitest';
import { LearnedHarnessExecutorProxy } from '@/infrastructure/services/harness-learning/learned-harness-executor.proxy.js';
import { LearnedHarnessRunSession } from '@/infrastructure/services/harness-learning/learned-harness-run-session.js';
import type {
  AgentExecutionOptions,
  AgentExecutionStreamEvent,
  IAgentExecutor,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import type { HarnessInstallation } from '@/application/ports/output/services/harness-installer.interface.js';
import {
  AgentFeature,
  AgentType,
  HarnessComponentKind,
  HarnessOrigin,
  LearnedHarnessStatus,
  MemoryScope,
  type LearnedHarnessVersion,
} from '@/domain/generated/output.js';

function fakeExecutor() {
  const calls: { prompt: string; options?: AgentExecutionOptions }[] = [];
  const executor: IAgentExecutor = {
    agentType: AgentType.ClaudeCode,
    execute: vi.fn(async (prompt: string, options?: AgentExecutionOptions) => {
      calls.push({ prompt, options });
      return { result: 'ok' };
    }),
    executeStream: vi.fn(async function* (prompt: string, options?: AgentExecutionOptions) {
      calls.push({ prompt, options });
      yield { type: 'result', content: 'ok', timestamp: new Date() } as AgentExecutionStreamEvent;
    }),
    supportsFeature: (f: AgentFeature) => f === AgentFeature.streaming,
  };
  return { executor, calls };
}

const VERSION: LearnedHarnessVersion = {
  id: 'v1',
  scope: MemoryScope.Project,
  repositoryPath: '/repo',
  status: LearnedHarnessStatus.Adopted,
  origin: HarnessOrigin.Manual,
  components: [
    { kind: HarnessComponentKind.Guardrails, path: 'guardrails.md', content: 'x', sha256: 'h' },
  ],
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function session(installation: HarnessInstallation | null, version = VERSION) {
  const getCurrent = { execute: vi.fn(async () => version) };
  const installer = {
    install: vi.fn(async () => installation ?? { writtenPaths: [], warnings: [] }),
  };
  const s = new LearnedHarnessRunSession(getCurrent as never, installer, '/repo', () => undefined);
  return { s, getCurrent, installer };
}

describe('LearnedHarnessExecutorProxy', () => {
  it('passes a call through untouched when there is no working directory', async () => {
    const { executor, calls } = fakeExecutor();
    const { s, installer } = session({ writtenPaths: [], warnings: [], promptSection: 'x' });
    const proxy = new LearnedHarnessExecutorProxy(executor, s);
    await proxy.execute('do it', { model: 'm' });
    expect(calls[0]).toEqual({ prompt: 'do it', options: { model: 'm' } });
    expect(installer.install).not.toHaveBeenCalled();
  });

  it('merges system prompt, settings and prompt section into the call', async () => {
    const { executor, calls } = fakeExecutor();
    const { s } = session({
      versionId: 'v1',
      systemPrompt: '## Learned',
      settingsPath: '/wt/.shep/learned/settings.json',
      promptSection: '## Learned section',
      writtenPaths: ['a'],
      warnings: [],
    });
    const proxy = new LearnedHarnessExecutorProxy(executor, s);
    await proxy.execute('Implement it', {
      cwd: '/wt',
      systemPrompt: 'Base system',
      promptSections: [
        { id: 'task', title: 'Task', kind: 'instructions', content: 'Implement it', pinned: true },
      ],
    });
    const { prompt, options } = calls[0];
    expect(prompt).toBe('Implement it\n\n## Learned section');
    expect(options?.systemPrompt).toBe('Base system\n\n## Learned');
    expect(options?.settingsPath).toBe('/wt/.shep/learned/settings.json');
    expect(options?.promptSections?.map((p) => p.content).join('\n\n')).toBe(prompt);
  });

  it('applies the harness to streamed calls too', async () => {
    const { executor, calls } = fakeExecutor();
    const { s } = session({ promptSection: '## L', writtenPaths: [], warnings: [] });
    const proxy = new LearnedHarnessExecutorProxy(executor, s);
    for await (const _ of proxy.executeStream('go', { cwd: '/wt' })) void _;
    expect(calls[0].prompt).toBe('go\n\n## L');
  });

  it('runs the plain call when preparing the harness fails', async () => {
    const { executor, calls } = fakeExecutor();
    const { s, installer } = session(null);
    installer.install.mockRejectedValueOnce(new Error('disk full'));
    const proxy = new LearnedHarnessExecutorProxy(executor, s);
    await proxy.execute('go', { cwd: '/wt' });
    expect(calls[0]).toEqual({ prompt: 'go', options: { cwd: '/wt' } });
  });

  it('exposes the inner agent type and features', () => {
    const { executor } = fakeExecutor();
    const proxy = new LearnedHarnessExecutorProxy(executor, session(null).s);
    expect(proxy.agentType).toBe(AgentType.ClaudeCode);
    expect(proxy.supportsFeature(AgentFeature.streaming)).toBe(true);
  });
});

describe('LearnedHarnessRunSession', () => {
  it('pins one version for the whole run', async () => {
    const { s, getCurrent } = session({ writtenPaths: [], warnings: [] });
    await s.prepare(AgentType.ClaudeCode, '/wt');
    await s.prepare(AgentType.ClaudeCode, '/wt');
    expect(getCurrent.execute).toHaveBeenCalledTimes(1);
    expect(await s.versionId()).toBe('v1');
  });

  it('installs nothing and reports no version when none is adopted', async () => {
    const getCurrent = { execute: vi.fn(async () => null) };
    const installer = { install: vi.fn() };
    const s = new LearnedHarnessRunSession(
      getCurrent as never,
      installer,
      '/repo',
      () => undefined
    );
    expect(await s.prepare(AgentType.ClaudeCode, '/wt')).toBeNull();
    expect(installer.install).not.toHaveBeenCalled();
    expect(await s.versionId()).toBeUndefined();
  });
});
