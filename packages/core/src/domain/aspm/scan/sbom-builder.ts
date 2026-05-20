/**
 * Pure-domain SbomBuilder (Phase 11, task-67).
 *
 * Walks every input file through every matching ManifestParser, then dedupes
 * components by `(ecosystem, name, version)`. Output is the same
 * SbomComponentDraft[] shape the existing CycloneDX adapter emits, so the
 * SCA stage can hand it directly to the OSV.dev adapter.
 *
 * The builder is intentionally parser-agnostic: adding a new ecosystem is
 * a one-file change (new ManifestParserDescriptor + index registration) —
 * no edits to the builder itself.
 */

import type { ScanInputFile } from './scan-input';
import type { SbomComponentDraft } from '../../../application/ports/output/services/sbom-port.interface';
import {
  MANIFEST_PARSERS,
  type ManifestComponentDraft,
  type ManifestParserDescriptor,
} from './manifest-parsers';

export interface BuildSbomResult {
  /** Components emitted in `(ecosystem, name, version)` lexicographic order. */
  components: SbomComponentDraft[];
  /** Per-parser counts, useful for the ScanStage.componentsCount roll-up. */
  parsersInvoked: { parserId: string; matchedFiles: number; emittedComponents: number }[];
}

function dedupKey(c: ManifestComponentDraft): string {
  return `${c.ecosystem}|${c.name}|${c.version ?? ''}`;
}

function toSbomComponent(c: ManifestComponentDraft): SbomComponentDraft {
  return {
    bomRef: c.purl ?? `${c.ecosystem}:${c.name}@${c.version ?? ''}`,
    name: c.name,
    version: c.version,
    purl: c.purl,
    type: c.type,
  };
}

export function buildSbom(files: readonly ScanInputFile[]): BuildSbomResult {
  const componentsByKey = new Map<string, ManifestComponentDraft>();
  const stats = new Map<
    string,
    { parserId: string; matchedFiles: number; emittedComponents: number }
  >();

  for (const parser of MANIFEST_PARSERS) {
    stats.set(parser.id, { parserId: parser.id, matchedFiles: 0, emittedComponents: 0 });
  }

  for (const file of files) {
    const matchedParsers: ManifestParserDescriptor[] = MANIFEST_PARSERS.filter((p) =>
      p.matches(file.path)
    );
    for (const parser of matchedParsers) {
      const entry = stats.get(parser.id)!;
      entry.matchedFiles += 1;
      let emitted = 0;
      for (const draft of parser.parse(file)) {
        const key = dedupKey(draft);
        if (!componentsByKey.has(key)) {
          componentsByKey.set(key, draft);
          emitted += 1;
        }
      }
      entry.emittedComponents += emitted;
    }
  }

  const components = [...componentsByKey.values()]
    .sort((a, b) => dedupKey(a).localeCompare(dedupKey(b)))
    .map(toSbomComponent);

  return {
    components,
    parsersInvoked: [...stats.values()].filter((s) => s.matchedFiles > 0),
  };
}
