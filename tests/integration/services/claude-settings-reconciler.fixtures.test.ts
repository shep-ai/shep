// @vitest-environment node
/**
 * ClaudeSettingsReconciler — fixture-based integration tests.
 *
 * Loads four realistic `.claude/settings.json` snapshots from
 * `tests/fixtures/claude-settings/` and drives them through the reconciler:
 *
 *   - shep-only.json          — what shep wrote before `bedrock init` ran.
 *   - bedrock-only.json       — what bedrock would write into an empty file.
 *   - shep-and-bedrock.json   — the post-`bedrock init` state when both
 *                                writers contributed entries.
 *   - malformed-bedrock.json  — a bedrock payload whose `hooks` key is an
 *                                array instead of the expected object shape;
 *                                must trip the typed merge error.
 *
 * The reconciler's contract is verified end-to-end using the parsed
 * fixture payloads — no inline JSON literals, so the fixtures stay the
 * single source of truth for "what realistic input looks like".
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';

import { ClaudeSettingsReconciler } from '@/infrastructure/services/filesystem/claude-settings-reconciler.service.js';
import { ClaudeSettingsMergeFailedError } from '@/domain/errors/claude-settings-merge-failed.error.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../../fixtures/claude-settings');

async function loadFixture(name: string): Promise<unknown> {
  const file = path.join(FIXTURES_PATH, `${name}.json`);
  const raw = await fs.readFile(file, 'utf-8');
  return JSON.parse(raw);
}

interface HookEntry {
  matcher: string;
  hooks: { type: string; command: string }[];
}
interface SettingsShape {
  hooks?: { SessionStart?: HookEntry[]; SessionStop?: HookEntry[] };
  permissions?: { allow?: string[] };
}

function commandsFor(settings: SettingsShape, event: 'SessionStart' | 'SessionStop'): string[] {
  return (settings.hooks?.[event] ?? []).flatMap((entry) => entry.hooks.map((h) => h.command));
}

describe('ClaudeSettingsReconciler — fixture scenarios', () => {
  const reconciler = new ClaudeSettingsReconciler();

  it('shep-only: merging shep snapshot with an empty bedrock-side preserves shep entries', async () => {
    const shepOnly = (await loadFixture('shep-only')) as SettingsShape;

    const merged = reconciler.mergeSettings(shepOnly, {}) as SettingsShape;

    expect(commandsFor(merged, 'SessionStart')).toEqual(['shep skill inject --session-start']);
    expect(commandsFor(merged, 'SessionStop')).toEqual(['shep skill inject --session-stop']);
    expect(merged.permissions?.allow).toEqual(['Bash(shep:*)']);
  });

  it('bedrock-only: merging an empty shep snapshot with bedrock-only output preserves bedrock entries', async () => {
    const bedrockOnly = (await loadFixture('bedrock-only')) as SettingsShape;

    const merged = reconciler.mergeSettings({}, bedrockOnly) as SettingsShape;

    expect(commandsFor(merged, 'SessionStart')).toEqual(['bedrock hook session-start']);
    expect(commandsFor(merged, 'SessionStop')).toEqual(['bedrock hook session-stop']);
  });

  it('shep + bedrock: union of hook arrays, deduped, no data loss, shep entries appear first', async () => {
    const shepOnly = (await loadFixture('shep-only')) as SettingsShape;
    const shepAndBedrock = (await loadFixture('shep-and-bedrock')) as SettingsShape;

    const merged = reconciler.mergeSettings(shepOnly, shepAndBedrock) as SettingsShape;

    const startCommands = commandsFor(merged, 'SessionStart');
    const stopCommands = commandsFor(merged, 'SessionStop');

    // Union semantics: both shep and bedrock entries present.
    expect(startCommands).toEqual(
      expect.arrayContaining(['shep skill inject --session-start', 'bedrock hook session-start'])
    );
    expect(stopCommands).toEqual(
      expect.arrayContaining(['shep skill inject --session-stop', 'bedrock hook session-stop'])
    );

    // Dedupe: shep entry appears once even though it is present in both inputs.
    expect(startCommands.filter((c) => c === 'shep skill inject --session-start')).toHaveLength(1);
    expect(stopCommands.filter((c) => c === 'shep skill inject --session-stop')).toHaveLength(1);

    // Shep precedence: shep's entry comes before bedrock's in the unioned order.
    expect(startCommands.indexOf('shep skill inject --session-start')).toBeLessThan(
      startCommands.indexOf('bedrock hook session-start')
    );

    // Permissions union: both Bash globs preserved.
    expect(merged.permissions?.allow).toEqual(
      expect.arrayContaining(['Bash(shep:*)', 'Bash(bedrock:*)'])
    );
  });

  it('malformed bedrock payload raises ClaudeSettingsMergeFailedError with parse details', async () => {
    const shepOnly = await loadFixture('shep-only');
    const malformed = await loadFixture('malformed-bedrock');

    let thrown: unknown;
    try {
      reconciler.mergeSettings(shepOnly, malformed);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ClaudeSettingsMergeFailedError);
    const err = thrown as ClaudeSettingsMergeFailedError;
    // Reason must reference the offending key and describe the type mismatch.
    expect(err.reason).toMatch(/hooks/);
    expect(err.reason.toLowerCase()).toMatch(/array|object|incompatible/);
    expect(err.code).toBe('CLAUDE_SETTINGS_MERGE_FAILED');
    expect(err.remediation).toMatch(/\.claude\/settings\.json/);
  });
});
