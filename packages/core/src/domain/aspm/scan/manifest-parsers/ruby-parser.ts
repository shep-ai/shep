/**
 * Ruby parser — Gemfile.lock (preferred — pinned) + Gemfile fallback.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

const LOCK_GEM_LINE = /^\s{4}([a-z0-9_.-]+)\s+\(([^)]+)\)/gim;

export const gemfileLockParser: ManifestParserDescriptor = {
  id: 'parser.ruby.gemfile-lock',
  matches: (path) => pathEndsWith(path, 'Gemfile.lock'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    LOCK_GEM_LINE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LOCK_GEM_LINE.exec(file.content)) !== null) {
      const name = m[1]!;
      const version = m[2]!;
      drafts.push({
        ecosystem: 'gem',
        name,
        version,
        purl: buildPurl('gem', name, version),
        type: 'library',
      });
    }
    return drafts;
  },
};

const GEMFILE_LINE = /^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm;

export const gemfileParser: ManifestParserDescriptor = {
  id: 'parser.ruby.gemfile',
  matches: (path) => pathEndsWith(path, 'Gemfile'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    GEMFILE_LINE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GEMFILE_LINE.exec(file.content)) !== null) {
      const name = m[1]!;
      const version = m[2]?.replace(/^[\^~>=<]+\s*/, '');
      drafts.push({
        ecosystem: 'gem',
        name,
        version,
        purl: buildPurl('gem', name, version),
        type: 'library',
      });
    }
    return drafts;
  },
};
