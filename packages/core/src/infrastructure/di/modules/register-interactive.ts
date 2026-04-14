import type { DependencyContainer } from 'tsyringe';

import { StartInteractiveSessionUseCase } from '../../../application/use-cases/interactive/start-interactive-session.use-case.js';
import { SendInteractiveMessageUseCase } from '../../../application/use-cases/interactive/send-interactive-message.use-case.js';
import { StopInteractiveSessionUseCase } from '../../../application/use-cases/interactive/stop-interactive-session.use-case.js';
import { GetInteractiveChatStateUseCase } from '../../../application/use-cases/interactive/get-interactive-chat-state.use-case.js';
import { RespondToInteractionUseCase } from '../../../application/use-cases/interactive/respond-to-interaction.use-case.js';
import { RunWorkflowUseCase } from '../../../application/use-cases/workflows/run-workflow.use-case.js';
import { ForceStopWorkflowStepUseCase } from '../../../application/use-cases/workflows/force-stop-workflow-step.use-case.js';

/**
 * Register interactive-session use cases, workflow runner, and their
 * string-token aliases for web routes.
 *
 * The eager `IInteractiveSessionService` instance is constructed in
 * `container.ts` because it needs boot-time recovery state.
 */
export function registerInteractive(container: DependencyContainer): void {
  container.registerSingleton(StartInteractiveSessionUseCase);
  container.registerSingleton(SendInteractiveMessageUseCase);
  container.registerSingleton(StopInteractiveSessionUseCase);
  container.registerSingleton(GetInteractiveChatStateUseCase);
  container.registerSingleton(RespondToInteractionUseCase);

  // String-token aliases for web routes (Turbopack can't resolve .js→.ts
  // imports inside @shepai/core, so routes use string tokens instead of class refs)
  container.register('StartInteractiveSessionUseCase', {
    useFactory: (c) => c.resolve(StartInteractiveSessionUseCase),
  });
  container.register('SendInteractiveMessageUseCase', {
    useFactory: (c) => c.resolve(SendInteractiveMessageUseCase),
  });
  container.register('StopInteractiveSessionUseCase', {
    useFactory: (c) => c.resolve(StopInteractiveSessionUseCase),
  });
  container.register('GetInteractiveChatStateUseCase', {
    useFactory: (c) => c.resolve(GetInteractiveChatStateUseCase),
  });
  container.register('RespondToInteractionUseCase', {
    useFactory: (c) => c.resolve(RespondToInteractionUseCase),
  });

  container.registerSingleton(RunWorkflowUseCase);
  container.register('RunWorkflowUseCase', {
    useFactory: (c) => c.resolve(RunWorkflowUseCase),
  });

  container.registerSingleton(ForceStopWorkflowStepUseCase);
  container.register('ForceStopWorkflowStepUseCase', {
    useFactory: (c) => c.resolve(ForceStopWorkflowStepUseCase),
  });
}
