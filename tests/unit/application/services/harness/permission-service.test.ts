import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GrantScope,
  PermissionEffect as E,
  PermissionRequestStatus,
  ToolReadWriteMode,
  type HarnessPermissionsConfig,
} from '@/domain/generated/output.js';
import {
  HardDenyNotApprovableError,
  PermissionAlreadyResolvedError,
  PermissionService,
  type PermissionRequest,
} from '@/application/services/harness/permission-service.js';
import { YamlPolicyEngine } from '@/infrastructure/services/harness/policy/yaml-policy-engine.js';
import { ShellCommandInspector } from '@/infrastructure/services/harness/policy/shell-command-inspector.js';
import {
  createHarnessTestStore,
  type HarnessTestStore,
} from '../../../../helpers/harness/harness-test-store.js';

const REPO = join(tmpdir(), 'perm-repo');
const CONFIG: HarnessPermissionsConfig = {
  defaultUnknown: E.Ask,
  nonInteractiveAsk: E.Deny,
  approvalTimeoutMs: 60_000,
};

describe('PermissionService', () => {
  let store: HarnessTestStore;
  let clock: number;
  let service: PermissionService;
  const inspector = new ShellCommandInspector();

  const request = (cmd: string, overrides: Partial<PermissionRequest> = {}): PermissionRequest => {
    const { resources, effects } = inspector.inspect(cmd, REPO, REPO);
    return {
      sessionId: 's1',
      taskId: 't1',
      action: {
        capabilityId: 'run_command',
        actionClass: ToolReadWriteMode.SideEffect,
        summary: cmd,
        intent: 'verify the token',
      },
      resources,
      effects,
      repoRoot: REPO,
      interactive: true,
      config: CONFIG,
      ...overrides,
    };
  };

  beforeEach(async () => {
    store = await createHarnessTestStore();
    clock = 0;
    service = new PermissionService(new YamlPolicyEngine(), store.permissions, store.events, {
      pollMs: 1000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
  });
  afterEach(() => store.close());

  it('allows a safe command immediately and persists exactly one decision', async () => {
    const d = await service.evaluate(request('pnpm test'));
    expect(d).toMatchObject({
      result: E.Allow,
      status: PermissionRequestStatus.Resolved,
      resolvedBy: 'policy',
    });
    expect(await store.permissions.listBySession('s1')).toHaveLength(1);
  });

  it('denies git push with the matched rule and never asks', async () => {
    const d = await service.evaluate(request('git push origin HEAD'));
    expect(d).toMatchObject({
      result: E.Deny,
      matchedRuleIds: expect.arrayContaining(['deny-git-push']),
    });
    expect(await store.permissions.listPending()).toEqual([]);
  });

  it('non-interactive runs turn ask into the configured effect', async () => {
    const d = await service.evaluate(request('pnpm add jsonwebtoken@9', { interactive: false }));
    expect(d).toMatchObject({
      result: E.Deny,
      reasonCode: 'non_interactive',
      resolvedBy: 'non_interactive',
    });
  });

  it('asks, waits, and returns the person’s answer with their note', async () => {
    let pendingId = '';
    const onPending = async (p: { id: string }) => {
      pendingId = p.id;
      // A person answers while the service is waiting.
      setTimeout(() => {
        void service.resolve({
          id: p.id,
          effect: E.Deny,
          note: 'use jose instead',
          scope: GrantScope.Once,
        });
      }, 0);
    };
    let rounds = 0;
    service = new PermissionService(new YamlPolicyEngine(), store.permissions, store.events, {
      pollMs: 1000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
        rounds++;
        await new Promise((r) => setTimeout(r, 5));
      },
    });
    const d = await service.evaluate(request('pnpm add jsonwebtoken@9', { onPending }));
    expect(d.id).toBe(pendingId);
    expect(d).toMatchObject({ result: E.Deny, resolvedBy: 'user', note: 'use jose instead' });
    expect(rounds).toBeGreaterThan(0);
    const events = (await store.events.listAfter('s1', 0)).map((e) => e.type);
    expect(events).toEqual(['permission.requested', 'permission.resolved']);
    const requested = (await store.events.listAfter('s1', 0))[0].payload;
    expect(requested).toMatchObject({
      summary: 'pnpm add jsonwebtoken@9',
      intent: 'verify the token',
      effects: [
        'Download packages from the package registry',
        'Change dependencies (package.json and the lockfile)',
        'May run package install scripts',
      ],
    });
  });

  it('denies with approval_timeout when nobody answers', async () => {
    const d = await service.evaluate(request('curl https://example.com'));
    expect(d).toMatchObject({
      result: E.Deny,
      reasonCode: 'approval_timeout',
      resolvedBy: 'timeout',
    });
    expect(clock).toBeGreaterThanOrEqual(CONFIG.approvalTimeoutMs);
  });

  it('denies with aborted when the run is stopped while waiting', async () => {
    const ac = new AbortController();
    ac.abort();
    const d = await service.evaluate(
      request('curl https://example.com', { abortSignal: ac.signal })
    );
    expect(d).toMatchObject({ result: E.Deny, reasonCode: 'aborted' });
  });

  it('a task grant auto-allows the same action later in the same task only', async () => {
    const first = await service.evaluate(
      request('pnpm add jsonwebtoken@9', {
        onPending: (p) => {
          void service.resolve({ id: p.id, effect: E.Allow, scope: GrantScope.Task });
        },
      })
    );
    expect(first.result).toBe(E.Allow);
    const again = await service.evaluate(request('pnpm add jsonwebtoken@9'));
    expect(again).toMatchObject({ result: E.Allow, resolvedBy: 'grant', scope: GrantScope.Task });
    const otherTask = await service.evaluate(
      request('pnpm add jsonwebtoken@9', { taskId: 't2', interactive: false })
    );
    expect(otherTask.result).toBe(E.Deny);
  });

  it('a once grant is consumed after one use', async () => {
    await store.permissions.putGrant({
      id: 'g',
      sessionId: 's1',
      scope: GrantScope.Once,
      capabilityId: 'run_command',
      actionPattern: 'run_command:pnpm add zod',
      consumed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect((await service.evaluate(request('pnpm add zod'))).result).toBe(E.Allow);
    expect((await service.evaluate(request('pnpm add zod', { interactive: false }))).result).toBe(
      E.Deny
    );
  });

  it('a grant never lifts a deny', async () => {
    await store.permissions.putGrant({
      id: 'g',
      sessionId: 's1',
      scope: GrantScope.Session,
      capabilityId: 'run_command',
      actionPattern: 'run_command:git push origin HEAD',
      consumed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect((await service.evaluate(request('git push origin HEAD'))).result).toBe(E.Deny);
  });

  it('resolving twice fails; only one resolution wins', async () => {
    const pending = await new Promise<string>((resolve) => {
      void service.evaluate(request('curl https://x.dev', { onPending: (p) => resolve(p.id) }));
    });
    const results = await Promise.allSettled([
      service.resolve({ id: pending, effect: E.Allow }),
      service.resolve({ id: pending, effect: E.Deny }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(PermissionAlreadyResolvedError);
  });

  it('refuses to approve a hard-denied pending request', async () => {
    await store.permissions.putPermission({
      id: 'hard',
      sessionId: 's1',
      taskId: 't1',
      action: {
        capabilityId: 'run_command',
        actionClass: ToolReadWriteMode.SideEffect,
        summary: 'x',
      },
      resources: [],
      effects: [],
      result: E.Ask,
      status: PermissionRequestStatus.Pending,
      matchedRuleIds: ['some-hard-ask'],
      hard: true,
      reasonCode: 'policy_match',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(service.resolve({ id: 'hard', effect: E.Allow })).rejects.toBeInstanceOf(
      HardDenyNotApprovableError
    );
  });
});
