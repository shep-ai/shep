/**
 * TUI Command (specs 142, 143, 146, 147)
 *
 * Opens the full-screen terminal feature console: every feature, live, with a
 * needs-you strip and keys to approve, reject, stop, resume and read logs, to
 * open a feature's shell or followed log in a tmux / Zellij / WezTerm / kitty
 * pane, and a window per active feature (the control center). `--status`
 * prints the one-line summary for status bars instead.
 *
 * Usage: shep tui [--repo <path>] [--all] [--no-notify] [--status [plain|tmux]]
 */

import { resolve as resolvePath } from 'node:path';
import { Command } from 'commander';
import { ProcessTerminal, type Terminal } from '@mariozechner/pi-tui';
import { container } from '@/infrastructure/di/container.js';
import { GetFeatureConsoleSnapshotUseCase } from '@/application/use-cases/feature-console/get-feature-console-snapshot.use-case.js';
import { RunFeatureConsoleActionUseCase } from '@/application/use-cases/feature-console/run-feature-console-action.use-case.js';
import { GetFeatureLogTailUseCase } from '@/application/use-cases/feature-console/get-feature-log-tail.use-case.js';
import { OpenFeaturePaneUseCase } from '@/application/use-cases/feature-console/open-feature-pane.use-case.js';
import { OpenControlCenterUseCase } from '@/application/use-cases/feature-console/open-control-center.use-case.js';
import { UpdateMultiplexerStatusUseCase } from '@/application/use-cases/feature-console/update-multiplexer-status.use-case.js';
import { GetFeatureChatUseCase } from '@/application/use-cases/feature-console/get-feature-chat.use-case.js';
import { SendFeatureChatMessageUseCase } from '@/application/use-cases/feature-console/send-feature-chat-message.use-case.js';
import { AnswerFeatureChatQuestionUseCase } from '@/application/use-cases/feature-console/answer-feature-chat-question.use-case.js';
import { StopFeatureChatsUseCase } from '@/application/use-cases/feature-console/stop-feature-chats.use-case.js';
import { ReportHostActivityUseCase } from '@/application/use-cases/agent-activity/report-host-activity.use-case.js';
import type { GetFeatureConsoleSnapshotInput } from '@/application/use-cases/feature-console/feature-console.types.js';
import { normalizeRepositoryPath } from '@/domain/shared/repository-path.js';
import {
  runFeatureConsole,
  type FeatureConsoleAppDeps,
} from '../../tui/feature-console/feature-console.app.js';
import { FullscreenTerminal } from '../../tui/feature-console/fullscreen-terminal.js';
import { runInline } from '../../tui/feature-console/run-inline.js';
import { terminalNotification } from '../../tui/feature-console/terminal-notification.js';
import {
  StatusSegmentStyle,
  formatStatusSegment,
} from '../../tui/feature-console/status-segment.js';
import { getTuiI18n } from '../../tui/i18n.js';
import { getCliI18n } from '../i18n.js';
import { messages } from '../ui/index.js';

interface TuiOptions {
  repo?: string;
  all?: boolean;
  /** Commander sets this to false for --no-notify. */
  notify: boolean;
  /** `true` for a bare --status, else the style named. */
  status?: string | true;
}

const STATUS_STYLES = Object.values(StatusSegmentStyle) as string[];

/** Variables a pane must share with the console so its shep commands read the same data. */
const PANE_ENVIRONMENT_VARIABLES = ['SHEP_HOME'] as const;
const NOTIFICATION_TITLE = 'shep';

interface ConsoleUseCases {
  snapshot: Pick<GetFeatureConsoleSnapshotUseCase, 'execute'>;
  action: Pick<RunFeatureConsoleActionUseCase, 'execute'>;
  logTail: Pick<GetFeatureLogTailUseCase, 'execute'>;
  pane: Pick<OpenFeaturePaneUseCase, 'execute'>;
  controlCenter: Pick<OpenControlCenterUseCase, 'execute'>;
  multiplexerStatus: Pick<UpdateMultiplexerStatusUseCase, 'execute'>;
  chat: Pick<GetFeatureChatUseCase, 'execute'>;
  sendChat: Pick<SendFeatureChatMessageUseCase, 'execute'>;
  answerChat: Pick<AnswerFeatureChatQuestionUseCase, 'execute'>;
  stopChats: Pick<StopFeatureChatsUseCase, 'execute'>;
  hostActivity: Pick<ReportHostActivityUseCase, 'execute' | 'release'>;
}

/** Seams for tests; production uses the defaults. */
export interface TuiCommandOptions {
  isInteractive?: () => boolean;
  resolveUseCases?: () => ConsoleUseCases;
  runConsole?: (deps: FeatureConsoleAppDeps) => Promise<void>;
  createTerminal?: () => Terminal;
  err?: (line: string) => void;
  /** argv that runs this CLI, for panes that run `shep feat logs -f`. */
  shepCommand?: () => string[];
  environment?: () => Readonly<Record<string, string | undefined>>;
  runInline?: FeatureConsoleAppDeps['runInline'];
  out?: (line: string) => void;
}

const defaults: Required<TuiCommandOptions> = {
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  resolveUseCases: () => ({
    snapshot: container.resolve(GetFeatureConsoleSnapshotUseCase),
    action: container.resolve(RunFeatureConsoleActionUseCase),
    logTail: container.resolve(GetFeatureLogTailUseCase),
    pane: container.resolve(OpenFeaturePaneUseCase),
    controlCenter: container.resolve(OpenControlCenterUseCase),
    multiplexerStatus: container.resolve(UpdateMultiplexerStatusUseCase),
    chat: container.resolve(GetFeatureChatUseCase),
    sendChat: container.resolve(SendFeatureChatMessageUseCase),
    answerChat: container.resolve(AnswerFeatureChatQuestionUseCase),
    stopChats: container.resolve(StopFeatureChatsUseCase),
    hostActivity: container.resolve(ReportHostActivityUseCase),
  }),
  runConsole: runFeatureConsole,
  createTerminal: () => new FullscreenTerminal(new ProcessTerminal()),
  err: (line) => messages.error(line),
  shepCommand: () => [process.execPath, ...process.execArgv, process.argv[1]],
  environment: () => process.env,
  runInline: (plan) => runInline(plan),
  out: (line) => process.stdout.write(`${line}\n`),
};

export function createTuiCommand(overrides: TuiCommandOptions = {}): Command {
  const deps = { ...defaults, ...overrides };
  const t = getCliI18n().t;
  return new Command('tui')
    .description(t('cli:commands.tui.description'))
    .option('--repo <path>', t('cli:commands.tui.repoOption'))
    .option('--all', t('cli:commands.tui.allOption'))
    .option('--no-notify', t('cli:commands.tui.noNotifyOption'))
    .option('--status [style]', t('cli:commands.tui.statusOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep tui                 Every feature, live
  $ shep tui --repo .        Only features of the current repository
  $ shep tui --all           Include archived features
  $ shep tui --no-notify     No bell or terminal notification when a feature needs you
  $ shep tui --status tmux   One line for tmux's status-right, then exit

Inside tmux, Zellij, WezTerm or kitty, t opens a shell and f follows the agent
log in a split pane (T / F: a new window). Set SHEP_MULTIPLEXER=none to run
them in this terminal instead. C opens a window per active feature, named with
its state. o attaches to a feature's agent chat (esc returns). Inside tmux the
console sets @shep_status for status-right:
  set -g status-right '#{@shep_status}'`
    )
    .action(async (options: TuiOptions) => {
      const tuiT = getTuiI18n().t;
      const useCases = deps.resolveUseCases();
      const scope: GetFeatureConsoleSnapshotInput = {
        ...(options.repo && {
          repositoryPath: normalizeRepositoryPath(resolvePath(options.repo)),
        }),
        ...(options.all && { includeArchived: true }),
      };

      if (options.status !== undefined) {
        const style = options.status === true ? StatusSegmentStyle.Plain : options.status;
        if (!STATUS_STYLES.includes(style)) {
          deps.err(
            t('cli:commands.tui.unknownStatusStyle', { style, styles: STATUS_STYLES.join(', ') })
          );
          process.exitCode = 1;
          return;
        }
        const { summary } = await useCases.snapshot.execute(scope);
        deps.out(formatStatusSegment(summary, tuiT, style as StatusSegmentStyle));
        return;
      }

      if (!deps.isInteractive()) {
        deps.err(tuiT('tui:console.notTty'));
        process.exitCode = 1;
        return;
      }

      const env = deps.environment();
      const paneEnvironment = Object.fromEntries(
        PANE_ENVIRONMENT_VARIABLES.flatMap((name) => (env[name] ? [[name, env[name]]] : []))
      ) as Record<string, string>;
      const terminal = deps.createTerminal();

      await deps.runConsole({
        t: tuiT,
        terminal,
        loadSnapshot: () => useCases.snapshot.execute(scope),
        runAction: (featureId, action, feedback) =>
          useCases.action.execute({ featureId, action, feedback }),
        loadLogTail: (featureId, maxLines) => useCases.logTail.execute(featureId, maxLines),
        openPane: (featureId, content, placement) =>
          useCases.pane.execute({
            featureId,
            content,
            placement,
            shepCommand: deps.shepCommand(),
            environment: paneEnvironment,
          }),
        runInline: deps.runInline,
        openControlCenter: (features) =>
          useCases.controlCenter.execute({
            features,
            shepCommand: deps.shepCommand(),
            environment: paneEnvironment,
          }),
        updateMultiplexer: (input) => useCases.multiplexerStatus.execute(input),
        loadChat: (featureId, maxEntries) => useCases.chat.execute({ featureId, maxEntries }),
        sendChatMessage: (featureId, content) => useCases.sendChat.execute({ featureId, content }),
        answerChatQuestion: (featureId, answers) =>
          useCases.answerChat.execute({ featureId, answers }),
        stopChats: (featureIds) => useCases.stopChats.execute(featureIds),
        reportActivity: (report) => useCases.hostActivity.execute(report),
        releaseActivity: () => useCases.hostActivity.release(),
        ...(options.notify && {
          notify: (message: string) =>
            terminal.write(terminalNotification(env, NOTIFICATION_TITLE, message)),
        }),
      });
    });
}
