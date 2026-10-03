/** Formatting shared by the harness views (spec 119). */
import { ChunkVisibility, PermissionEffect } from '@shepai/core/domain/generated/output';

export function formatTokens(n: number | undefined): string {
  if (n === undefined) return '–';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function formatCost(cost: number | undefined): string {
  return cost === undefined ? '–' : `$${cost.toFixed(4)}`;
}

/** Pill classes per visibility level. */
export const VISIBILITY_CLASS: Record<ChunkVisibility, string> = {
  [ChunkVisibility.Hidden]: 'bg-muted text-muted-foreground',
  [ChunkVisibility.Short]: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  [ChunkVisibility.Long]: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  [ChunkVisibility.Full]: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
};

export const EFFECT_CLASS: Record<PermissionEffect, string> = {
  [PermissionEffect.Allow]: 'text-emerald-600',
  [PermissionEffect.Ask]: 'text-amber-600',
  [PermissionEffect.Deny]: 'text-red-600',
};

export const VISIBILITY_LEVELS: readonly ChunkVisibility[] = [
  ChunkVisibility.Short,
  ChunkVisibility.Long,
  ChunkVisibility.Full,
];
