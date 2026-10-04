/**
 * Where Claude Code keeps its login, settings and transcripts.
 *
 * Claude Code honours CLAUDE_CONFIG_DIR, and a space can set it to give its
 * repositories their own Claude login (spec 121), so anything shep reads from
 * that directory must resolve it the same way instead of assuming ~/.claude.
 * In a feature worker the variable is the run's space setting.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export function claudeConfigDir(env: Record<string, string | undefined> = process.env): string {
  const configured = env.CLAUDE_CONFIG_DIR?.trim();
  if (configured) return configured;
  return join(homedir(), '.claude');
}
