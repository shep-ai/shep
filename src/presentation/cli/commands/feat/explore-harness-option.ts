/**
 * `shep feat new --explore-harness [--explore-k <n>]` (spec 150): run this
 * feature's implement step in the self-learning Explore mode, whatever the
 * repository's learning mode. Offered only while the selfLearning flag is on.
 *
 * (`--explore` is a different thing: the Exploration build mode.)
 */

import type { Command } from 'commander';
import { MAX_EXPLORE_K, isValidExploreK } from '@/domain/harness-learning/learning-config.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { isFeatureFlagOn } from '../feature-flag-gate.js';
import { parseNumberOption } from '../number-option.js';

const NEW = 'cli:commands.feat.new';

export interface ExploreHarnessOptions {
  exploreHarness?: boolean;
  exploreK?: string;
}

/** The fields this option adds to the create-feature input. */
export interface ExploreHarnessInput {
  exploreHarness?: true;
  exploreK?: number;
}

/** Adds the options while the selfLearning flag is on; leaves `cmd` alone otherwise. */
export function addExploreHarnessOptions(cmd: Command): Command {
  if (!isFeatureFlagOn('selfLearning')) return cmd;
  const t = getCliI18n().t;
  return cmd
    .option('--explore-harness', t(`${NEW}.exploreHarnessOption`))
    .option('--explore-k <n>', t(`${NEW}.exploreKOption`, { max: MAX_EXPLORE_K }));
}

function refuse(text: string): null {
  messages.error(text);
  process.exitCode = 1;
  return null;
}

/** The create-input fields, or null after printing why the options are refused. */
export function readExploreHarnessOptions(
  options: ExploreHarnessOptions
): ExploreHarnessInput | null {
  const t = getCliI18n().t;
  if (!options.exploreHarness) {
    return options.exploreK === undefined ? {} : refuse(t(`${NEW}.exploreKWithoutHarness`));
  }
  const k = parseNumberOption('--explore-k', options.exploreK);
  if (!k.ok) return null;
  if (k.value === undefined) return { exploreHarness: true };
  if (!isValidExploreK(k.value)) {
    return refuse(t(`${NEW}.invalidExploreK`, { max: MAX_EXPLORE_K, value: options.exploreK }));
  }
  return { exploreHarness: true, exploreK: k.value };
}
