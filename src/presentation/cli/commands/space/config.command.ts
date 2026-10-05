/**
 * shep space config <space> — show or change how agents run for a space's
 * repositories (spec 121): Claude and gh config directories, git identity,
 * Bedrock and AWS profile, the agent types the space allows, which PR review
 * comments shep answers on its own (spec 124), which runtime actions it
 * runs on incidents without asking (spec 129), and docs first with its
 * documentation paths (spec 131).
 *
 * With no options it shows the settings and the environment they produce.
 */

import { Command, InvalidArgumentError } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import {
  ConfigureSpaceAgentUseCase,
  type SpaceAgentSettingsPatch,
} from '@/application/use-cases/spaces/configure-space-agent.use-case.js';
import {
  PrCommentTrigger,
  type AgentType,
  type RuntimeActionKind,
} from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { expandHome } from '../../paths.js';
import { report, runSpaceCommand } from './run-space-command.js';
import { parseAgentTypeList } from '../agent-option.js';
import { readRuntimeActionKindList } from '../incident/action-option.js';
import { renderSpaceConfig } from './config-view.js';

interface ConfigOptions {
  claudeConfigDir?: string;
  ghConfigDir?: string;
  gitName?: string;
  gitEmail?: string;
  awsProfile?: string;
  bedrock?: boolean;
  agents?: AgentType[];
  prComments?: PrCommentTrigger;
  resolveThreads?: boolean;
  autoActions?: string;
  docsFirst?: boolean;
  docsPaths?: string;
  clear?: string[];
}

/** `--pr-comments off|mention|all`, any case. */
function parsePrCommentTrigger(value: string): PrCommentTrigger {
  const trigger = Object.values(PrCommentTrigger).find(
    (candidate) => candidate.toLowerCase() === value.trim().toLowerCase()
  );
  if (!trigger) {
    throw new InvalidArgumentError(
      getCliI18n().t('cli:commands.space.config.badTrigger', {
        value,
        triggers: Object.values(PrCommentTrigger).join(', ').toLowerCase(),
      })
    );
  }
  return trigger;
}

/** `--clear` names and the settings they clear. */
const CLEARABLE: Record<string, keyof SpaceAgentSettingsPatch> = {
  'claude-config-dir': 'claudeConfigDir',
  'gh-config-dir': 'ghConfigDir',
  'git-name': 'gitAuthorName',
  'git-email': 'gitAuthorEmail',
  'aws-profile': 'awsProfile',
  bedrock: 'useBedrock',
  agents: 'allowedAgentTypes',
  'pr-comments': 'prCommentTrigger',
  'resolve-threads': 'prCommentResolveThreads',
  'auto-actions': 'autoRuntimeActions',
  'docs-first': 'docsFirst',
  'docs-paths': 'docsPaths',
};

function buildPatch(
  options: ConfigOptions,
  autoActions: RuntimeActionKind[] | undefined
): SpaceAgentSettingsPatch {
  const patch: SpaceAgentSettingsPatch = {};
  for (const name of options.clear ?? []) {
    (patch as Record<string, null>)[CLEARABLE[name]] = null;
  }
  if (options.claudeConfigDir !== undefined) {
    patch.claudeConfigDir = expandHome(options.claudeConfigDir);
  }
  if (options.ghConfigDir !== undefined) patch.ghConfigDir = expandHome(options.ghConfigDir);
  if (options.gitName !== undefined) patch.gitAuthorName = options.gitName;
  if (options.gitEmail !== undefined) patch.gitAuthorEmail = options.gitEmail;
  if (options.awsProfile !== undefined) patch.awsProfile = options.awsProfile;
  if (options.bedrock !== undefined) patch.useBedrock = options.bedrock;
  if (options.agents !== undefined) {
    patch.allowedAgentTypes = options.agents;
  }
  if (options.prComments !== undefined) patch.prCommentTrigger = options.prComments;
  if (options.resolveThreads !== undefined) patch.prCommentResolveThreads = options.resolveThreads;
  if (autoActions !== undefined) patch.autoRuntimeActions = autoActions;
  if (options.docsFirst !== undefined) patch.docsFirst = options.docsFirst;
  if (options.docsPaths !== undefined) {
    patch.docsPaths = options.docsPaths
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean);
  }
  return patch;
}

export function createConfigCommand(): Command {
  const t = getCliI18n().t;
  return new Command('config')
    .description(t('cli:commands.space.config.description'))
    .argument('<space>', t('cli:commands.space.spaceArg'))
    .option('--claude-config-dir <dir>', t('cli:commands.space.config.claudeOption'))
    .option('--gh-config-dir <dir>', t('cli:commands.space.config.ghOption'))
    .option('--git-name <name>', t('cli:commands.space.config.gitNameOption'))
    .option('--git-email <email>', t('cli:commands.space.config.gitEmailOption'))
    .option('--aws-profile <name>', t('cli:commands.space.config.awsProfileOption'))
    .option('--bedrock', t('cli:commands.space.config.bedrockOption'))
    .option('--no-bedrock', t('cli:commands.space.config.noBedrockOption'))
    .option('--agents <list>', t('cli:commands.space.config.agentsOption'), parseAgentTypeList)
    .option(
      '--pr-comments <trigger>',
      t('cli:commands.space.config.prCommentsOption'),
      parsePrCommentTrigger
    )
    .option('--resolve-threads', t('cli:commands.space.config.resolveThreadsOption'))
    .option('--no-resolve-threads', t('cli:commands.space.config.noResolveThreadsOption'))
    .option('--auto-actions <list>', t('cli:commands.space.config.autoActionsOption'))
    .option('--docs-first', t('cli:commands.space.config.docsFirstOption'))
    .option('--no-docs-first', t('cli:commands.space.config.noDocsFirstOption'))
    .option('--docs-paths <list>', t('cli:commands.space.config.docsPathsOption'))
    .option('--clear <fields...>', t('cli:commands.space.config.clearOption'))
    .addHelpText(
      'after',
      `
Fields for --clear: ${Object.keys(CLEARABLE).join(', ')}

Examples:
  $ shep space config acme                                     Show settings and their environment
  $ shep space config acme --gh-config-dir ~/.config/gh-acme   Use the Acme GitHub login
  $ shep space config acme --claude-config-dir ~/.claude-acme  Use the Acme Claude login
  $ shep space config acme --git-email me@acme.com --git-name "Me"
  $ shep space config acme --agents claude-code,cursor         Allow only these agents
  $ shep space config acme --pr-comments all --resolve-threads Answer every PR review comment
  $ shep space config acme --auto-actions restart              Restart workloads on incidents unasked
  $ shep space config acme --docs-first --docs-paths docs/,README.md  Write docs before code
  $ shep space config acme --clear agents bedrock              Back to inheriting the host`
    )
    .action((space: string, options: ConfigOptions) =>
      runSpaceCommand(async () => {
        const unknown = (options.clear ?? []).find((name) => !(name in CLEARABLE));
        if (unknown) {
          messages.error(t('cli:commands.space.config.badClear', { field: unknown }));
          process.exitCode = 1;
          return;
        }
        const autoActions = readRuntimeActionKindList(options.autoActions);
        if (!autoActions.ok) return;
        const patch = buildPatch(options, autoActions.value);
        const useCase = container.resolve(ConfigureSpaceAgentUseCase);
        if (Object.keys(patch).length === 0) {
          report(await useCase.show(space), (result) =>
            renderSpaceConfig(result.space, result.environment)
          );
          return;
        }
        report(await useCase.configure(space, patch), (result) => {
          messages.success(t('cli:commands.space.config.success', { name: result.space.name }));
          renderSpaceConfig(result.space, result.environment);
        });
      })
    );
}
