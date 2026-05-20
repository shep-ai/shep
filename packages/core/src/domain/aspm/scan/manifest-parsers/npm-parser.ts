/**
 * npm parser — package-lock.json (npm v3+) + package.json fallback.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

interface PackageLockV3 {
  packages?: Record<string, { version?: string; name?: string }>;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function safeParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function stripVersionRange(range: string): string {
  return range.replace(/^[\^~>=<]+/, '').trim();
}

export const npmPackageLockParser: ManifestParserDescriptor = {
  id: 'parser.npm.package-lock',
  matches: (path) => pathEndsWith(path, 'package-lock.json'),
  parse: (file) => {
    const lock = safeParse<PackageLockV3>(file.content);
    if (!lock?.packages) return [];
    const drafts: ManifestComponentDraft[] = [];
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (key === '') continue;
      const name = entry.name ?? key.replace(/^.*node_modules\//, '');
      const version = entry.version;
      drafts.push({
        ecosystem: 'npm',
        name,
        version,
        purl: buildPurl('npm', name, version),
        type: 'library',
      });
    }
    return drafts;
  },
};

export const npmPackageJsonParser: ManifestParserDescriptor = {
  id: 'parser.npm.package-json',
  matches: (path) => pathEndsWith(path, 'package.json'),
  parse: (file) => {
    const pkg = safeParse<PackageJson>(file.content);
    if (!pkg) return [];
    const drafts: ManifestComponentDraft[] = [];
    const buckets = [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
      pkg.optionalDependencies,
    ];
    for (const bucket of buckets) {
      if (!bucket) continue;
      for (const [name, range] of Object.entries(bucket)) {
        const version = stripVersionRange(range);
        drafts.push({
          ecosystem: 'npm',
          name,
          version: version.length > 0 ? version : undefined,
          purl: buildPurl('npm', name, version),
          type: 'library',
        });
      }
    }
    return drafts;
  },
};
