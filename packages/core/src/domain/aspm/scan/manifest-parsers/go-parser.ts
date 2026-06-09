/**
 * Go parser — go.mod (require blocks + single-line requires).
 *
 * Skip go.sum: hash-only entries duplicate go.mod identities. Parsing
 * indirect deps from go.sum is left for a future enhancement.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

const SINGLE_REQUIRE = /^require\s+([^\s(][^\s]*)\s+(v[^\s]+)/gm;
const BLOCK_LINE = /^\s+([^\s]+)\s+([^\s]+)(?:\s+\/\/\s*indirect)?\s*$/gm;
const REQUIRE_BLOCK = /require\s*\(([^)]*)\)/g;

export const goModParser: ManifestParserDescriptor = {
  id: 'parser.go.mod',
  matches: (path) => pathEndsWith(path, 'go.mod'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    const seen = new Set<string>();

    const single = file.content.matchAll(SINGLE_REQUIRE);
    for (const m of single) {
      const name = m[1]!;
      const version = m[2]!;
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drafts.push({
        ecosystem: 'golang',
        name,
        version,
        purl: buildPurl('golang', name, version),
        type: 'library',
      });
    }

    REQUIRE_BLOCK.lastIndex = 0;
    let block: RegExpExecArray | null;
    while ((block = REQUIRE_BLOCK.exec(file.content)) !== null) {
      const body = block[1] ?? '';
      BLOCK_LINE.lastIndex = 0;
      let line: RegExpExecArray | null;
      while ((line = BLOCK_LINE.exec(body)) !== null) {
        const name = line[1]!;
        const version = line[2]!;
        const key = `${name}@${version}`;
        if (seen.has(key)) continue;
        seen.add(key);
        drafts.push({
          ecosystem: 'golang',
          name,
          version,
          purl: buildPurl('golang', name, version),
          type: 'library',
        });
      }
    }

    return drafts;
  },
};
