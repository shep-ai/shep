/**
 * Effort Configuration Command
 *
 * Sets the default reasoning effort new feature runs are pinned with. Agents
 * that support effort (Claude Code: `--effort`) receive it; others ignore it.
 * Unset means the agent's own default.
 *
 * Usage:
 *   shep settings effort          # Interactive picker
 *   shep settings effort high     # Set the default effort
 *   shep settings effort --clear  # Back to the agent's own default
 */

import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { SetDefaultEffortUseCase } from '@/application/use-cases/settings/set-default-effort.use-case.js';
import {
  getSettings,
  resetSettings,
  initializeSettings,
} from '@/infrastructure/services/settings.service.js';
import type { AgentEffort } from '@/domain/generated/output.js';
import { AGENT_EFFORT_LEVELS, parseAgentEffort } from '@/domain/shared/agent-effort.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

/** Sentinel choice for "no effort configured" in the interactive picker. */
const AGENT_DEFAULT_CHOICE = '__agent-default__';

export interface EffortCommandOptions {
  clear?: boolean;
}

export type EffortChange =
  | { kind: 'prompt' }
  | { kind: 'set'; effort: AgentEffort }
  | { kind: 'clear' };

/**
 * Decide what an invocation asks for. Exported for unit testing: the argument
 * algebra is the only logic here, and it should not require spawning a CLI.
 */
export function resolveEffortChange(
  level: string | undefined,
  options: EffortCommandOptions
): EffortChange {
  if (level !== undefined && options.clear) {
    throw new Error(getCliI18n().t('cli:commands.settings.effort.clearConflict'));
  }
  if (options.clear) return { kind: 'clear' };
  if (level === undefined) return { kind: 'prompt' };

  const effort = parseAgentEffort(level);
  if (!effort) {
    throw new Error(
      getCliI18n().t('cli:commands.settings.effort.invalid', {
        level,
        levels: AGENT_EFFORT_LEVELS.join(', '),
      })
    );
  }
  return { kind: 'set', effort };
}

async function promptForEffort(current: AgentEffort | undefined): Promise<AgentEffort | undefined> {
  const t = getCliI18n().t;
  const picked = await select<string>({
    message: t('cli:commands.settings.effort.selectPrompt'),
    choices: [
      { name: t('cli:commands.settings.effort.agentDefault'), value: AGENT_DEFAULT_CHOICE },
      ...AGENT_EFFORT_LEVELS.map((level) => ({ name: level, value: level })),
    ],
    default: current ?? AGENT_DEFAULT_CHOICE,
  });
  return parseAgentEffort(picked);
}

/**
 * Create the effort configuration command.
 */
export function createEffortCommand(): Command {
  const t = getCliI18n().t;
  return new Command('effort')
    .description(t('cli:commands.settings.effort.description'))
    .argument('[level]', t('cli:commands.settings.effort.levelArgument'))
    .option('--clear', t('cli:commands.settings.effort.clearOption'))
    .addHelpText(
      'after',
      `
Levels: ${AGENT_EFFORT_LEVELS.join(', ')}

Examples:
  $ shep settings effort            Interactive picker
  $ shep settings effort medium     Set the default effort
  $ shep settings effort --clear    Use the agent's own default`
    )
    .action(async (level: string | undefined, options: EffortCommandOptions) => {
      try {
        const change = resolveEffortChange(level, options);
        const next =
          change.kind === 'set'
            ? change.effort
            : change.kind === 'clear'
              ? undefined
              : await promptForEffort(getSettings().models.effort);

        const updated = await container
          .resolve(SetDefaultEffortUseCase)
          .execute({ effort: next ?? null });
        resetSettings();
        initializeSettings(updated);

        messages.success(
          next
            ? t('cli:commands.settings.effort.success', { effort: next })
            : t('cli:commands.settings.effort.cleared')
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (err.message.includes('force closed')) {
          messages.info(t('cli:commands.settings.effort.cancelled'));
          return;
        }
        messages.error(t('cli:commands.settings.effort.failed'), err);
        process.exitCode = 1;
      }
    });
}
