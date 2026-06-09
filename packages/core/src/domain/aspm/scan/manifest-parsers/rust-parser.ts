/**
 * Rust parser — Cargo.lock (preferred, has pinned versions) + Cargo.toml.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

const CARGO_LOCK_PACKAGE =
  /\[\[package\]\][^[]*?name\s*=\s*"([^"]+)"[^[]*?version\s*=\s*"([^"]+)"/g;

export const cargoLockParser: ManifestParserDescriptor = {
  id: 'parser.rust.cargo-lock',
  matches: (path) => pathEndsWith(path, 'Cargo.lock'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    CARGO_LOCK_PACKAGE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CARGO_LOCK_PACKAGE.exec(file.content)) !== null) {
      const name = m[1]!;
      const version = m[2]!;
      drafts.push({
        ecosystem: 'cargo',
        name,
        version,
        purl: buildPurl('cargo', name, version),
        type: 'library',
      });
    }
    return drafts;
  },
};

const CARGO_TOML_DEP_SECTION =
  /\[(?:dependencies|dev-dependencies|build-dependencies)\]([\s\S]*?)(?=\n\[|$)/g;
const TOML_DEP_LINE = /^([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]+)"|\{\s*version\s*=\s*"([^"]+)")/gm;

export const cargoTomlParser: ManifestParserDescriptor = {
  id: 'parser.rust.cargo-toml',
  matches: (path) => pathEndsWith(path, 'Cargo.toml'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    const blocks = file.content.matchAll(CARGO_TOML_DEP_SECTION);
    for (const block of blocks) {
      const body = block[1] ?? '';
      TOML_DEP_LINE.lastIndex = 0;
      let line: RegExpExecArray | null;
      while ((line = TOML_DEP_LINE.exec(body)) !== null) {
        const name = line[1]!;
        const version = (line[2] ?? line[3] ?? '').replace(/^[\^~>=<]+/, '').trim();
        drafts.push({
          ecosystem: 'cargo',
          name,
          version: version.length > 0 ? version : undefined,
          purl: buildPurl('cargo', name, version),
          type: 'library',
        });
      }
    }
    return drafts;
  },
};
