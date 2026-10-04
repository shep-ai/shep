/**
 * Decimal options (`--revenue 4000`, `--hours 6.5`, `--confidence 0.7`).
 * The use case checks the range; this only turns the text into a number, or
 * refuses it.
 */

import { messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

export type NumberOption = { ok: true; value?: number } | { ok: false };

/** The number to pass on, or { ok: false } after printing why `value` is refused. */
export function parseNumberOption(option: string, value: string | undefined): NumberOption {
  if (value === undefined) return { ok: true };
  if (!DECIMAL.test(value.trim())) {
    messages.error(getCliI18n().t('cli:commands.numberOption.invalid', { option, value }));
    process.exitCode = 1;
    return { ok: false };
  }
  return { ok: true, value: Number.parseFloat(value) };
}
