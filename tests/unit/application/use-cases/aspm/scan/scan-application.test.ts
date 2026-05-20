import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ScanApplicationUseCase } from '@/application/use-cases/aspm/scan/scan-application';
import {
  ApplicationStatus,
  ScanStageName,
  ScanStageStatus,
  ScanStatus,
  ScanTrigger,
  type Application,
  type SecurityFinding,
} from '@/domain/generated/output';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface';
import type { IScanRunRepository } from '@/application/ports/output/repositories/scan-run-repository.interface';
import type { IExploitIntelPort } from '@/application/ports/output/services/exploit-intel-port.interface';
import type { IOwnershipYamlReader } from '@/application/ports/output/services/ownership-yaml-reader.interface';
import type { IGitOwnershipPort } from '@/application/ports/output/services/git-ownership-port.interface';
import type { IOsvVulnerabilityPort } from '@/application/ports/output/services/osv-vulnerability-port.interface';
import type { IFileTreeReaderPort } from '@/application/ports/output/services/file-tree-reader-port.interface';
import type { IAgentSecurityAnalyzer } from '@/application/ports/output/services/agent-security-analyzer-port.interface';

function makeApp(overrides: Partial<Application> = {}): Application {
  const now = new Date('2026-05-20T15:00:00Z');
  return {
    id: randomUUID(),
    name: 'test',
    slug: 'test',
    description: '',
    repositoryPath: '/tmp/repo',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<{
    appRepo: IApplicationRepository;
    findingRepo: IFindingRepository;
    scanRunRepo: IScanRunRepository;
    exploitIntel: IExploitIntelPort;
    ownershipReader: IOwnershipYamlReader;
    gitOwnership: IGitOwnershipPort;
    osv: IOsvVulnerabilityPort;
    fileReader: IFileTreeReaderPort;
    sast: IAgentSecurityAnalyzer;
    container: IAgentSecurityAnalyzer;
    iac: IAgentSecurityAnalyzer;
  }> = {}
) {
  const app = makeApp();
  const savedRuns: Parameters<IScanRunRepository['save']>[0][] = [];
  const inserts: SecurityFinding[][] = [];
  const updates: { id: string; fields: Partial<Application> }[] = [];

  const deps = {
    app,
    savedRuns,
    inserts,
    updates,
    appRepo:
      overrides.appRepo ??
      ({
        findById: async () => app,
        update: async (id: string, fields: Partial<Application>) => {
          updates.push({ id, fields });
        },
        create: async () => undefined,
        findBySlug: async () => null,
        findByPath: async () => null,
        list: async () => [],
        softDelete: async () => undefined,
        restore: async () => undefined,
      } as unknown as IApplicationRepository),
    findingRepo:
      overrides.findingRepo ??
      ({
        bulkInsertOrIgnore: async (findings: SecurityFinding[]) => {
          inserts.push(findings);
          return { inserted: findings.length, duplicates: 0 };
        },
      } as unknown as IFindingRepository),
    scanRunRepo:
      overrides.scanRunRepo ??
      ({
        save: async (run: Parameters<IScanRunRepository['save']>[0]) => {
          savedRuns.push(run);
        },
        findById: async () => null,
        listLatestForApplication: async () => [],
        findLatestForApplication: async () => null,
      } as IScanRunRepository),
    exploitIntel:
      overrides.exploitIntel ??
      ({
        isKev: async () => false,
        getEpssPercentile: async () => null,
      } as unknown as IExploitIntelPort),
    ownershipReader:
      overrides.ownershipReader ??
      ({ read: async () => ({ entries: [] }) } as unknown as IOwnershipYamlReader),
    gitOwnership: overrides.gitOwnership ?? ({ lookup: async () => [] } as IGitOwnershipPort),
    osv:
      overrides.osv ??
      ({
        query: async () => ({ vulnerabilities: [], cacheOnly: false, matchedComponents: 0 }),
      } as IOsvVulnerabilityPort),
    fileReader:
      overrides.fileReader ??
      ({
        read: async () => [
          {
            path: 'src/aws-config.ts',
            content: 'const k = "AKIAABCDEFGHIJKLMNOP";',
          },
        ],
      } as IFileTreeReaderPort),
    sast:
      overrides.sast ??
      ({ run: async () => ({ drafts: [], failed: false }) } as IAgentSecurityAnalyzer),
    container:
      overrides.container ??
      ({ run: async () => ({ drafts: [], failed: false }) } as IAgentSecurityAnalyzer),
    iac:
      overrides.iac ??
      ({ run: async () => ({ drafts: [], failed: false }) } as IAgentSecurityAnalyzer),
  };

  const usecase = new ScanApplicationUseCase(
    deps.appRepo,
    deps.findingRepo,
    deps.scanRunRepo,
    deps.exploitIntel,
    deps.ownershipReader,
    deps.gitOwnership,
    deps.osv,
    deps.fileReader,
    deps.sast,
    deps.container,
    deps.iac
  );
  return { usecase, deps };
}

describe('ScanApplicationUseCase', () => {
  beforeEach(() => undefined);

  it('runs secrets stage and persists the seeded AWS access key as a finding', async () => {
    const { usecase, deps } = makeDeps();

    const result = await usecase.execute({
      applicationId: deps.app.id,
      stagesEnabled: [ScanStageName.Secrets],
      triggeredBy: ScanTrigger.User,
    });

    expect(result.status).toBe(ScanStatus.Succeeded);
    expect(result.findingsInserted).toBe(1);
    expect(deps.savedRuns).toHaveLength(1);
    expect(deps.savedRuns[0]!.stages[0]!.status).toBe(ScanStageStatus.Succeeded);
    expect(deps.updates.at(-1)?.fields.lastScannedAt).toBeInstanceOf(Date);
  });

  it('marks the run Partial when at least one stage fails but others succeed', async () => {
    const { usecase, deps } = makeDeps({
      sast: { run: async () => ({ drafts: [], failed: true, errorMessage: 'quota exceeded' }) },
    });

    const result = await usecase.execute({
      applicationId: deps.app.id,
      stagesEnabled: [ScanStageName.Secrets, ScanStageName.Sast],
    });

    expect(result.status).toBe(ScanStatus.Partial);
    const stages = deps.savedRuns[0]!.stages;
    expect(stages.find((s) => s.name === ScanStageName.Secrets)!.status).toBe(
      ScanStageStatus.Succeeded
    );
    expect(stages.find((s) => s.name === ScanStageName.Sast)!.status).toBe(ScanStageStatus.Failed);
  });

  it('skips lastScannedAt update when the entire run fails', async () => {
    const { usecase, deps } = makeDeps({
      fileReader: {
        read: async () => [{ path: 'src/a.ts', content: 'const x = 1;' }],
      } as IFileTreeReaderPort,
      sast: { run: async () => ({ drafts: [], failed: true, errorMessage: 'boom' }) },
    });
    const result = await usecase.execute({
      applicationId: deps.app.id,
      stagesEnabled: [ScanStageName.Sast],
    });
    expect(result.status).toBe(ScanStatus.Failed);
    expect(deps.updates.find((u) => u.fields.lastScannedAt !== undefined)).toBeUndefined();
  });

  it('emits zero findings on a second run when the bulk insert reports duplicates', async () => {
    const inserts: SecurityFinding[][] = [];
    const findingRepo: IFindingRepository = {
      bulkInsertOrIgnore: async (findings: SecurityFinding[]) => {
        inserts.push(findings);
        return { inserted: 0, duplicates: findings.length };
      },
    } as unknown as IFindingRepository;
    const { usecase, deps } = makeDeps({ findingRepo });

    await usecase.execute({
      applicationId: deps.app.id,
      stagesEnabled: [ScanStageName.Secrets],
    });
    const second = await usecase.execute({
      applicationId: deps.app.id,
      stagesEnabled: [ScanStageName.Secrets],
    });

    expect(second.findingsInserted).toBe(0);
  });
});
