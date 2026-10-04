/**
 * `--every <minutes>` on commands that schedule recurring work (tracker sync
 * rules, knowledge sources). The use case checks the range; this only turns
 * the text into a whole number, or refuses it.
 */

import { messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

const WHOLE_NUMBER = /^\d+$/;

export type EveryOption = { ok: true; intervalMinutes?: number } | { ok: false };

/** The interval to pass on, or { ok: false } after printing why `value` is refused. */
export function parseEveryOption(value: string | undefined): EveryOption {
  if (value === undefined) return { ok: true };
  if (!WHOLE_NUMBER.test(value.trim())) {
    messages.error(getCliI18n().t('cli:commands.everyOption.invalid', { value }));
    process.exitCode = 1;
    return { ok: false };
  }
  return { ok: true, intervalMinutes: Number.parseInt(value, 10) };
}
