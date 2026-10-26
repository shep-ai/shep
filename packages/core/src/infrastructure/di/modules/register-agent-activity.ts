/**
 * Agent activity (spec 148): the get / watch / wait / reply / report use cases,
 * by class (CLI, TUI, MCP) and by string token (web routes, the A2A handler),
 * the A2A request handler (by token, for the web route), and the
 * terminal-host reporter behind its port — Herdr when this process
 * runs in a Herdr pane, a no-op everywhere else.
 */

import type { DependencyContainer } from 'tsyringe';
import type { constructor } from 'tsyringe/dist/typings/types/index.js';

import type { IActivityHostReporter } from '../../../application/ports/output/services/activity-host-reporter.interface.js';
import { GetAgentActivityUseCase } from '../../../application/use-cases/agent-activity/get-agent-activity.use-case.js';
import { WatchAgentActivityUseCase } from '../../../application/use-cases/agent-activity/watch-agent-activity.use-case.js';
import { WaitForAgentActivityUseCase } from '../../../application/use-cases/agent-activity/wait-for-agent-activity.use-case.js';
import { ReplyToFeatureUseCase } from '../../../application/use-cases/agent-activity/reply-to-feature.use-case.js';
import { ReportHostActivityUseCase } from '../../../application/use-cases/agent-activity/report-host-activity.use-case.js';
import type { ExecFunction } from '../../services/git/worktree.service.js';
import {
  HerdrActivityReporter,
  herdrEnvironment,
} from '../../services/activity-host/herdr-activity-reporter.js';
import { NoopActivityReporter } from '../../services/activity-host/noop-activity-reporter.js';
import { A2aRequestHandler } from '../../services/a2a/a2a-request-handler.js';

/** Registers a use case once, under its class and under its name for string-token callers. */
function registerUseCase<T>(
  container: DependencyContainer,
  token: string,
  useCase: constructor<T>
): void {
  container.registerSingleton(useCase);
  container.register(token, { useFactory: (c) => c.resolve(useCase) });
}

export function registerAgentActivity(container: DependencyContainer): void {
  container.register<IActivityHostReporter>('IActivityHostReporter', {
    useFactory: (c) => {
      const herdr = herdrEnvironment(process.env);
      return herdr
        ? new HerdrActivityReporter(c.resolve<ExecFunction>('ExecFunction'), herdr)
        : new NoopActivityReporter();
    },
  });

  registerUseCase(container, 'GetAgentActivityUseCase', GetAgentActivityUseCase);
  registerUseCase(container, 'WatchAgentActivityUseCase', WatchAgentActivityUseCase);
  registerUseCase(container, 'WaitForAgentActivityUseCase', WaitForAgentActivityUseCase);
  registerUseCase(container, 'ReplyToFeatureUseCase', ReplyToFeatureUseCase);
  registerUseCase(container, 'ReportHostActivityUseCase', ReportHostActivityUseCase);
  registerUseCase(container, 'A2aRequestHandler', A2aRequestHandler);
}
