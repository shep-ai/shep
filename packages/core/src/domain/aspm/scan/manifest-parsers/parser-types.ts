/**
 * Shared types for manifest parsers (Phase 11, task-67).
 *
 * Each parser receives a single matching file and returns a list of
 * component drafts. The builder is responsible for: file selection by
 * pattern, dedup by ecosystem+name+version, and merging multi-ecosystem
 * results into a single SbomDraft consumable by IngestSbomUseCase.
 *
 * Parsers are pure-domain (no fs / no path imports). They take strings,
 * return arrays. The orchestrator (infrastructure) handles file walking.
 */

import type { ScanInputFile } from '../scan-input';

export interface ManifestComponentDraft {
  /** Ecosystem tag used to build purl-like identifiers (npm, pypi, go, ...). */
  ecosystem: string;
  /** Package name as printed in the manifest (e.g. `lodash`, `requests`). */
  name: string;
  /** Version string when present in the manifest / lockfile. */
  version?: string;
  /** When present, the parser surfaces a Package URL spec string. */
  purl?: string;
  /** Best-effort component type — `library` by default, `container` for images. */
  type?: 'library' | 'application' | 'container' | 'framework';
}

export type ManifestParser = (file: ScanInputFile) => ManifestComponentDraft[];

export interface ManifestParserDescriptor {
  /** Stable identifier for the parser (e.g. `parser.npm.package-lock`). */
  id: string;
  /** Filename or glob suffix that selects which files this parser receives. */
  matches: (path: string) => boolean;
  parse: ManifestParser;
}

export function pathEndsWith(path: string, suffix: string): boolean {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  return lower === suffix.toLowerCase() || lower.endsWith(`/${suffix.toLowerCase()}`);
}

export function buildPurl(ecosystem: string, name: string, version?: string): string {
  const base = `pkg:${ecosystem}/${name}`;
  return version ? `${base}@${version}` : base;
}
