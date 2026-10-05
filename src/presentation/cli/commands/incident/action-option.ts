/**
 * Incident enums on the command line (spec 129), any case. Each `read*`
 * returns the value to pass on, or { ok: false } after printing why the text
 * is refused — so a bad value exits 1 instead of throwing from a parser.
 */

import { IncidentSeverity, RuntimeActionKind } from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export type EnumOption<T> = { ok: true; value?: T } | { ok: false };

function findMember<T extends string>(members: Record<string, T>, value: string): T | undefined {
  const wanted = value.trim().toLowerCase();
  return Object.values(members).find((candidate) => candidate.toLowerCase() === wanted);
}

function listed(members: Record<string, string>): string {
  return Object.values(members).join(', ').toLowerCase();
}

function refuse(key: string, values: Record<string, string>): { ok: false } {
  messages.error(getCliI18n().t(key, values));
  process.exitCode = 1;
  return { ok: false };
}

export function readSeverity(value: string | undefined): EnumOption<IncidentSeverity> {
  if (value === undefined) return { ok: true };
  const severity = findMember(IncidentSeverity, value);
  return severity
    ? { ok: true, value: severity }
    : refuse('cli:commands.incident.badSeverity', {
        value: value.trim(),
        severities: listed(IncidentSeverity),
      });
}

export function readRuntimeActionKind(value: string): EnumOption<RuntimeActionKind> {
  const kind = findMember(RuntimeActionKind, value);
  return kind
    ? { ok: true, value: kind }
    : refuse('cli:commands.incident.badAction', {
        value: value.trim(),
        actions: listed(RuntimeActionKind),
      });
}

/** A comma-separated list of action kinds; an empty list clears the setting. */
export function readRuntimeActionKindList(
  value: string | undefined
): EnumOption<RuntimeActionKind[]> {
  if (value === undefined) return { ok: true };
  const kinds: RuntimeActionKind[] = [];
  for (const part of value
    .split(',')
    .map((text) => text.trim())
    .filter(Boolean)) {
    const kind = readRuntimeActionKind(part);
    if (!kind.ok) return kind;
    if (kind.value) kinds.push(kind.value);
  }
  return { ok: true, value: kinds };
}
