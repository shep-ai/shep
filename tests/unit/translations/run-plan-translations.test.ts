/**
 * Key parity for the run-plan UI namespace.
 *
 * A missing key does not fail loudly at runtime — i18next falls back to
 * rendering the raw key path, so a non-English user would see
 * `runPlan.fields.command` where a label belongs. This test is the only thing
 * that catches that before a release.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TRANSLATIONS_DIR = resolve(import.meta.dirname, '../../../translations');
const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'he', 'pt', 'ru', 'uk'] as const;
const NAMESPACE = 'runPlan';

function loadWeb(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(TRANSLATIONS_DIR, locale, 'web.json'), 'utf-8'));
}

/** Every leaf path in an object, dot-joined — `fields.command`, `source.label`. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix === '' ? key : `${prefix}.${key}`)
  );
}

describe('run-plan web translations', () => {
  const englishKeys = leafPaths(loadWeb('en')[NAMESPACE]).sort();

  it('English defines the namespace with a non-trivial set of keys', () => {
    expect(englishKeys.length).toBeGreaterThan(20);
  });

  for (const locale of LOCALES) {
    it(`${locale}/web.json defines exactly the English ${NAMESPACE} keys`, () => {
      const namespace = loadWeb(locale)[NAMESPACE];
      expect(namespace, `${locale} is missing the "${NAMESPACE}" namespace`).toBeDefined();
      expect(leafPaths(namespace).sort()).toEqual(englishKeys);
    });

    it(`${locale}/web.json has no blank ${NAMESPACE} values`, () => {
      const namespace = loadWeb(locale)[NAMESPACE] as Record<string, unknown>;
      for (const path of leafPaths(namespace)) {
        const value = path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], namespace);
        expect(typeof value, `${locale}: ${path} is not a string`).toBe('string');
        expect((value as string).trim(), `${locale}: ${path} is blank`).not.toBe('');
      }
    });
  }

  it('every locale except English actually translates the visible labels', () => {
    // Guards against a locale being added by copying the English block.
    const english = loadWeb('en')[NAMESPACE] as { title: string };
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const localized = loadWeb(locale)[NAMESPACE] as { title: string };
      expect(localized.title, `${locale} left runPlan.title untranslated`).not.toBe(english.title);
    }
  });
});
