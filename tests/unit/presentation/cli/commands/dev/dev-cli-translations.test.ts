/**
 * `commands.dev` translation parity.
 *
 * FR-24 says every new user-visible string must exist in every locale, and a
 * missing key is invisible in English — i18next silently falls back, so the
 * only thing that catches it is a test. This compares the full leaf-key set of
 * `commands.dev` in each locale against English, and also asserts that every
 * `{{placeholder}}` survived translation, since a dropped one prints a literal
 * hole in the middle of a sentence.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TRANSLATIONS_DIR = resolve(import.meta.dirname, '../../../../../../translations');
const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'he', 'pt', 'ru', 'uk'] as const;
const BASE_LOCALE = 'en';

type Tree = Record<string, unknown>;

function devBlock(locale: string): Tree {
  const raw = readFileSync(resolve(TRANSLATIONS_DIR, locale, 'cli.json'), 'utf-8');
  const parsed = JSON.parse(raw) as { commands: Record<string, Tree> };
  return parsed.commands.dev;
}

/** Every leaf path in a nested translation object, e.g. `plan.show.title`. */
function leafPaths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null ? leafPaths(value as Tree, path) : [path];
  });
}

function leafAt(tree: Tree, path: string): string {
  return path.split('.').reduce<unknown>((node, key) => (node as Tree)[key], tree) as string;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
}

const basePaths = leafPaths(devBlock(BASE_LOCALE)).sort();

describe('commands.dev translations', () => {
  it('declares the keys the CLI actually asks for', () => {
    for (const path of [
      'description',
      'options.app',
      'target.conflict',
      'state.installing',
      'start.description',
      'stop.notRunning',
      'status.commandLabel',
      'logs.followOption',
      'plan.staleHint',
      'plan.source.manual',
      'plan.show.empty',
      'plan.set.executionNotice',
      'plan.clear.cleared',
    ]) {
      expect(basePaths).toContain(path);
    }
  });

  for (const locale of LOCALES.filter((candidate) => candidate !== BASE_LOCALE)) {
    describe(locale, () => {
      const block = devBlock(locale);

      it('has exactly the same key set as English', () => {
        expect(leafPaths(block).sort()).toEqual(basePaths);
      });

      it('keeps every interpolation placeholder', () => {
        for (const path of basePaths) {
          expect(placeholders(leafAt(block, path))).toEqual(
            placeholders(leafAt(devBlock(BASE_LOCALE), path))
          );
        }
      });

      it('translates the strings rather than copying English', () => {
        const translated = basePaths.filter(
          (path) => leafAt(block, path) !== leafAt(devBlock(BASE_LOCALE), path)
        );
        // A handful of leaves legitimately match (`url`, `port`, `framework`),
        // so this asserts the block was translated, not that every leaf differs.
        expect(translated.length).toBeGreaterThan(basePaths.length / 2);
      });
    });
  }
});
