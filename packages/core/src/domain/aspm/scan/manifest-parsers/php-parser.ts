/**
 * PHP parser — composer.lock (pinned) + composer.json fallback.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

interface ComposerLock {
  packages?: { name?: string; version?: string }[];
  'packages-dev'?: { name?: string; version?: string }[];
}

interface ComposerJson {
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
}

export const composerLockParser: ManifestParserDescriptor = {
  id: 'parser.php.composer-lock',
  matches: (path) => pathEndsWith(path, 'composer.lock'),
  parse: (file) => {
    try {
      const lock = JSON.parse(file.content) as ComposerLock;
      const drafts: ManifestComponentDraft[] = [];
      for (const bucket of [lock.packages, lock['packages-dev']]) {
        if (!bucket) continue;
        for (const pkg of bucket) {
          if (!pkg.name) continue;
          drafts.push({
            ecosystem: 'composer',
            name: pkg.name,
            version: pkg.version,
            purl: buildPurl('composer', pkg.name, pkg.version),
            type: 'library',
          });
        }
      }
      return drafts;
    } catch {
      return [];
    }
  },
};

export const composerJsonParser: ManifestParserDescriptor = {
  id: 'parser.php.composer-json',
  matches: (path) => pathEndsWith(path, 'composer.json'),
  parse: (file) => {
    try {
      const json = JSON.parse(file.content) as ComposerJson;
      const drafts: ManifestComponentDraft[] = [];
      for (const bucket of [json.require, json['require-dev']]) {
        if (!bucket) continue;
        for (const [name, range] of Object.entries(bucket)) {
          if (name === 'php') continue;
          const version = range.replace(/^[\^~>=<]+\s*/, '').trim();
          drafts.push({
            ecosystem: 'composer',
            name,
            version: version.length > 0 ? version : undefined,
            purl: buildPurl('composer', name, version),
            type: 'library',
          });
        }
      }
      return drafts;
    } catch {
      return [];
    }
  },
};
