/**
 * Adaptive Model Selection Command
 *
 * Shows and configures per-task model tier routing. With the mode on, the
 * implement node runs each planned task on the model matching its complexity
 * instead of running everything on the pinned model — which stays the ceiling,
 * so this can only ever spend less.
 *
 * Usage:
 *   shep settings adaptive-models                       # Show the resolved plan
 *   shep settings adaptive-models --enable              # Turn routing on
 *   shep settings adaptive-models --disable             # Turn routing off
 *   shep settings adaptive-models --low claude-haiku-4-5
 *   shep settings adaptive-models --clear               # Drop all tier overrides
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { UpdateSettingsUseCase } from '@/application/use-cases/settings/update-settings.use-case.js';
import { GetAdaptiveModelPlanUseCase } from '@/application/use-cases/settings/get-adaptive-model-plan.use-case.js';
import {
  getSettings,
  resetSettings,
  initializeSettings,
} from '@/infrastructure/services/settings.service.js';
import type { AdaptiveModelConfig } from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';

/** Shown in place of an unset tier override. */
const DERIVED = '(derived)';

export interface AdaptiveModelsCommandOptions {
  enable?: boolean;
  disable?: boolean;
  high?: string;
  medium?: string;
  low?: string;
  clear?: boolean;
}

/**
 * Apply CLI options to the stored adaptive config.
 *
 * Returns `null` when the invocation is read-only (no option supplied) and the
 * next config otherwise. An explicit empty string for a tier clears that
 * override so the tier goes back to being derived from the pinned model.
 *
 * Exported for unit testing — the option algebra is the only logic here worth
 * pinning down, and it should not require spawning a CLI to check.
 */
export function buildNextAdaptiveConfig(
  current: AdaptiveModelConfig | undefined,
  options: AdaptiveModelsCommandOptions
): AdaptiveModelConfig | null {
  const touchesTiers =
    options.high !== undefined ||
    options.medium !== undefined ||
    options.low !== undefined ||
    options.clear === true;
  const touchesToggle = options.enable === true || options.disable === true;
  if (!touchesTiers && !touchesToggle) return null;

  if (options.enable && options.disable) {
    throw new Error('--enable and --disable cannot be used together');
  }

  const next: AdaptiveModelConfig = options.clear
    ? { enabled: current?.enabled ?? false }
    : { ...current, enabled: current?.enabled ?? false };

  if (options.enable) next.enabled = true;
  if (options.disable) next.enabled = false;

  const applyTier = (key: 'high' | 'medium' | 'low', value: string | undefined): void => {
    if (value === undefined) return;
    const trimmed = value.trim();
    if (trimmed) next[key] = trimmed;
    else delete next[key];
  };
  applyTier('high', options.high);
  applyTier('medium', options.medium);
  applyTier('low', options.low);

  return next;
}

/**
 * Create the adaptive model selection command.
 */
export function createAdaptiveModelsCommand(): Command {
  return new Command('adaptive-models')
    .description('Configure per-task adaptive model tier selection')
    .option('--enable', 'Route each task to a model matching its complexity')
    .option('--disable', 'Run every task on the pinned model')
    .option('--high <model>', 'Model for High-complexity tasks (empty string to derive)')
    .option('--medium <model>', 'Model for Medium-complexity tasks (empty string to derive)')
    .option('--low <model>', 'Model for Low-complexity tasks (empty string to derive)')
    .option('--clear', 'Remove all tier overrides and derive them from the pinned model')
    .addHelpText(
      'after',
      `
The pinned model (shep settings model) is a ceiling: a tier never resolves to a
more capable model than the pin, and tiers stay inside the pin's model family.

Examples:
  $ shep settings adaptive-models
  $ shep settings adaptive-models --enable
  $ shep settings adaptive-models --low claude-haiku-4-5
  $ shep settings adaptive-models --clear`
    )
    .action(async (options: AdaptiveModelsCommandOptions) => {
      try {
        const settings = getSettings();
        const next = buildNextAdaptiveConfig(settings.models.adaptive, options);

        if (next !== null) {
          settings.models.adaptive = next;
          const updated = await container.resolve(UpdateSettingsUseCase).execute(settings);
          resetSettings();
          initializeSettings(updated);
          messages.success('Adaptive model selection updated.');
        }

        await printPlan();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to configure adaptive model selection', err);
        process.exitCode = 1;
      }
    });
}

/** Print the currently resolved tier plan. */
async function printPlan(): Promise<void> {
  const plan = await container.resolve(GetAdaptiveModelPlanUseCase).execute();

  messages.info(`adaptive routing: ${plan.enabled ? 'enabled' : 'disabled'}`);
  messages.info(`agent:            ${plan.agentType}`);
  messages.info(`pinned model:     ${plan.baseModel} (ceiling)`);
  messages.info(`High tasks   →    ${plan.tiers.high}   ${plan.overrides.high ?? DERIVED}`);
  messages.info(`Medium tasks →    ${plan.tiers.medium}   ${plan.overrides.medium ?? DERIVED}`);
  messages.info(`Low tasks    →    ${plan.tiers.low}   ${plan.overrides.low ?? DERIVED}`);

  if (plan.degradesToSingleModel) {
    messages.info(
      `"${plan.baseModel}" has no known lower tier in this agent's catalog, so every task ` +
        `would run on it. Pin a model with a smaller sibling, or set an explicit --low model.`
    );
  }
}
