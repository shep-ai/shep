/**
 * Feature Flags Command (spec 135)
 *
 * Lists every feature flag with its state, default and a one-line
 * description, and turns one on or off — the CLI side of the web
 * feature-flags view. Both go through the List/SetFeatureFlag use cases.
 *
 * Usage:
 *   shep settings flags                  # List every flag
 *   shep settings flags enable <flag>    # Turn a flag on
 *   shep settings flags disable <flag>   # Turn a flag off
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import {
  ListFeatureFlagsUseCase,
  type FeatureFlagState,
} from '@/application/use-cases/settings/list-feature-flags.use-case.js';
import { SetFeatureFlagUseCase } from '@/application/use-cases/settings/set-feature-flag.use-case.js';
import { FeatureFlagGroup } from '@/domain/generated/output.js';
import { initializeSettings, resetSettings } from '@/infrastructure/services/settings.service.js';
import { colors, fmt, messages } from '../../ui/index.js';

const GROUP_TITLES: Record<FeatureFlagGroup, string> = {
  [FeatureFlagGroup.Platform]: 'Platform',
  [FeatureFlagGroup.SoftwareFactory]: 'Software factory',
  [FeatureFlagGroup.Experimental]: 'Experimental',
};

function onOff(enabled: boolean): string {
  return enabled ? 'on' : 'off';
}

function printFlags(flags: readonly FeatureFlagState[]): void {
  const keyWidth = Math.max(...flags.map((flag) => flag.key.length));
  for (const group of Object.values(FeatureFlagGroup)) {
    const inGroup = flags.filter((flag) => flag.group === group);
    if (inGroup.length === 0) continue;
    messages.newline();
    console.log(fmt.heading(GROUP_TITLES[group]));
    for (const flag of inGroup) {
      const state = flag.enabled ? colors.success('on ') : colors.muted('off');
      const note = colors.muted(`(default ${onOff(flag.defaultEnabled)})`);
      console.log(`  ${state}  ${flag.key.padEnd(keyWidth)}  ${flag.description} ${note}`);
    }
  }
  messages.newline();
}

function createToggleCommand(verb: 'enable' | 'disable'): Command {
  const enabled = verb === 'enable';
  return new Command(verb)
    .description(`Turn a feature flag ${onOff(enabled)}`)
    .argument('<flag>', 'Flag name, as listed by `shep settings flags`')
    .action(async (flag: string) => {
      try {
        const updated = await container
          .resolve(SetFeatureFlagUseCase)
          .execute({ key: flag, enabled });
        resetSettings();
        initializeSettings(updated);
        messages.success(`Feature flag "${flag}" is ${onOff(enabled)}.`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        messages.error(
          `Failed to turn "${flag}" ${onOff(enabled)}: ${reason}. \`shep settings flags\` lists every flag.`
        );
        process.exitCode = 1;
      }
    });
}

export function createFlagsCommand(): Command {
  return new Command('flags')
    .description('List feature flags and turn them on or off')
    .addHelpText(
      'after',
      `
Examples:
  $ shep settings flags                  List every flag, its state and default
  $ shep settings flags enable aspm      Turn ASPM on
  $ shep settings flags disable factory  Hide the software-factory status page`
    )
    .addCommand(createToggleCommand('enable'))
    .addCommand(createToggleCommand('disable'))
    .action(async () => {
      try {
        printFlags(await container.resolve(ListFeatureFlagsUseCase).execute());
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list feature flags', err);
        process.exitCode = 1;
      }
    });
}
