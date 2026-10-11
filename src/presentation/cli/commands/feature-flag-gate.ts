/**
 * Gates a command group behind feature flags (spec 135).
 *
 * While none of the flags is on, the group is hidden from `--help` and any
 * invocation — a subcommand or the bare group — prints how to turn the flag
 * on and exits 1. A flag the stored settings do not carry counts as its
 * default value.
 */

import type { Command } from 'commander';
import { getSettings, hasSettings } from '@/infrastructure/services/settings.service.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import type { FeatureFlagKey } from '@/domain/shared/feature-flag-catalog.js';
import { messages } from '../ui/index.js';

/** A flag's value, or its default when the stored settings do not carry it. */
export function isFeatureFlagOn(flag: FeatureFlagKey): boolean {
  const stored = hasSettings() ? getSettings().featureFlags?.[flag] : undefined;
  return stored ?? createDefaultSettings().featureFlags![flag];
}

export function gateByFeatureFlag(
  cmd: Command,
  flags: FeatureFlagKey | readonly FeatureFlagKey[]
): Command {
  const required: readonly FeatureFlagKey[] = typeof flags === 'string' ? [flags] : flags;
  if (required.some(isFeatureFlagOn)) return cmd;

  const block = (): never => {
    const enable = required.map((flag) => `shep settings flags enable ${flag}`).join(' or ');
    messages.error(`\`shep ${cmd.name()}\` is turned off. Turn it on with \`${enable}\`.`);
    process.exit(1);
  };
  (cmd as unknown as { _hidden: boolean })._hidden = true;
  // `preAction` only fires once a subcommand's own action runs, so the bare
  // group gets its own action too — otherwise Commander prints its help.
  cmd.hook('preAction', block);
  cmd.action(block);
  return cmd;
}
