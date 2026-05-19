/**
 * ClaudeSettingsReconciler unit tests.
 *
 * Pure-functional merge of two `.claude/settings.json` payloads:
 *   - top-level keys deep-merge
 *   - hook arrays are unioned + deduped by canonical signature
 *   - shep entries take precedence on scalar conflicts
 *   - malformed inputs throw ClaudeSettingsMergeFailedError
 *   - inputs over the 1 MiB safety cap throw ClaudeSettingsMergeFailedError
 *
 * No filesystem, no subprocess — the reconciler must operate on already-parsed
 * JSON values only.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { ClaudeSettingsReconciler } from '@/infrastructure/services/filesystem/claude-settings-reconciler.service.js';
import { ClaudeSettingsMergeFailedError } from '@/domain/errors/claude-settings-merge-failed.error.js';

function makeHookEntry(matcher: string, command: string): unknown {
  return {
    matcher,
    hooks: [{ type: 'command', command }],
  };
}

describe('ClaudeSettingsReconciler', () => {
  const reconciler = new ClaudeSettingsReconciler();

  describe('empty inputs', () => {
    it('returns an empty object when both inputs are null', () => {
      expect(reconciler.mergeSettings(null, null)).toEqual({});
    });

    it('returns an empty object when both inputs are undefined', () => {
      expect(reconciler.mergeSettings(undefined, undefined)).toEqual({});
    });

    it('returns an empty object when both inputs are empty objects', () => {
      expect(reconciler.mergeSettings({}, {})).toEqual({});
    });
  });

  describe('one-sided inputs', () => {
    it('returns shep-only content when bedrock side is empty', () => {
      const before = {
        hooks: {
          SessionStart: [makeHookEntry('', 'shep-hook')],
        },
      };
      expect(reconciler.mergeSettings(before, {})).toEqual(before);
    });

    it('returns bedrock-only content when shep side is empty', () => {
      const after = {
        hooks: {
          SessionStart: [makeHookEntry('', 'bedrock-hook')],
        },
      };
      expect(reconciler.mergeSettings({}, after)).toEqual(after);
    });
  });

  describe('union of disjoint hook arrays', () => {
    it('preserves both entries when they do not overlap', () => {
      const before = {
        hooks: {
          SessionStart: [makeHookEntry('', 'shep-cmd')],
        },
      };
      const after = {
        hooks: {
          SessionStart: [makeHookEntry('', 'bedrock-cmd')],
        },
      };

      const merged = reconciler.mergeSettings(before, after) as {
        hooks: { SessionStart: { hooks: { command: string }[] }[] };
      };

      const commands = merged.hooks.SessionStart.map((entry) => entry.hooks[0].command);
      expect(commands).toEqual(expect.arrayContaining(['shep-cmd', 'bedrock-cmd']));
      expect(merged.hooks.SessionStart).toHaveLength(2);
    });

    it('merges different hook event keys independently', () => {
      const before = {
        hooks: {
          SessionStart: [makeHookEntry('', 'shep-start')],
        },
      };
      const after = {
        hooks: {
          SessionStop: [makeHookEntry('', 'bedrock-stop')],
        },
      };

      const merged = reconciler.mergeSettings(before, after) as {
        hooks: Record<string, unknown[]>;
      };

      expect(merged.hooks.SessionStart).toHaveLength(1);
      expect(merged.hooks.SessionStop).toHaveLength(1);
    });
  });

  describe('dedup by signature on overlap', () => {
    it('dedupes identical hook entries to a single instance', () => {
      const entry = makeHookEntry('', 'identical-cmd');
      const before = { hooks: { SessionStart: [entry] } };
      const after = { hooks: { SessionStart: [entry] } };

      const merged = reconciler.mergeSettings(before, after) as {
        hooks: { SessionStart: unknown[] };
      };

      expect(merged.hooks.SessionStart).toHaveLength(1);
    });

    it('treats key order as irrelevant when deduping', () => {
      const before = {
        hooks: {
          SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'x' }] }],
        },
      };
      // Same logical entry, just different key insertion order.
      const after = {
        hooks: {
          SessionStart: [{ hooks: [{ command: 'x', type: 'command' }], matcher: '' }],
        },
      };

      const merged = reconciler.mergeSettings(before, after) as {
        hooks: { SessionStart: unknown[] };
      };
      expect(merged.hooks.SessionStart).toHaveLength(1);
    });

    it('keeps shep entry first when overlap occurs (shep precedence)', () => {
      const entry = makeHookEntry('', 'cmd-shared');
      const before = { hooks: { SessionStart: [entry, makeHookEntry('', 'shep-only')] } };
      const after = { hooks: { SessionStart: [entry, makeHookEntry('', 'bedrock-only')] } };

      const merged = reconciler.mergeSettings(before, after) as {
        hooks: { SessionStart: { hooks: { command: string }[] }[] };
      };

      const commands = merged.hooks.SessionStart.map((e) => e.hooks[0].command);
      // Three unique entries total
      expect(merged.hooks.SessionStart).toHaveLength(3);
      // shep-only must come before bedrock-only in the union order
      expect(commands.indexOf('shep-only')).toBeLessThan(commands.indexOf('bedrock-only'));
    });
  });

  describe('non-hook keys', () => {
    it('deep-merges nested objects, with shep winning scalar conflicts', () => {
      const before = { env: { SHEP_KEY: '1', SHARED: 'shep' } };
      const after = { env: { BEDROCK_KEY: '2', SHARED: 'bedrock' } };

      expect(reconciler.mergeSettings(before, after)).toEqual({
        env: { SHEP_KEY: '1', BEDROCK_KEY: '2', SHARED: 'shep' },
      });
    });

    it('unions+dedupes generic arrays', () => {
      const before = { permissions: { allow: ['Bash(git status)'] } };
      const after = { permissions: { allow: ['Bash(git status)', 'Bash(ls)'] } };

      const merged = reconciler.mergeSettings(before, after) as {
        permissions: { allow: string[] };
      };

      expect(merged.permissions.allow).toEqual(['Bash(git status)', 'Bash(ls)']);
    });
  });

  describe('malformed inputs', () => {
    it('throws when before is not an object', () => {
      expect(() => reconciler.mergeSettings('nope' as unknown, {})).toThrow(
        ClaudeSettingsMergeFailedError
      );
    });

    it('throws when after is a JSON primitive', () => {
      expect(() => reconciler.mergeSettings({}, 42 as unknown)).toThrow(
        ClaudeSettingsMergeFailedError
      );
    });

    it('throws when a shared key has incompatible types (array vs object)', () => {
      const before = { hooks: [] as unknown[] };
      const after = { hooks: {} as Record<string, unknown> };
      expect(() => reconciler.mergeSettings(before, after)).toThrow(ClaudeSettingsMergeFailedError);
    });
  });

  describe('size guard', () => {
    it('throws when serialized input exceeds the 1 MiB safety cap', () => {
      const huge = { blob: 'x'.repeat(2 * 1024 * 1024) };
      expect(() => reconciler.mergeSettings(huge, {})).toThrow(ClaudeSettingsMergeFailedError);
    });
  });
});
