import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  AgentType,
  DecisionProviderKind,
  DiagnosticStatus,
  type Settings,
} from '@/domain/generated/output.js';
import { HarnessReadinessDiagnostic } from '@/application/use-cases/doctor/diagnostics/harness-readiness.diagnostic.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type {
  IHarnessEnvironmentProbe,
  IPolicyEngine,
} from '@/application/ports/output/harness/index.js';

function make(
  settings: Partial<Settings>,
  probe: Partial<IHarnessEnvironmentProbe> = {},
  issues: { file: string; message: string }[] = []
) {
  const repo = { load: async () => settings as Settings } as unknown as ISettingsRepository;
  const p: IHarnessEnvironmentProbe = {
    hasBackendCredential: () => true,
    envVarSet: () => true,
    commandAvailable: async () => true,
    storageWritable: async () => true,
    ...probe,
  };
  const policy = { listRules: async () => ({ rules: [], issues }) } as unknown as IPolicyEngine;
  return new HarnessReadinessDiagnostic(repo, p, policy);
}

const on = { featureFlags: { queryAwareHarness: true } } as Partial<Settings>;

describe('HarnessReadinessDiagnostic', () => {
  it('checks nothing while the flag is off', async () => {
    const r = await make({ featureFlags: { queryAwareHarness: false } } as Partial<Settings>, {
      storageWritable: async () => false,
    }).run();
    expect(r.status).toBe(DiagnosticStatus.Ok);
  });

  it('is ready when everything is in place', async () => {
    const r = await make(on).run();
    expect(r).toMatchObject({ status: DiagnosticStatus.Ok, name: 'harness-readiness' });
    expect(r.detail).toContain('openrouter');
  });

  it('warns on a missing credential, but blocks when the harness is the active agent', async () => {
    const missing = { hasBackendCredential: () => false };
    expect((await make(on, missing).run()).status).toBe(DiagnosticStatus.Warn);
    const active = { ...on, agent: { type: AgentType.ShepHarness } } as Partial<Settings>;
    expect((await make(active, missing).run()).status).toBe(DiagnosticStatus.Fail);
  });

  it('treats missing git as a blocker and missing ripgrep as a warning', async () => {
    const noRg = await make(on, { commandAvailable: async (c) => c !== 'rg' }).run();
    expect(noRg.status).toBe(DiagnosticStatus.Warn);
    expect(noRg.detail).toContain('ripgrep');
    const noGit = await make(on, { commandAvailable: async (c) => c !== 'git' }).run();
    expect(noGit.status).toBe(DiagnosticStatus.Fail);
  });

  it('blocks on unwritable storage or a broken policy, warns on an unreachable decision provider', async () => {
    expect((await make(on, { storageWritable: async () => false }).run()).status).toBe(
      DiagnosticStatus.Fail
    );
    expect((await make(on, {}, [{ file: 'p.yaml', message: 'bad' }]).run()).status).toBe(
      DiagnosticStatus.Fail
    );
    const withProvider = {
      ...on,
      harness: {
        decisions: {
          providers: [
            {
              id: 'jev',
              kind: DecisionProviderKind.Jev,
              endpoint: 'https://jev',
              apiKeyEnv: 'JEV_API_KEY',
            },
          ],
        },
      },
    } as Partial<Settings>;
    const r = await make(withProvider, { envVarSet: () => false }).run();
    expect(r.status).toBe(DiagnosticStatus.Warn);
    expect(r.detail).toContain('JEV_API_KEY');
  });
});
