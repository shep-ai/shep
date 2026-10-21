/**
 * RunApplicationSetupUseCase unit tests
 *
 * The scaffold empties its target directory, `.git` included. Creation asks for
 * that on a folder it just made; a retry ("Try again") must never delete what is
 * already there — the user may have kept building after setup failed — so it
 * keeps existing files and continues with the agent workflow.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RunApplicationSetupUseCase } from '@/application/use-cases/applications/run-application-setup.use-case.js';
import type { IApplicationScaffolder } from '@/application/ports/output/services/application-scaffolder.interface.js';
import type { IApplicationCreationPromptBuilder } from '@/application/ports/output/services/application-creation-prompt-builder.interface.js';
import type { IApplicationBriefStore } from '@/application/ports/output/services/application-brief-store.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IOperationLogRepository } from '@/application/ports/output/repositories/operation-log.repository.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { RunWorkflowUseCase } from '@/application/use-cases/workflows/run-workflow.use-case.js';
import { BunShadcnScaffolder } from '@/infrastructure/services/scaffolding/bun-shadcn-scaffolder.service.js';
import { ApplicationStatus, type Application } from '@/domain/generated/output.js';
import { createMockApplicationRepository } from '../../../../helpers/application-repository.mock.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function projectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shep-setup-retry-'));
  dirs.push(dir);
  return dir;
}

function setup(scaffolder: IApplicationScaffolder, repositoryPath = '/wt') {
  const appRepo = createMockApplicationRepository();
  const runWorkflow = {
    execute: vi.fn().mockResolvedValue({ completed: true }),
  } as unknown as RunWorkflowUseCase;
  const useCase = new RunApplicationSetupUseCase(
    appRepo,
    {
      build: vi.fn(({ description }) => ({ systemPrompt: 'SYS', userMessage: description })),
    } as unknown as IApplicationCreationPromptBuilder,
    { write: vi.fn().mockResolvedValue('/briefs/app-1.md') } as unknown as IApplicationBriefStore,
    runWorkflow,
    {
      findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
    } as unknown as IInteractiveSessionRepository,
    scaffolder,
    { append: vi.fn().mockResolvedValue(undefined) } as unknown as IOperationLogRepository,
    { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as ILogger
  );
  const application = {
    id: 'app-1',
    name: 'Shop',
    repositoryPath,
    status: ApplicationStatus.Idle,
  } as Application;
  return { useCase, appRepo, runWorkflow, application };
}

function fakeScaffolder(hasExistingContent: boolean) {
  return {
    scaffold: vi
      .fn()
      .mockResolvedValue({ repositoryPath: '/wt', templateFiles: [], templateVersion: '' }),
    hasExistingContent: vi.fn().mockResolvedValue(hasExistingContent),
  };
}

describe('RunApplicationSetupUseCase', () => {
  describe('keepExistingFiles: true (a retry)', () => {
    it('keeps a project that has files and a git repo, and still runs the workflow', async () => {
      const dir = projectDir();
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, windowsHide: true });
      writeFileSync(join(dir, 'App.tsx'), 'export const App = () => null;\n');
      const scaffolder = new BunShadcnScaffolder();
      // The real content check runs; a scaffold here would wipe the folder.
      const scaffold = vi
        .spyOn(scaffolder, 'scaffold')
        .mockRejectedValue(new Error('must not run'));
      const { useCase, application, runWorkflow, appRepo } = setup(scaffolder, dir);

      await useCase.execute({
        application,
        initialPrompt: 'build a shop',
        keepExistingFiles: true,
      });

      expect(scaffold).not.toHaveBeenCalled();
      expect(readFileSync(join(dir, 'App.tsx'), 'utf8')).toContain('App');
      expect(existsSync(join(dir, '.git'))).toBe(true);
      expect(runWorkflow.execute).toHaveBeenCalledOnce();
      expect(appRepo.update).toHaveBeenCalledWith('app-1', { setupComplete: true });
    });

    it('scaffolds when there is nothing to keep', async () => {
      const scaffolder = fakeScaffolder(false);
      const { useCase, application, runWorkflow } = setup(scaffolder);

      await useCase.execute({
        application,
        initialPrompt: 'build a shop',
        keepExistingFiles: true,
      });

      expect(scaffolder.scaffold).toHaveBeenCalledOnce();
      expect(runWorkflow.execute).toHaveBeenCalledOnce();
    });
  });

  describe('keepExistingFiles: false (creation)', () => {
    it('scaffolds without asking — the folder was just created for it', async () => {
      const scaffolder = fakeScaffolder(true);
      const { useCase, application } = setup(scaffolder);

      await useCase.execute({
        application,
        initialPrompt: 'build a shop',
        keepExistingFiles: false,
      });

      expect(scaffolder.hasExistingContent).not.toHaveBeenCalled();
      expect(scaffolder.scaffold).toHaveBeenCalledOnce();
    });
  });

  it('does not mark setup complete, or failed, when the workflow stopped without finishing', async () => {
    const { useCase, application, runWorkflow, appRepo } = setup(fakeScaffolder(false));
    vi.mocked(runWorkflow.execute).mockResolvedValue({ completed: false });

    await useCase.execute({ application, initialPrompt: 'build a shop', keepExistingFiles: false });

    expect(appRepo.update).not.toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({ setupComplete: true })
    );
    expect(appRepo.updateStatus).not.toHaveBeenCalled();
  });
});
