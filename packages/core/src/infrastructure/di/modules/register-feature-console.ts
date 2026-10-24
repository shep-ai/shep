/**
 * Terminal feature console (specs 142, 143, 146, 147): the snapshot, action, log-tail
 * and pane use cases, by class (the `shep tui` command) and by string token
 * (any web surface that wants the same view), and the terminal pane launcher
 * behind its port.
 *
 * Kept in its own module so `register-use-cases.ts` does not grow further.
 */

import type { DependencyContainer } from 'tsyringe';

import type { ITerminalPaneLauncher } from '../../../application/ports/output/services/terminal-pane-launcher.interface.js';
import { GetFeatureConsoleSnapshotUseCase } from '../../../application/use-cases/feature-console/get-feature-console-snapshot.use-case.js';
import { RunFeatureConsoleActionUseCase } from '../../../application/use-cases/feature-console/run-feature-console-action.use-case.js';
import { GetFeatureLogTailUseCase } from '../../../application/use-cases/feature-console/get-feature-log-tail.use-case.js';
import { OpenFeaturePaneUseCase } from '../../../application/use-cases/feature-console/open-feature-pane.use-case.js';
import { OpenControlCenterUseCase } from '../../../application/use-cases/feature-console/open-control-center.use-case.js';
import { UpdateMultiplexerStatusUseCase } from '../../../application/use-cases/feature-console/update-multiplexer-status.use-case.js';
import { GetFeatureChatUseCase } from '../../../application/use-cases/feature-console/get-feature-chat.use-case.js';
import { SendFeatureChatMessageUseCase } from '../../../application/use-cases/feature-console/send-feature-chat-message.use-case.js';
import { AnswerFeatureChatQuestionUseCase } from '../../../application/use-cases/feature-console/answer-feature-chat-question.use-case.js';
import { StopFeatureChatsUseCase } from '../../../application/use-cases/feature-console/stop-feature-chats.use-case.js';
import { IS_WINDOWS } from '../../platform.js';
import type { ExecFunction } from '../../services/git/worktree.service.js';
import { TerminalPaneLauncherService } from '../../services/terminal-pane/terminal-pane-launcher.service.js';

export function registerFeatureConsole(container: DependencyContainer): void {
  container.register<ITerminalPaneLauncher>('ITerminalPaneLauncher', {
    useFactory: (c) =>
      new TerminalPaneLauncherService(
        c.resolve<ExecFunction>('ExecFunction'),
        process.env,
        IS_WINDOWS
      ),
  });

  container.registerSingleton(GetFeatureConsoleSnapshotUseCase);
  container.registerSingleton(RunFeatureConsoleActionUseCase);
  container.registerSingleton(GetFeatureLogTailUseCase);
  container.registerSingleton(OpenFeaturePaneUseCase);
  container.registerSingleton(OpenControlCenterUseCase);
  container.registerSingleton(UpdateMultiplexerStatusUseCase);
  container.registerSingleton(GetFeatureChatUseCase);
  container.registerSingleton(SendFeatureChatMessageUseCase);
  container.registerSingleton(AnswerFeatureChatQuestionUseCase);
  container.registerSingleton(StopFeatureChatsUseCase);

  container.register('GetFeatureConsoleSnapshotUseCase', {
    useFactory: (c) => c.resolve(GetFeatureConsoleSnapshotUseCase),
  });
  container.register('RunFeatureConsoleActionUseCase', {
    useFactory: (c) => c.resolve(RunFeatureConsoleActionUseCase),
  });
  container.register('GetFeatureLogTailUseCase', {
    useFactory: (c) => c.resolve(GetFeatureLogTailUseCase),
  });
  container.register('OpenFeaturePaneUseCase', {
    useFactory: (c) => c.resolve(OpenFeaturePaneUseCase),
  });
  container.register('OpenControlCenterUseCase', {
    useFactory: (c) => c.resolve(OpenControlCenterUseCase),
  });
  container.register('UpdateMultiplexerStatusUseCase', {
    useFactory: (c) => c.resolve(UpdateMultiplexerStatusUseCase),
  });
  container.register('GetFeatureChatUseCase', {
    useFactory: (c) => c.resolve(GetFeatureChatUseCase),
  });
  container.register('SendFeatureChatMessageUseCase', {
    useFactory: (c) => c.resolve(SendFeatureChatMessageUseCase),
  });
  container.register('AnswerFeatureChatQuestionUseCase', {
    useFactory: (c) => c.resolve(AnswerFeatureChatQuestionUseCase),
  });
  container.register('StopFeatureChatsUseCase', {
    useFactory: (c) => c.resolve(StopFeatureChatsUseCase),
  });
}
