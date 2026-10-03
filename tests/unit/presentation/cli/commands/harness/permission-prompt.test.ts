/**
 * The CLI permission prompt (spec 119) closes itself when the request is
 * answered somewhere else, e.g. in the web approvals inbox.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrantScope } from '@/domain/generated/output.js';
import type { HarnessPermissionItem } from '@/application/use-cases/harness/list-harness-permissions.use-case.js';

const { mockResolve, impls, mockSelect, mockInput } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  impls: {} as Record<string, { execute: ReturnType<typeof vi.fn> }>,
  mockSelect: vi.fn(),
  mockInput: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));
vi.mock('@inquirer/prompts', () => ({
  select: (...args: unknown[]) => mockSelect(...args),
  input: (...args: unknown[]) => mockInput(...args),
}));

import { promptForPermission } from '../../../../../../src/presentation/cli/commands/harness/harness-output.js';

/** Like a real inquirer prompt: waits for an answer and rejects when its signal aborts. */
function waitForAbort(_config: unknown, context: { signal: AbortSignal }) {
  return new Promise((_resolve, reject) => {
    context.signal.addEventListener('abort', () =>
      reject(Object.assign(new Error('Prompt was aborted'), { name: 'AbortPromptError' }))
    );
  });
}

const item = {
  decision: {
    id: 'perm-1',
    sessionId: 'sess-1',
    taskId: 'task-1',
    action: { summary: 'npm install ms@2.1.3' },
    effects: [],
    matchedRuleIds: ['ask-dependency-change'],
  },
  approvable: true,
  scopes: [GrantScope.Once, GrantScope.Session],
} as unknown as HarnessPermissionItem;

describe('promptForPermission', () => {
  beforeEach(() => {
    for (const k of Object.keys(impls)) delete impls[k];
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= { execute: vi.fn() };
      return impls[cls.name];
    });
    mockSelect.mockReset();
    mockInput.mockReset();
  });

  it('closes the prompt when the request is answered elsewhere', async () => {
    mockSelect.mockImplementation(waitForAbort);
    impls.ListHarnessPermissionsUseCase = { execute: vi.fn().mockResolvedValue([]) };
    const out: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      out.push(a.join(' '));
    });
    try {
      await promptForPermission(item, { pollMs: 5 });
    } finally {
      spy.mockRestore();
    }
    expect(impls.ResolveHarnessPermissionUseCase).toBeUndefined();
    expect(out.join('\n')).toContain('Answered in another window');
  });

  it('answers the request when the person chooses here', async () => {
    mockSelect.mockResolvedValue(GrantScope.Once);
    mockInput.mockResolvedValue('');
    impls.ListHarnessPermissionsUseCase = { execute: vi.fn().mockResolvedValue([item]) };
    await promptForPermission(item, { pollMs: 5 });
    expect(impls.ResolveHarnessPermissionUseCase.execute).toHaveBeenCalledWith({
      id: 'perm-1',
      allow: true,
      scope: GrantScope.Once,
      resolvedBy: 'cli',
    });
  });
});
