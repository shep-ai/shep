/**
 * `shep ps` (spec 144): the process list, stop and stats use cases, by class
 * (the CLI) and by string token (any other surface), and the ps-backed stats
 * probe behind its port.
 */

import type { DependencyContainer } from 'tsyringe';

import type { IProcessStatsProbe } from '../../../application/ports/output/services/process-stats-probe.interface.js';
import { ListShepProcessesUseCase } from '../../../application/use-cases/processes/list-shep-processes.use-case.js';
import { SampleProcessStatsUseCase } from '../../../application/use-cases/processes/sample-process-stats.use-case.js';
import { StopShepProcessUseCase } from '../../../application/use-cases/processes/stop-shep-process.use-case.js';
import { IS_WINDOWS } from '../../platform.js';
import type { ExecFunction } from '../../services/git/worktree.service.js';
import { PsProcessStatsProbe } from '../../services/process/ps-process-stats-probe.js';

export function registerProcesses(container: DependencyContainer): void {
  container.register<IProcessStatsProbe>('IProcessStatsProbe', {
    useFactory: (c) => new PsProcessStatsProbe(c.resolve<ExecFunction>('ExecFunction'), IS_WINDOWS),
  });

  container.registerSingleton(ListShepProcessesUseCase);
  container.registerSingleton(StopShepProcessUseCase);
  container.registerSingleton(SampleProcessStatsUseCase);

  container.register('ListShepProcessesUseCase', {
    useFactory: (c) => c.resolve(ListShepProcessesUseCase),
  });
  container.register('StopShepProcessUseCase', {
    useFactory: (c) => c.resolve(StopShepProcessUseCase),
  });
  container.register('SampleProcessStatsUseCase', {
    useFactory: (c) => c.resolve(SampleProcessStatsUseCase),
  });
}
