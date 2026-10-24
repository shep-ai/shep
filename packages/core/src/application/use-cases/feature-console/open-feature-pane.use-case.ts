/**
 * Open Feature Pane Use Case (spec 143)
 *
 * The feature console's t/T/f/F keys. Resolves the feature (by id or id
 * prefix), picks the directory a pane starts in (the worktree on disk, else
 * the repository), and builds what it runs: the user's shell, or
 * `shep feat logs -f <id>`. Inside a terminal multiplexer it opens a pane;
 * without one it returns an inline plan the caller runs in its own terminal.
 * Never throws: every outcome is a result the console can show.
 */

import { inject, injectable } from 'tsyringe';
import {
  FeaturePaneContent,
  FeaturePaneOutcome,
  FeaturePanePlacement,
  type TerminalMultiplexer,
} from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { ITerminalPaneLauncher } from '../../ports/output/services/terminal-pane-launcher.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';
import { FEATURE_SHORT_ID_LENGTH } from './feature-console.types.js';
import { findFeatureByIdOrPrefix } from './find-feature.js';
import { resolveFeatureDirectory } from './feature-directory.js';

export interface OpenFeaturePaneInput {
  /** Feature id or id prefix. */
  featureId: string;
  content: FeaturePaneContent;
  placement: FeaturePanePlacement;
  /** argv that runs this shep CLI; the log pane runs `<shepCommand> feat logs -f <id>`. */
  shepCommand: readonly string[];
  /** Variables the pane must share with the caller, such as SHEP_HOME. */
  environment?: Readonly<Record<string, string>>;
  /** Name for the pane or window; defaults to `shep <short id>` (plus `log`). */
  title?: string;
}

export type OpenFeaturePaneResult =
  | {
      outcome: FeaturePaneOutcome.Opened;
      multiplexer: TerminalMultiplexer;
      /** The new pane or window id, where the multiplexer prints one (spec 146). */
      windowId?: string;
      message: string;
    }
  | { outcome: FeaturePaneOutcome.Inline; cwd: string; command: string[]; message: string }
  | { outcome: FeaturePaneOutcome.Failed; message: string };

const FOLLOW_LOG_ARGS = ['feat', 'logs', '-f'] as const;
const PANE_TITLE_PREFIX = 'shep';
const LOG_TITLE_SUFFIX = 'log';

const CONTENT_PHRASE: Record<FeaturePaneContent, (name: string) => string> = {
  [FeaturePaneContent.Shell]: (name) => `a shell for ${name}`,
  [FeaturePaneContent.Log]: (name) => `the log of ${name}`,
};

@injectable()
export class OpenFeaturePaneUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IWorktreePathProvider')
    private readonly worktreePaths: IWorktreePathProvider,
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService,
    @inject('ITerminalPaneLauncher')
    private readonly launcher: ITerminalPaneLauncher
  ) {}

  async execute(input: OpenFeaturePaneInput): Promise<OpenFeaturePaneResult> {
    try {
      const feature = await findFeatureByIdOrPrefix(this.featureRepo, input.featureId);
      if (!feature) return failed(`Feature not found: ${input.featureId}`);

      const isLog = input.content === FeaturePaneContent.Log;
      if (isLog && !feature.agentRunId) return failed(`${feature.name} has no agent run yet.`);

      const cwd = resolveFeatureDirectory(feature, this.worktreePaths, this.fileSystem);
      const command = isLog ? [...input.shepCommand, ...FOLLOW_LOG_ARGS, feature.id] : undefined;
      const what = CONTENT_PHRASE[input.content](feature.name);

      const multiplexer = this.launcher.detect();
      if (!multiplexer) {
        return {
          outcome: FeaturePaneOutcome.Inline,
          cwd,
          command: command ?? this.launcher.defaultShell(),
          message: `No terminal multiplexer: running ${what} here`,
        };
      }

      const shortId = feature.id.slice(0, FEATURE_SHORT_ID_LENGTH);
      const opened = await this.launcher.open({
        multiplexer,
        placement: input.placement,
        cwd,
        title:
          input.title ??
          [PANE_TITLE_PREFIX, shortId, ...(isLog ? [LOG_TITLE_SUFFIX] : [])].join(' '),
        ...(command && { command }),
        environment: input.environment ?? {},
        // A shell is for typing in; a log is for watching beside the console.
        focus: !isLog,
      });
      return {
        outcome: FeaturePaneOutcome.Opened,
        multiplexer,
        ...(opened.id && { windowId: opened.id }),
        message: `Opened ${what} in ${multiplexer}`,
      };
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error));
    }
  }
}

function failed(message: string): OpenFeaturePaneResult {
  return { outcome: FeaturePaneOutcome.Failed, message };
}
