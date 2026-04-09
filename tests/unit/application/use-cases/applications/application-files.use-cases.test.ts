import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ListApplicationFilesUseCase } from '../../../../../packages/core/src/application/use-cases/applications/list-application-files.use-case.js';
import { ReadApplicationFileUseCase } from '../../../../../packages/core/src/application/use-cases/applications/read-application-file.use-case.js';
import { WriteApplicationFileUseCase } from '../../../../../packages/core/src/application/use-cases/applications/write-application-file.use-case.js';
import { WatchApplicationFilesUseCase } from '../../../../../packages/core/src/application/use-cases/applications/watch-application-files.use-case.js';

import type { IApplicationRepository } from '../../../../../packages/core/src/application/ports/output/repositories/application-repository.interface.js';
import type {
  IApplicationFileSystemService,
  FileChangeEvent,
} from '../../../../../packages/core/src/application/ports/output/services/application-file-system-service.interface.js';
import type { Application } from '../../../../../packages/core/src/domain/generated/output.js';

const APP_ID = 'app-1';
const ROOT = '/work/repo';

function makeApp(): Application {
  return {
    id: APP_ID,
    name: 'demo',
    repositoryPath: ROOT,
    additionalPaths: [],
    status: 'Idle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Application;
}

function makeRepo(app: Application | null = makeApp()): IApplicationRepository {
  return {
    findById: vi.fn(async () => app),
  } as unknown as IApplicationRepository;
}

function makeFs(
  overrides: Partial<IApplicationFileSystemService> = {}
): IApplicationFileSystemService {
  return {
    listTree: vi.fn(async () => ({
      name: 'repo',
      path: '',
      isDirectory: true,
      children: [],
    })),
    readFile: vi.fn(async () => ({ path: 'a.txt', content: 'hello', size: 5 })),
    readFileBuffer: vi.fn(async () => ({
      path: 'pic.png',
      buffer: Buffer.from([0]),
      size: 1,
      mimeType: 'image/png',
    })),
    writeFile: vi.fn(async () => undefined),
    watch: vi.fn(() => () => {
      /* unsubscribe noop for tests */
    }),
    ...overrides,
  };
}

describe('ListApplicationFilesUseCase', () => {
  let repo: IApplicationRepository;
  let fs: IApplicationFileSystemService;
  let useCase: ListApplicationFilesUseCase;

  beforeEach(() => {
    repo = makeRepo();
    fs = makeFs();
    useCase = new ListApplicationFilesUseCase(repo, fs);
  });

  it("lists the application's repository tree", async () => {
    const tree = await useCase.execute({ applicationId: APP_ID });
    expect(repo.findById).toHaveBeenCalledWith(APP_ID);
    expect(fs.listTree).toHaveBeenCalledWith(ROOT);
    expect(tree.isDirectory).toBe(true);
  });

  it('throws when the application does not exist', async () => {
    useCase = new ListApplicationFilesUseCase(makeRepo(null), fs);
    await expect(useCase.execute({ applicationId: 'missing' })).rejects.toThrow(
      /application not found/i
    );
    expect(fs.listTree).not.toHaveBeenCalled();
  });
});

describe('ReadApplicationFileUseCase', () => {
  let repo: IApplicationRepository;
  let fs: IApplicationFileSystemService;
  let useCase: ReadApplicationFileUseCase;

  beforeEach(() => {
    repo = makeRepo();
    fs = makeFs();
    useCase = new ReadApplicationFileUseCase(repo, fs);
  });

  it('reads a file relative to the repository root', async () => {
    const result = await useCase.execute({ applicationId: APP_ID, path: 'src/a.ts' });
    expect(fs.readFile).toHaveBeenCalledWith(ROOT, 'src/a.ts');
    expect(result.content).toBe('hello');
  });

  it('rejects empty paths', async () => {
    await expect(useCase.execute({ applicationId: APP_ID, path: '' })).rejects.toThrow(
      /path is required/i
    );
  });

  it('throws when the application does not exist', async () => {
    useCase = new ReadApplicationFileUseCase(makeRepo(null), fs);
    await expect(useCase.execute({ applicationId: 'missing', path: 'a.ts' })).rejects.toThrow(
      /application not found/i
    );
  });
});

describe('WriteApplicationFileUseCase', () => {
  let repo: IApplicationRepository;
  let fs: IApplicationFileSystemService;
  let useCase: WriteApplicationFileUseCase;

  beforeEach(() => {
    repo = makeRepo();
    fs = makeFs();
    useCase = new WriteApplicationFileUseCase(repo, fs);
  });

  it('writes content to a file relative to the repository root', async () => {
    await useCase.execute({ applicationId: APP_ID, path: 'src/a.ts', content: 'x' });
    expect(fs.writeFile).toHaveBeenCalledWith(ROOT, 'src/a.ts', 'x');
  });

  it('rejects empty paths', async () => {
    await expect(
      useCase.execute({ applicationId: APP_ID, path: '', content: 'x' })
    ).rejects.toThrow(/path is required/i);
  });

  it('allows empty file content (clearing a file)', async () => {
    await useCase.execute({ applicationId: APP_ID, path: 'a.ts', content: '' });
    expect(fs.writeFile).toHaveBeenCalledWith(ROOT, 'a.ts', '');
  });

  it('throws when the application does not exist', async () => {
    useCase = new WriteApplicationFileUseCase(makeRepo(null), fs);
    await expect(
      useCase.execute({ applicationId: 'missing', path: 'a.ts', content: 'x' })
    ).rejects.toThrow(/application not found/i);
  });
});

describe('WatchApplicationFilesUseCase', () => {
  let repo: IApplicationRepository;

  beforeEach(() => {
    repo = makeRepo();
  });

  it('subscribes to file changes under the application root', async () => {
    const unsubscribe = vi.fn();
    const fs = makeFs({ watch: vi.fn(() => unsubscribe) });
    const useCase = new WatchApplicationFilesUseCase(repo, fs);

    const events: FileChangeEvent[] = [];
    const stop = await useCase.execute({ applicationId: APP_ID, onEvent: (e) => events.push(e) });

    expect(fs.watch).toHaveBeenCalled();
    const [rootArg, listenerArg] = (fs.watch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, (e: FileChangeEvent) => void];
    expect(rootArg).toBe(ROOT);

    listenerArg({ kind: 'modified', path: 'a.ts', isDirectory: false });
    expect(events).toEqual([{ kind: 'modified', path: 'a.ts', isDirectory: false }]);

    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('throws when the application does not exist', async () => {
    const fs = makeFs();
    const useCase = new WatchApplicationFilesUseCase(makeRepo(null), fs);
    await expect(
      useCase.execute({
        applicationId: 'missing',
        onEvent: () => {
          /* unused */
        },
      })
    ).rejects.toThrow(/application not found/i);
    expect(fs.watch).not.toHaveBeenCalled();
  });
});
