/**
 * Table Formatting Utilities
 *
 * Provides clean text-based rendering for structured CLI output.
 * Uses alignment, whitespace, and colors instead of box-drawing borders.
 *
 * @module tables
 */

import type { Settings } from '@/domain/generated/output.js';
import { colors } from './colors.js';
import pc from 'picocolors';

/** Shown when no effort is configured: the agent CLI uses its own default. */
const AGENT_DEFAULT_EFFORT_LABEL = 'agent default';

export interface DatabaseMeta {
  path: string;
  size: string;
}

/**
 * Table formatter for CLI output
 */
export class TableFormatter {
  private static readonly LABEL_WIDTH = 15;

  /**
   * Creates a clean, formatted settings display string.
   */
  static createSettingsTable(settings: unknown, dbMeta?: DatabaseMeta): string {
    const s = settings as Settings;
    const lines: string[] = [];

    lines.push(`  ${pc.bold(colors.brand('Settings'))}`);
    lines.push('');

    // Agent
    lines.push(
      ...TableFormatter.section('Agent', [
        ['Type', s.agent.type],
        ['Model', s.models.default],
        ['Effort', s.models.effort ?? AGENT_DEFAULT_EFFORT_LABEL],
        ['Auth', s.agent.authMethod],
        ...(s.agent.token ? [['Token', '••••••••'] as [string, string | undefined]] : []),
      ])
    );

    // Environment
    lines.push(
      ...TableFormatter.section('Environment', [
        ['Editor', s.environment.defaultEditor],
        ['Shell', s.environment.shellPreference],
      ])
    );

    // Database
    if (dbMeta) {
      lines.push(
        ...TableFormatter.section('Database', [
          ['Path', dbMeta.path],
          ['Size', dbMeta.size],
        ])
      );
    }

    return lines.join('\n');
  }

  private static section(title: string, rows: [string, string | undefined][]): string[] {
    const lines: string[] = [];
    lines.push(`  ${pc.bold(title)}`);
    for (const [label, value] of rows) {
      const paddedLabel = label.padEnd(TableFormatter.LABEL_WIDTH);
      if (value === undefined || value === null) {
        lines.push(`    ${colors.muted(paddedLabel)}${pc.italic(colors.muted('(not set)'))}`);
      } else {
        lines.push(`    ${colors.muted(paddedLabel)}${value}`);
      }
    }
    lines.push('');
    return lines;
  }
}
